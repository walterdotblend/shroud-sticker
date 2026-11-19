const FORGE_BASE = 'https://walterdotblend.github.io/shroud-sticker/';
const input = document.getElementById('urlInput');
const goBtn = document.getElementById('goBtn');
const tabBtn = document.getElementById('tabBtn');

function launchWithUrl(rawUrl) {
  const url = (rawUrl || '').trim();
  if (!url) return;
  const target = `${FORGE_BASE}?url=${encodeURIComponent(url)}`;
  chrome.tabs.create({ url: target });
  window.close();
}

goBtn.addEventListener('click', () => launchWithUrl(input.value));
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') launchWithUrl(input.value);
});

tabBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeUrl = tabs?.[0]?.url;
    if (activeUrl && /^https?:\/\//i.test(activeUrl)) {
      launchWithUrl(activeUrl);
    }
  });
});
