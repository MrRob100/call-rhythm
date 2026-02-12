const REMOTE_URL = 'https://mrrob100.github.io/call-rhythm/remote/payload.js';

async function updatePayload() {
  try {
    const res = await fetch(REMOTE_URL + '?t=' + Date.now());
    const code = await res.text();

    const existing = await chrome.userScripts.getScripts({ ids: ['payload'] });
    if (existing.length) {
      await chrome.userScripts.update([{ id: 'payload', js: [{ code }] }]);
    } else {
      await chrome.userScripts.register([{
        id: 'payload',
        matches: ['<all_urls>'],
        js: [{ code }],
        runAt: 'document_idle'
      }]);
    }
    console.log('[Call Rhythm] Payload updated');
  } catch (e) {
    console.error('[Call Rhythm] Failed to update payload:', e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  updatePayload();
  chrome.alarms.create('refresh', { periodInMinutes: 5 });
});

chrome.runtime.onStartup.addListener(() => updatePayload());
chrome.alarms.onAlarm.addListener(() => updatePayload());
