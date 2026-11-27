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

    if (tab.id != null && chrome.scripting && chrome.scripting.executeScript) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const isHttp = (u) => typeof u === 'string' && /^https?:\/\//i.test(u)

            // 1. OpenGraph video / image meta tags
            const metaSelectors = [
              'meta[property="og:video:secure_url"]',
              'meta[property="og:video"]',
              'meta[property="og:video:url"]',
              'meta[name="twitter:player:stream"]',
              'meta[property="og:image"]',
            ]
            for (const sel of metaSelectors) {
              const val = document.querySelector(sel)?.getAttribute('content')
              if (isHttp(val) && /\.(mp4|webm|gif|webp)/i.test(val)) return val
            }

            // 2. Largest visible <video> with an http(s) src/currentSrc
            const videos = Array.from(document.querySelectorAll('video'))
              .map((v) => {
                const src = v.currentSrc || v.getAttribute('src') || v.querySelector('source[src]')?.getAttribute('src') || ''
                const r = v.getBoundingClientRect()
                return { src, area: r.width * r.height }
              })
              .filter((x) => isHttp(x.src) && x.area > 0)
              .sort((a, b) => b.area - a.area)
            if (videos[0]) return videos[0].src

            // 3. Largest visible animated <img> (GIF/WebP or known GIF CDNs)
            const imgs = Array.from(document.querySelectorAll('img'))
              .map((im) => {
                const src = im.currentSrc || im.getAttribute('src') || im.getAttribute('data-src') || ''
                const r = im.getBoundingClientRect()
                return { src, area: r.width * r.height }
              })
              .filter(
                (x) =>
                  isHttp(x.src) &&
                  x.area >= 6400 &&
                  !/logo|avatar|icon|emoji|badge/i.test(x.src) &&
                  (/\.(gif|webp|mp4)(\?|$)/i.test(x.src) || /klipy|tenor|giphy/i.test(x.src))
              )
              .sort((a, b) => b.area - a.area)
            if (imgs[0]) return imgs[0].src

            // 4. Fallback: network resource entries for .mp4/.gif/.webp
            if (typeof performance !== 'undefined' && performance.getEntriesByType) {
              const res = performance
                .getEntriesByType('resource')
                .map((e) => e.name)
                .filter((u) => isHttp(u) && /\.(mp4|webm|gif)(\?|$)/i.test(u) && !/avatar|icon|logo/i.test(u))
              if (res[0]) return res[0]
            }
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
