const trackSelect = document.getElementById('track-select');
const playBtn = document.getElementById('play-btn');
const beatSection = document.getElementById('beat-section');
const bpmDisplay = document.getElementById('bpm-display');
const beatBarFill = document.getElementById('beat-bar-fill');
const callVolSlider = document.getElementById('callvol-slider');
const callVolDisplay = document.getElementById('callvol-display');

let tracks = [];
let playing = false;
let animFrame = null;
let beatAnchor = null; // { wallClock, bpm }

// --- Track selection ---
fetch('tracks/index.json')
  .then((r) => r.json())
  .then((list) => {
    tracks = list;
    tracks.forEach((t, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = t.name;
      trackSelect.appendChild(opt);
    });

    // Restore saved selection and play state
    chrome.storage.local.get(
      { selectedTrack: 0, beatPlaying: false, beatStartWallClock: null, beatBpm: null,
        callVolume: 1.0 },
      (data) => {
        trackSelect.value = data.selectedTrack;
        playing = data.beatPlaying;
        updatePlayBtn();
        if (playing && data.beatStartWallClock && data.beatBpm) {
          startBeatAnimation(data.beatStartWallClock, data.beatBpm);
        }
        callVolSlider.value = data.callVolume;
        callVolDisplay.textContent = Math.round(data.callVolume * 100) + '%';
      }
    );
  });

trackSelect.addEventListener('change', () => {
  chrome.storage.local.set({ selectedTrack: Number(trackSelect.value) });

  // If currently playing, switch to the new track
  if (playing) {
    sendToTab('playTrack');
  }
});

playBtn.addEventListener('click', () => {
  playing = !playing;
  updatePlayBtn();
  chrome.storage.local.set({ beatPlaying: playing });

  if (playing) {
    sendToTab('playTrack');
    // Small delay so payload.js has time to write the wall clock anchor
    setTimeout(() => {
      chrome.storage.local.get({ beatStartWallClock: null, beatBpm: null }, (data) => {
        if (data.beatStartWallClock && data.beatBpm) {
          startBeatAnimation(data.beatStartWallClock, data.beatBpm);
        }
      });
    }, 200);
  } else {
    sendToTab('stopTrack');
    stopBeatAnimation();
  }
});

function updatePlayBtn() {
  playBtn.textContent = playing ? 'Stop' : 'Play';
}

function sendToTab(action) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const track = tracks[trackSelect.value];
    if (!track && action === 'playTrack') return;

    const msg = action === 'playTrack'
      ? { action, file: track.file, bpm: track.bpm }
      : { action };

    chrome.tabs.sendMessage(tabs[0].id, msg);
  });
}

// --- Beat animation ---
function startBeatAnimation(wallClock, bpm) {
  beatAnchor = { wallClock, bpm };
  beatSection.style.display = 'block';
  bpmDisplay.textContent = bpm + ' BPM';
  animateBeat();
}

function stopBeatAnimation() {
  beatAnchor = null;
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = null;
  beatSection.style.display = 'none';
  beatBarFill.style.width = '0%';
}

function animateBeat() {
  if (!beatAnchor) return;
  const elapsed = (Date.now() - beatAnchor.wallClock) / 1000;
  const beatDuration = 60 / beatAnchor.bpm;
  const phase = (elapsed % beatDuration) / beatDuration;

  // Sharp rise then decay — gives a "pulse" feel
  const brightness = phase < 0.1 ? 1 : Math.max(0, 1 - (phase - 0.1) / 0.9);
  beatBarFill.style.width = (brightness * 100) + '%';
  beatBarFill.style.opacity = 0.4 + brightness * 0.6;

  animFrame = requestAnimationFrame(animateBeat);
}

// --- Call audio controls ---
function sendControlToTab(action, value) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action, value });
  });
}

callVolSlider.addEventListener('input', () => {
  const val = parseFloat(callVolSlider.value);
  callVolDisplay.textContent = Math.round(val * 100) + '%';
  chrome.storage.local.set({ callVolume: val });
  sendControlToTab('setCallVolume', val);
});
