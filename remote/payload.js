(() => {
  const TAG = '[Call Rhythm]';
  const REVERB_DURATION = 2;   // seconds
  const DECAY_RATE = 3;
  const DRY_GAIN = 0.6;
  const WET_GAIN = 0.4;

  let audioCtx = null;
  let convolver = null;
  const processed = new WeakSet();

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new AudioContext();
      convolver = audioCtx.createConvolver();
      convolver.buffer = createImpulseResponse();
      console.log(TAG, 'AudioContext created');
    }
    return audioCtx;
  }

  function createImpulseResponse() {
    const ctx = getAudioContext();
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * REVERB_DURATION;
    const buffer = ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, DECAY_RATE);
      }
    }
    return buffer;
  }

  function applyReverb(el) {
    if (processed.has(el)) return;
    processed.add(el);

    const ctx = getAudioContext();

    let source;
    try {
      source = ctx.createMediaElementSource(el);
    } catch (e) {
      console.warn(TAG, 'Cannot capture', el.tagName, '—', e.message);
      return;
    }

    const dry = ctx.createGain();
    dry.gain.value = DRY_GAIN;

    const wet = ctx.createGain();
    wet.gain.value = WET_GAIN;

    source.connect(dry);
    dry.connect(ctx.destination);

    source.connect(convolver);
    convolver.connect(wet);
    wet.connect(ctx.destination);

    console.log(TAG, 'Reverb applied to', el.tagName);
  }

  function resumeIfSuspended() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => console.log(TAG, 'AudioContext resumed'));
    }
  }

  function scanAndApply() {
    const elements = document.querySelectorAll('audio, video');
    elements.forEach(applyReverb);
  }

  // Watch for dynamically added media elements
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
          applyReverb(node);
        }
        // Also check children of added subtrees
        if (node.querySelectorAll) {
          node.querySelectorAll('audio, video').forEach(applyReverb);
        }
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Resume AudioContext on first user interaction (autoplay policy)
  ['click', 'keydown', 'touchstart'].forEach((evt) => {
    document.addEventListener(evt, resumeIfSuspended, { once: true });
  });

  // Initial scan
  scanAndApply();

  console.log(TAG, 'Reverb engine loaded —', new Date().toLocaleTimeString());
})();
