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

## Phase 2: Beat Clock & BPM Detection

Establish a precise beat clock from the instrumental's known BPM so we know exactly where each beat falls in real time. This is the foundation for syncing time-stretch to the beat grid.

**Key tasks:**
- Track current beat position from `audioCtx.currentTime` + `beatSource.start()` time
- Expose a `getBeatPhase()` function (0.0–1.0 within each beat)
- Optional: tap-tempo or manual BPM nudge in popup for fine-tuning

---

## Phase 3: Call Audio Capture & Time-Stretching

Capture the call's `<audio>`/`<video>` element and time-stretch it in real time to match the instrumental's BPM.

**Key tasks:**
- Capture tab media element via `createMediaElementSource`
- Implement real-time time-stretching (phase vocoder or playbackRate approach)
- Sync stretched audio to the beat clock from Phase 2
- Keep instrumental and call audio as separate graph branches merging at destination

**Open questions:**
- Phase vocoder in Web Audio (OLA/WSOLA in AudioWorklet) vs simple `playbackRate` adjustment?
- How to determine the "natural BPM" of speech to know the stretch ratio?

---

## Phase 4: Polish & UX

- Volume controls for beat vs call audio
- Visual beat indicator in popup
- Multiple track support with easy add workflow
- Error handling (failed fetch, no media element on page, etc.)
