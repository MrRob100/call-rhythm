// ----- CONFIG -----
// Replace with your actual GitHub Pages URL once deployed.
// e.g. https://yourusername.github.io/meet-beat/payload.js
const REMOTE_SCRIPT_URL = 'https://MrRob100.github.io/call-rhythm/remote/payload.js';
// -------------------

const script = document.createElement('script');
script.src = REMOTE_SCRIPT_URL + '?t=' + Date.now();
document.head.appendChild(script);
