const REMOTE_URL = 'https://mrrob100.github.io/call-rhythm/remote/payload.js';
let lastHash = '';

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkForUpdates() {
  try {
    const res = await fetch(REMOTE_URL + '?t=' + Date.now());
    const code = await res.text();
    const hash = await sha256(code);

    const stored = (await chrome.storage.local.get('lastHash')).lastHash;
    if (stored && stored !== hash) {
      await chrome.storage.local.set({ lastHash: hash });
      console.log('[Call Rhythm] Remote changed, reloading extension...');
      chrome.runtime.reload();
    } else if (!stored) {
      await chrome.storage.local.set({ lastHash: hash });
    }
  } catch (e) {
    console.error('[Call Rhythm]', e);
  }
}

chrome.alarms.create('check', { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener(checkForUpdates);
chrome.runtime.onInstalled.addListener(checkForUpdates);
