const FORGE_BASE = 'https://walterdotblend.github.io/shroud-sticker/'
const input = document.getElementById('urlInput')
const goBtn = document.getElementById('goBtn')
const tabBtn = document.getElementById('tabBtn')

function launchWithUrl(rawUrl) {
  const url = (rawUrl || '').trim()
  if (!url) return
  const target = `${FORGE_BASE}?url=${encodeURIComponent(url)}`
  chrome.tabs.create({ url: target })
  window.close()
}

goBtn.addEventListener('click', () => launchWithUrl(input.value))
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') launchWithUrl(input.value)
})

tabBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs && tabs[0]
    const activeUrl = tab && tab.url
    if (!activeUrl || !/^https?:\/\//i.test(activeUrl)) return

    // If on a page like klipy.com whose HTML is gated, extract the direct media URL
    // already rendered in the user's open tab (og:video / <video> / CDN <img>).
    if (tab.id != null && chrome.scripting && chrome.scripting.executeScript) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const ogVid =
              document.querySelector('meta[property="og:video:secure_url"]')?.getAttribute('content') ||
              document.querySelector('meta[property="og:video"]')?.getAttribute('content')
            if (ogVid && /\.(mp4|webm|gif)/i.test(ogVid)) return ogVid

            const vid = document.querySelector('video source[src], video[src]')
            const vidSrc = vid?.getAttribute('src')
            if (vidSrc && /^https?:\/\//i.test(vidSrc)) return vidSrc

            const imgs = Array.from(document.querySelectorAll('img[src]'))
            const cdnGif = imgs.find((im) => {
              const s = im.getAttribute('src') || ''
              return /static\.klipy\.com|media\.tenor\.com|media\d*\.giphy\.com|\.(gif|webp)(\?|$)/i.test(s) &&
                !/logo|avatar|icon/i.test(s)
            })
            if (cdnGif) return cdnGif.getAttribute('src')
            return null
          },
        })
        const extracted = results && results[0] && results[0].result
        if (extracted && /^https?:\/\//i.test(extracted)) {
          launchWithUrl(extracted)
          return
        }
      } catch {
        // fall back to activeUrl
      }
    }

    launchWithUrl(activeUrl)
  })
})
