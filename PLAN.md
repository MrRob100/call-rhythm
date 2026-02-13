# Call Rhythm — Project Plan

Goal: Chrome extension that plays hip-hop instrumentals during calls, with beat-synced time-stretching of call audio to match the BPM.

## Phase 1: Instrumental Playback with Track Selection ✅

Play looping instrumentals from a track picker in the popup. Independent audio graph — no reverb, no time-stretching yet.

**Audio graph:**
```
Fetched MP3 → AudioBufferSourceNode → beatGain(0.3) → destination
```

**What was built:**
- `tracks/index.json` — track manifest (name, file, bpm)
- `tracks/*.mp3` — actual instrumental files served via GitHub Pages
- Popup with `<select>` dropdown + Play/Stop button
- `popup.js` sends `playTrack`/`stopTrack` messages to active tab
- `payload.js` fetches MP3 from GitHub Pages, decodes, loops via AudioBufferSourceNode
- Track selection and play state persisted in `chrome.storage.local`
- Beat audio cached (skip re-fetch on replay of same track)

**Branch:** `reverb-tool` preserves the old reverb-only codebase for reference.

---

## Phase 2: Beat Clock & BPM Detection ✅

Establish a precise beat clock from the instrumental's known BPM so we know exactly where each beat falls in real time. This is the foundation for syncing time-stretch to the beat grid.

**What was built:**
- `getBeatInfo()` returns `{ phase, beat, bpm }` from `audioCtx.currentTime` + `beatSource.start()` time
- Wall-clock anchor stored in `chrome.storage.local` for popup animation
- Visual pulse indicator in popup (beat bar with rise/decay animation)
- First 8 beats logged to console for verification

---

## Phase 3: Call Audio Capture & Time-Stretching ✅

Capture the call's `<audio>`/`<video>` element and time-stretch it in real time using a WSOLA AudioWorklet.

**Audio graph:**
```
Call audio (<audio>/<video> element)
  -> createMediaElementSource
  -> AudioWorkletNode('phase-vocoder-processor')  [stretchRatio param]
  -> callGain (default 1.0)
  -> ctx.destination
```

**What was built:**
- `worklet/phase-vocoder-processor.js` — WSOLA AudioWorklet (FRAME_SIZE=2048, HOP_ANALYSIS=512, MAX_SEEK=128, cross-correlation splice search, Hann windowing, independent stereo state)
- `payload.js` — `ensureWorklet()`, `captureCallAudio(el)`, `scanForMedia()`, MutationObserver for dynamic `<audio>`/`<video>` elements, `setStretchRatio`/`setCallVolume` message handlers, `chrome.storage.onChanged` sync
- Popup sliders for Time Stretch (0.5x–2.0x) and Call Volume (0–100%), persisted in storage
- `manifest.json` — `web_accessible_resources` for worklet, version bumped to 1.2

**Known limitations:**
- WebRTC-only platforms (Google Meet, Zoom) don't create `<audio>` elements — future: `chrome.tabCapture.capture()` fallback
- CORS-tainted media outputs silence (logged as warning)
- Multiple media elements supported via `capturedMedia` array

---

## Phase 4: Polish & UX

- Volume controls for beat vs call audio
- Visual beat indicator in popup
- Multiple track support with easy add workflow
- Error handling (failed fetch, no media element on page, etc.)
