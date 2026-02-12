const trackSelect = document.getElementById('track-select');
const playBtn = document.getElementById('play-btn');

let tracks = [];
let playing = false;

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
    chrome.storage.local.get({ selectedTrack: 0, beatPlaying: false }, (data) => {
      trackSelect.value = data.selectedTrack;
      playing = data.beatPlaying;
      updatePlayBtn();
    });
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
  } else {
    sendToTab('stopTrack');
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
