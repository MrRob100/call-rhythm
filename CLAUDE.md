# Call Rhythm

Chrome extension (Manifest V3) that auto-updates by pulling from GitHub.

## Architecture

- **`manifest.json`** — MV3 manifest. Registers `remote/payload.js` as a content script on all URLs and `background.js` as the service worker.
- **`remote/payload.js`** — the actual logic that runs on every page. This is a regular content script loaded directly by Chrome from disk (no eval, no remote script injection). Runs in Chrome's **isolated world** — full DOM access, no page JS globals.
- **`background.js`** — service worker that polls the GitHub Pages URL every 2 minutes. Compares a SHA-256 hash of the remote file against the last known hash (stored in `chrome.storage.local`). When the hash changes, calls `chrome.runtime.reload()` which makes Chrome re-read all extension files from disk.
- **`watch.sh`** — local shell script that runs `git fetch` + `git pull` every 30 seconds to keep local files in sync with the remote repo.

## Key Details

- **GitHub repo:** MrRob100/call-rhythm
- **GitHub Pages URL:** https://mrrob100.github.io/call-rhythm/remote/payload.js
- **Local directory name** is `meet-beat` but the GitHub repo is `call-rhythm`
- **Browser:** Brave (Chromium-based). Brave enforces page CSP on content scripts more strictly than Chrome — `eval()`, `new Function()`, and injected `<script>` tags are all blocked. That's why payload.js is loaded as a native content script rather than fetched and eval'd.
- Content scripts run in the **isolated world**: full DOM access but no access to page JS globals.

## Workflow

1. Edit `remote/payload.js`
2. Push to `main`
3. `watch.sh` (running locally) pulls the changes within ~30 seconds
4. `background.js` detects the remote file changed and calls `chrome.runtime.reload()`
5. New pages load the updated payload automatically

## Setup

1. Load the extension unpacked in Brave via `brave://extensions`
2. Start the watcher: `./watch.sh &`
