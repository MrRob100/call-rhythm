/**
 * Beat-Aware Silence Padding AudioWorklet.
 *
 * Detects silences in call audio and extends them so the next word
 * lands on a beat boundary. No pitch change, no heavy DSP.
 *
 * States: PASSTHROUGH → PADDING → PASSTHROUGH
 *         PASSTHROUGH → CATCHING_UP → PASSTHROUGH
 */
class BeatSyncProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Ring buffer — 4 seconds at 48 kHz per channel
    this.RING_SIZE = 192000;
    this.BLOCK = 128;

    // Silence detection
    this.RMS_THRESHOLD = 0.01;       // ~-40 dB
    this.SILENCE_CONFIRM = 3;        // consecutive silent blocks to confirm
    this.SPEECH_CONFIRM = 2;         // consecutive speech blocks to exit

    // State machine
    this.STATE_PASSTHROUGH = 0;
    this.STATE_PADDING = 1;
    this.STATE_CATCHING_UP = 2;

    this.state = this.STATE_PASSTHROUGH;
    this.silenceCount = 0;
    this.speechCount = 0;
    this.padRemaining = 0;
    this.drift = 0;                  // accumulated padding samples
    this.CATCHUP_EXTRA = 256;        // extra samples to skip per block when catching up
    this.MAX_DRIFT = 2.0;            // seconds — triggers catch-up

    // Beat timing (received via MessagePort)
    this.bpm = 0;
    this.beatStartTime = 0;
    this.beatActive = false;

    // Per-channel ring buffers (lazily initialised)
    this.channels = [];
    this.initialised = false;

    // MessagePort listener
    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'beatTiming') {
        this.bpm = msg.bpm;
        this.beatStartTime = msg.beatStartTime;
        this.beatActive = true;
      } else if (msg.type === 'beatStop') {
        this.beatActive = false;
        this.bpm = 0;
        // Return to passthrough, discard any drift
        this.state = this.STATE_PASSTHROUGH;
        this.drift = 0;
        this.padRemaining = 0;
        this.silenceCount = 0;
        this.speechCount = 0;
      }
    };
  }

  _initChannel() {
    return {
      ring: new Float32Array(this.RING_SIZE),
      writePos: 0,
      readPos: 0
    };
  }

  _rms(data, length) {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / length);
  }

  _timeToNextBeat() {
    if (!this.beatActive || this.bpm <= 0) return Infinity;
    const beatDuration = 60 / this.bpm;
    const elapsed = currentTime - this.beatStartTime;
    const phase = elapsed - Math.floor(elapsed / beatDuration) * beatDuration;
    return beatDuration - phase;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const numChannels = output.length;
    const blockSize = output[0].length;

    // Lazy init channels
    if (!this.initialised) {
      for (let c = 0; c < numChannels; c++) {
        this.channels.push(this._initChannel());
      }
      this.initialised = true;
    }
    // Grow if needed
    while (this.channels.length < numChannels) {
      this.channels.push(this._initChannel());
    }

    // Write input into ring buffers
    const numInput = input.length;
    for (let c = 0; c < numInput; c++) {
      const ch = this.channels[c];
      for (let i = 0; i < blockSize; i++) {
        ch.ring[ch.writePos % this.RING_SIZE] = input[c][i];
        ch.writePos++;
      }
    }
    // Mono input → duplicate to extra channels
    if (numInput === 1 && numChannels > 1) {
      const ch = this.channels[1];
      for (let i = 0; i < blockSize; i++) {
        ch.ring[ch.writePos % this.RING_SIZE] = input[0][i];
        ch.writePos++;
      }
    }

    // Silence detection on first channel's input
    const isSilent = this._rms(input[0], blockSize) < this.RMS_THRESHOLD;

    if (isSilent) {
      this.silenceCount = Math.min(this.silenceCount + 1, this.SILENCE_CONFIRM + 1);
      this.speechCount = 0;
    } else {
      this.speechCount = Math.min(this.speechCount + 1, this.SPEECH_CONFIRM + 1);
      this.silenceCount = 0;
    }

    const confirmedSilence = this.silenceCount >= this.SILENCE_CONFIRM;
    const confirmedSpeech = this.speechCount >= this.SPEECH_CONFIRM;

    // State machine
    switch (this.state) {
      case this.STATE_PASSTHROUGH: {
        if (confirmedSilence && this.beatActive) {
          const driftSec = this.drift / sampleRate;

          // Check if we should catch up
          if (driftSec >= this.MAX_DRIFT) {
            this.state = this.STATE_CATCHING_UP;
            break;
          }

          // Check if we should pad to next beat
          const ttb = this._timeToNextBeat();
          if (ttb < 0.5 && ttb > 0.02) {
            this.padRemaining = Math.round(ttb * sampleRate);
            this.state = this.STATE_PADDING;
          }
        }
        break;
      }

      case this.STATE_PADDING: {
        if (confirmedSpeech || this.padRemaining <= 0) {
          this.state = this.STATE_PASSTHROUGH;
          this.silenceCount = 0;
        }
        break;
      }

      case this.STATE_CATCHING_UP: {
        if (confirmedSpeech || this.drift <= sampleRate * 0.01) {
          this.state = this.STATE_PASSTHROUGH;
          this.silenceCount = 0;
        }
        break;
      }
    }

    // Output based on state
    switch (this.state) {
      case this.STATE_PASSTHROUGH: {
        // Normal: read blockSize samples from ring
        for (let c = 0; c < numChannels; c++) {
          const ch = this.channels[c];
          for (let i = 0; i < blockSize; i++) {
            output[c][i] = ch.ring[ch.readPos % this.RING_SIZE];
            ch.readPos++;
          }
        }
        break;
      }

      case this.STATE_PADDING: {
        // Output zeros, freeze readPos
        const padThisBlock = Math.min(this.padRemaining, blockSize);
        for (let c = 0; c < numChannels; c++) {
          for (let i = 0; i < blockSize; i++) {
            output[c][i] = 0;
          }
        }
        this.padRemaining -= padThisBlock;
        this.drift += padThisBlock;
        break;
      }

      case this.STATE_CATCHING_UP: {
        // Output zeros, advance readPos faster to reduce drift
        const skip = Math.min(this.CATCHUP_EXTRA, this.drift);
        for (let c = 0; c < numChannels; c++) {
          const ch = this.channels[c];
          // Skip extra samples
          ch.readPos += skip;
          // Then read normal block
          for (let i = 0; i < blockSize; i++) {
            output[c][i] = 0;
          }
        }
        this.drift -= skip;
        break;
      }
    }

    return true;
  }
}

registerProcessor('beat-sync-processor', BeatSyncProcessor);
