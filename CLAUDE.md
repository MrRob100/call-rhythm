# Call Rhythm

Chrome extension (Manifest V3) that plays hip-hop instrumentals during calls, with a goal of beat-synced time-stretching. Auto-updates by pulling from GitHub.

## Architecture

- **`manifest.json`** — MV3 manifest. Registers `remote/payload.js` as a content script on all URLs and `background.js` as the service worker.
- **`remote/payload.js`** — content script that runs on every page. Handles beat playback: fetches MP3 from GitHub Pages, decodes to AudioBuffer, loops through a gain node to speakers. Listens for `playTrack`/`stopTrack` messages from the popup. Runs in Chrome's **isolated world**.
- **`background.js`** — service worker that polls the GitHub Pages URL every 2 minutes. Compares a SHA-256 hash of the remote file against the last known hash (stored in `chrome.storage.local`). When the hash changes, calls `chrome.runtime.reload()`.
- **`popup.html` / `popup.js`** — extension popup with track dropdown and Play/Stop button. Sends tab messages to content script. Persists selection and play state in `chrome.storage.local`.
- **`tracks/index.json`** — track manifest (name, file, bpm). Actual MP3 files live in `tracks/`.
- **`watch.sh`** — local shell script that runs `git fetch` + `git pull` every 30 seconds to keep local files in sync with the remote repo.
- **`PLAN.md`** — phased project roadmap.

## Audio Graph

```
Fetched MP3 → AudioBufferSourceNode (loop) → beatGain (0.3) → destination (speakers)
```

## Key Details

- **GitHub repo:** MrRob100/call-rhythm
- **GitHub Pages URL:** https://mrrob100.github.io/call-rhythm/remote/payload.js
- **Local directory name** is `meet-beat` but the GitHub repo is `call-rhythm`
- **Browser:** Brave (Chromium-based). Brave enforces page CSP on content scripts more strictly than Chrome — `eval()`, `new Function()`, and injected `<script>` tags are all blocked. That's why payload.js is loaded as a native content script rather than fetched and eval'd.
- Content scripts run in the **isolated world**: full DOM access but no access to page JS globals.
- **Old reverb code** preserved on the `reverb-tool` branch for reference.

## Workflow

1. Edit `remote/payload.js` (or other files)
2. Push to `main`
3. `watch.sh` (running locally) pulls the changes within ~30 seconds
4. `background.js` detects the remote file changed and calls `chrome.runtime.reload()`
5. New pages load the updated payload automatically

## Setup

1. Load the extension unpacked in Brave via `brave://extensions`
2. Start the watcher: `./watch.sh &`
