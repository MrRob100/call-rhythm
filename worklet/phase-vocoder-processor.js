/**
 * WSOLA (Waveform Similarity Overlap-Add) AudioWorklet processor.
 * Time-stretches audio without changing pitch.
 *
 * stretchRatio > 1.0 = slower playback (stretches time)
 * stretchRatio < 1.0 = faster playback (compresses time)
 */
class PhaseVocoderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'stretchRatio',
      defaultValue: 1.0,
      minValue: 0.5,
      maxValue: 2.0,
      automationRate: 'k-rate'
    }];
  }

  constructor() {
    super();
    this.FRAME_SIZE = 2048;
    this.HOP_ANALYSIS = 512;
    this.MAX_SEEK = 128;

    // Per-channel state initialised lazily
    this.channels = [];
    this.initialised = false;
  }

  /** Build Hann window of length FRAME_SIZE */
  _buildWindow() {
    const w = new Float32Array(this.FRAME_SIZE);
    for (let i = 0; i < this.FRAME_SIZE; i++) {
      w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (this.FRAME_SIZE - 1)));
    }
    return w;
  }

  /** Initialise ring buffers for a single channel */
  _initChannel() {
    // Input ring buffer — large enough for several frames
    const inSize = this.FRAME_SIZE * 8;
    // Output ring buffer — needs to be large to accommodate stretch
    const outSize = this.FRAME_SIZE * 8;
    return {
      inBuf: new Float32Array(inSize),
      inSize,
      inWrite: 0,       // write cursor into inBuf
      inRead: 0,        // how many samples consumed total (virtual)
      analysisPos: 0,   // position in input stream (virtual)
      outBuf: new Float32Array(outSize),
      outSize,
      outWrite: 0,      // write cursor into outBuf
      outRead: 0,       // read cursor into outBuf
      outAvailable: 0,  // samples ready to read
      inAvailable: 0    // samples available in input ring
    };
  }

  /** Write samples into the input ring buffer */
  _pushInput(ch, data, len) {
    for (let i = 0; i < len; i++) {
      ch.inBuf[ch.inWrite % ch.inSize] = data[i];
      ch.inWrite++;
    }
    ch.inAvailable += len;
  }

  /** Read one sample from input ring at virtual position */
  _readInput(ch, pos) {
    // Oldest sample still in buffer
    const oldest = ch.inWrite - ch.inSize;
    if (pos < oldest || pos >= ch.inWrite) return 0;
    return ch.inBuf[pos % ch.inSize];
  }

  /** Cross-correlation search for best overlap offset */
  _findBestOffset(ch, nominalPos) {
    const win = this._window;
    let bestCorr = -Infinity;
    let bestOff = 0;

    for (let off = -this.MAX_SEEK; off <= this.MAX_SEEK; off++) {
      let corr = 0;
      // Sample a subset for speed (every 4th sample)
      for (let i = 0; i < this.FRAME_SIZE; i += 4) {
        corr += this._readInput(ch, nominalPos + off + i) * win[i];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestOff = off;
      }
    }
    return bestOff;
  }

  /** Run WSOLA: consume input, produce stretched output for one channel */
  _processChannel(ch, stretchRatio) {
    const hopSynthesis = Math.round(this.HOP_ANALYSIS * stretchRatio);
    const win = this._window;

    // Process as many frames as possible
    while (ch.inAvailable >= this.FRAME_SIZE + this.MAX_SEEK * 2 &&
           ch.outAvailable < ch.outSize - this.FRAME_SIZE * 2) {

      // Find best splice point around analysisPos
      const bestOff = this._findBestOffset(ch, ch.analysisPos);
      const readPos = ch.analysisPos + bestOff;

      // Overlap-add windowed frame into output buffer
      for (let i = 0; i < this.FRAME_SIZE; i++) {
        const sample = this._readInput(ch, readPos + i) * win[i];
        ch.outBuf[(ch.outWrite + i) % ch.outSize] += sample;
      }

      // Advance output write by synthesis hop
      ch.outWrite += hopSynthesis;
      ch.outAvailable += hopSynthesis;

      // Advance analysis position by analysis hop
      ch.analysisPos += this.HOP_ANALYSIS;

      // Reclaim consumed input
      const consumed = ch.analysisPos - (ch.inWrite - ch.inAvailable);
      if (consumed > 0) {
        ch.inAvailable -= consumed;
      }
    }
  }

  /** Pull samples from output ring buffer */
  _pullOutput(ch, dest, len) {
    for (let i = 0; i < len; i++) {
      if (ch.outAvailable > 0) {
        dest[i] = ch.outBuf[ch.outRead % ch.outSize];
        // Clear after reading so overlap-add works for next pass
        ch.outBuf[ch.outRead % ch.outSize] = 0;
        ch.outRead++;
        ch.outAvailable--;
      } else {
        dest[i] = 0;
      }
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const stretchRatio = parameters.stretchRatio[0];
    const numOutputChannels = output.length;
    const blockSize = output[0].length; // typically 128

    // Lazy init
    if (!this.initialised) {
      this._window = this._buildWindow();
      this.initialised = true;
    }

    // Ensure we have enough channel state objects
    const numInputChannels = input.length;
    while (this.channels.length < numOutputChannels) {
      this.channels.push(this._initChannel());
    }

    // Push input into ring buffers
    for (let c = 0; c < numInputChannels; c++) {
      this._pushInput(this.channels[c], input[c], blockSize);
    }
    // Mono input -> copy to second channel if stereo output
    if (numInputChannels === 1 && numOutputChannels > 1) {
      this._pushInput(this.channels[1], input[0], blockSize);
    }

    // Run WSOLA on each channel
    for (let c = 0; c < numOutputChannels; c++) {
      this._processChannel(this.channels[c], stretchRatio);
    }

    // Pull output
    for (let c = 0; c < numOutputChannels; c++) {
      this._pullOutput(this.channels[c], output[c], blockSize);
    }

    return true;
  }
}

registerProcessor('phase-vocoder-processor', PhaseVocoderProcessor);
