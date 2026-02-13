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

## Phase 3: Beat-Aware Silence Padding ✅

Capture the call's `<audio>`/`<video>` element and automatically align speech to beat boundaries by extending silences. Replaces the previous WSOLA time-stretcher which was too heavy (~32k ops/block) and required a manual slider.

**Audio graph:**
```
Call audio (<audio>/<video> element)
  -> createMediaElementSource
  -> AudioWorkletNode('beat-sync-processor')
  -> callGain (default 1.0)
  -> ctx.destination
```

**What was built:**
- `worklet/beat-sync-processor.js` — Lightweight AudioWorklet (~500 ops/block) with 3-state machine (PASSTHROUGH/PADDING/CATCHING_UP), ring buffer (4s), RMS silence detection (threshold -40dB, hysteresis), beat phase calculation via MessagePort
- `payload.js` — `ensureWorklet()` loads beat-sync-processor, `captureCallAudio(el)` wires up syncNode, beat timing propagated to worklets on play/stop, `scanForMedia()`, MutationObserver for dynamic elements, `setCallVolume` handler
- Popup with Call Volume slider (0–100%), Time Stretch slider removed (sync is automatic)
- `manifest.json` — `web_accessible_resources` for new worklet, version 1.3

**Algorithm:**
- In confirmed silence, if next beat is <0.5s away → pad with zeros until beat boundary
- If accumulated drift >= 2s → catch up by skipping 256 extra samples/block during silence
- Speech detection exits padding/catch-up immediately (2-block hysteresis)
- No beat active → pure passthrough, zero overhead

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
