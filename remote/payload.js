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

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'playTrack') {
      playTrack(msg.file, msg.bpm);
    } else if (msg.action === 'stopTrack') {
      stopBeat();
      console.log(TAG, 'Beat stopped');
    }
  });

  console.log(TAG, 'Beat engine loaded —', new Date().toLocaleTimeString());
})();
