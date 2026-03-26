
// Proxy API calls from content script to bypass mixed-content block
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'API_FETCH') {
    fetch(msg.url)
      .then(r => r.json())
      .then(data => sendResponse({ok: true, data}))
      .catch(err => sendResponse({ok: false, error: err.message}));
    return true; // keep channel open for async response
  }
  if (msg.type === 'API_POST') {
    fetch(msg.url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(msg.body)
    })
      .then(r => r.json())
      .then(data => sendResponse({ok: true, data}))
      .catch(err => sendResponse({ok: false, error: err.message}));
    return true;
  }
});
/**
 * background.js — Service worker for VitaBloom extension
 *
 * Handles extension icon clicks: opens a new tab showing the /health endpoint.
 */

chrome.action.onClicked.addListener(async (tab) => {
  // Open the API health page in a new tab so the user can verify the server is up
  chrome.tabs.create({ url: 'http://localhost:8765/health' });
});
