(() => {
  const TAG = '[Call Rhythm]';
  const TRACKS_BASE = 'https://mrrob100.github.io/call-rhythm/tracks/';

  let audioCtx = null;

  // Beat playback state
  let beatSource = null;
  let beatGain = null;
  let beatBuffer = null;
  let currentBeatFile = null;
  let currentBpm = null;
  let beatStartTime = null;
  let beatLogCount = 0;
  let beatLogTimer = null;

  // Call audio capture state
  let workletReady = false;
  const processedElements = new WeakSet();
  const capturedMedia = []; // { source, syncNode, gain } per element

  function getBeatInfo() {
    if (beatStartTime === null || !audioCtx || !currentBpm) return null;
    const elapsed = audioCtx.currentTime - beatStartTime;
    const beatDuration = 60 / currentBpm;
    return {
      phase: (elapsed % beatDuration) / beatDuration,
      beat: Math.floor(elapsed / beatDuration),
      bpm: currentBpm
    };
  }

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new AudioContext();
      console.log(TAG, 'AudioContext created');
    }
    return audioCtx;
  }

  function resumeIfSuspended() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => console.log(TAG, 'AudioContext resumed'));
    }
  }

  // Resume AudioContext on first user interaction (autoplay policy)
  ['click', 'keydown', 'touchstart'].forEach((evt) => {
    document.addEventListener(evt, resumeIfSuspended, { once: true });
  });

  // --- Beat playback ---
  function stopBeat() {
    if (beatSource) {
      try { beatSource.stop(); } catch (_) {}
      beatSource.disconnect();
      beatSource = null;
    }
    if (beatGain) {
      beatGain.disconnect();
      beatGain = null;
    }
    beatStartTime = null;
    clearInterval(beatLogTimer);
    chrome.storage.local.remove(['beatStartWallClock', 'beatBpm']);

    // Tell all worklets to stop syncing
    capturedMedia.forEach(m => {
      m.syncNode.port.postMessage({ type: 'beatStop' });
    });
  }

  async function playTrack(file, bpm) {
    const ctx = getAudioContext();
    stopBeat();

    // Fetch & decode (cache if same file)
    if (file !== currentBeatFile || !beatBuffer) {
      console.log(TAG, 'Fetching track:', file);
      const resp = await fetch(TRACKS_BASE + file);
      const arrayBuf = await resp.arrayBuffer();
      beatBuffer = await ctx.decodeAudioData(arrayBuf);
      currentBeatFile = file;
    }

    currentBpm = bpm;

    beatGain = ctx.createGain();
    beatGain.gain.value = 0.3;
    beatGain.connect(ctx.destination);

    beatSource = ctx.createBufferSource();
    beatSource.buffer = beatBuffer;
    beatSource.loop = true;
    beatSource.connect(beatGain);
    beatSource.start();
    beatStartTime = ctx.currentTime;

    // Store wall-clock anchor for popup animation
    chrome.storage.local.set({
      beatStartWallClock: Date.now(),
      beatBpm: bpm
    });

    // Send beat timing to all active worklets
    capturedMedia.forEach(m => {
      m.syncNode.port.postMessage({
        type: 'beatTiming',
        bpm: currentBpm,
        beatStartTime
      });
    });

    // Log first 8 beats to console for verification
    beatLogCount = 0;
    clearInterval(beatLogTimer);
    const beatMs = (60 / bpm) * 1000;
    beatLogTimer = setInterval(() => {
      if (beatLogCount >= 8) { clearInterval(beatLogTimer); return; }
      const info = getBeatInfo();
      if (info) console.log(TAG, `Beat #${info.beat} phase=${info.phase.toFixed(2)}`);
      beatLogCount++;
    }, beatMs);

    console.log(TAG, 'Beat playing:', file, '@', bpm, 'bpm');
  }

  // --- Call audio capture ---
  async function ensureWorklet() {
    if (workletReady) return;
    const ctx = getAudioContext();
    const url = chrome.runtime.getURL('worklet/beat-sync-processor.js');
    await ctx.audioWorklet.addModule(url);
    workletReady = true;
    console.log(TAG, 'Beat-sync worklet loaded');
  }

  async function captureCallAudio(el) {
    if (processedElements.has(el)) return;
    processedElements.add(el);

    try {
      await ensureWorklet();
      const ctx = getAudioContext();

      const source = ctx.createMediaElementSource(el);
      const syncNode = new AudioWorkletNode(ctx, 'beat-sync-processor');
      const gain = ctx.createGain();

      // Restore saved call volume
      const data = await new Promise(resolve =>
        chrome.storage.local.get({ callVolume: 1.0 }, resolve)
      );
      gain.gain.value = data.callVolume;

      source.connect(syncNode);
      syncNode.connect(gain);
      gain.connect(ctx.destination);

      // If beat is already playing, send timing immediately
      if (beatStartTime !== null && currentBpm) {
        syncNode.port.postMessage({
          type: 'beatTiming',
          bpm: currentBpm,
          beatStartTime
        });
      }

      capturedMedia.push({ source, syncNode, gain });
      console.log(TAG, 'Call audio captured from', el.tagName);
    } catch (err) {
      console.warn(TAG, 'Could not capture', el.tagName, ':', err.message);
    }
  }

  function scanForMedia() {
    const elements = document.querySelectorAll('audio, video');
    elements.forEach(el => captureCallAudio(el));
  }

  // Scan existing elements
  scanForMedia();

  // Watch for dynamically added media elements
  const mediaObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
          captureCallAudio(node);
        }
        // Also check children of added subtrees
        if (node.querySelectorAll) {
          node.querySelectorAll('audio, video').forEach(el => captureCallAudio(el));
        }
      }
    }
  });
  mediaObserver.observe(document.documentElement, { childList: true, subtree: true });

  // --- Message handler ---
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'playTrack') {
      playTrack(msg.file, msg.bpm);
    } else if (msg.action === 'stopTrack') {
      stopBeat();
      console.log(TAG, 'Beat stopped');
    } else if (msg.action === 'setCallVolume') {
      capturedMedia.forEach(m => {
        m.gain.gain.value = msg.value;
      });
    }
  });

  // Sync volume when value changes in storage (e.g. popup reopened)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.callVolume && capturedMedia.length) {
      capturedMedia.forEach(m => {
        m.gain.gain.value = changes.callVolume.newValue;
      });
    }
  });

  console.log(TAG, 'Beat engine loaded —', new Date().toLocaleTimeString());
})();
