import type { Translations } from '../i18n/translations'

/**
 * Integrated browser-side URL & HTML media downloader.
 * Resolves Giphy/Imgur/Tenor pages, scrapes HTML og:video/og:image tags,
 * uses CORS relays when needed, and supports social video extraction via Cobalt API.
 */

// Optional personal Cloudflare Worker relay URL (e.g. 'https://shroud-relay.user.workers.dev')
const CUSTOM_WORKER_RELAY = ''

function getRelayBuilders(): Array<(u: string) => string> {
  let saved = CUSTOM_WORKER_RELAY
  try {
    saved = localStorage.getItem('shroud_relay_url') || CUSTOM_WORKER_RELAY
  } catch {
    // ignore
  }
  const list: Array<(u: string) => string> = []
  if (saved && /^https?:\/\//i.test(saved)) {
    const clean = saved.replace(/\/+$/, '')
    list.push((u: string) => `${clean}/?url=${encodeURIComponent(u)}`)
  }
  list.push(
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
  )
  return list
}

const SOCIAL_VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'v.redd.it',
  'twitch.tv',
  'clips.twitch.tv',
]

export function isSocialVideoPage(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '')
    return SOCIAL_VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

export function normalizeMediaUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''

  // Imgur .gifv -> .mp4
  if (/^https?:\/\/i\.imgur\.com\/[a-zA-Z0-9]+\.gifv(\?.*)?$/i.test(trimmed)) {
    return trimmed.replace(/\.gifv/i, '.mp4')
  }

  // Giphy page -> direct media mp4
  const giphyMatch = /^https?:\/\/(?:www\.)?giphy\.com\/(?:gifs|clips)\/(?:[a-zA-Z0-9-]+-)?([a-zA-Z0-9]+)(?:\/.*)?$/i.exec(
    trimmed
  )
  if (giphyMatch?.[1]) {
    return `https://media.giphy.com/media/${giphyMatch[1]}/giphy.mp4`
  }

  return trimmed
}

export function extractMediaUrlFromHtml(html: string, baseUrl: string): string | null {
  const resolveRel = (candidate: string): string | null => {
    const cleaned = candidate.replace(/&amp;/g, '&').trim()
    if (!cleaned || cleaned.startsWith('data:') || cleaned.startsWith('blob:')) return null
    try {
      return new URL(cleaned, baseUrl).href
    } catch {
      return null
    }
  }

  // 1. OpenGraph / Twitter video meta tags
  const metaPatterns = [
    /<meta[^>]+(?:property|name)=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:video:secure_url["']/i,
    /<meta[^>]+(?:property|name)=["']og:video(?::url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:video(?::url)?["']/i,
    /<meta[^>]+(?:property|name)=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+\.(?:gif|webp)(?:\?[^"']*)?)["']/i,
  ]

  for (const rx of metaPatterns) {
    const m = rx.exec(html)
    if (m?.[1]) {
      const resolved = resolveRel(m[1])
      if (resolved && !/\.html?($|\?)/i.test(resolved)) return resolved
    }
  }

  // 2. Direct Tenor / Giphy / CDN mp4 or gif URLs embedded in HTML/JSON
  const cdnMatch =
    /https?:\/\/media\d*\.(?:tenor\.com|giphy\.com)\/[^\s"'<>\\]+\.(?:mp4|webm|gif)/i.exec(html)
  if (cdnMatch?.[0]) {
    return cdnMatch[0].replace(/\\u002F/gi, '/')
  }

  // 3. <video src> or <source src>
  const tagMatch = /<(?:video|source)[^>]+src=["']([^"']+)["']/i.exec(html)
  if (tagMatch?.[1]) {
    return resolveRel(tagMatch[1])
  }

  return null
}

function guessFilename(url: string, mimeType: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    if (last && /\.(gif|mp4|webm|mov|webp)$/i.test(last)) {
      return last
    }
  } catch {
    // ignore
  }
  if (mimeType.includes('gif')) return 'remote-media.gif'
  if (mimeType.includes('webm')) return 'remote-media.webm'
  if (mimeType.includes('webp')) return 'remote-media.webp'
  return 'remote-media.mp4'
}

async function fetchWithCorsFallback(url: string, onLog?: (msg: string) => void): Promise<Response> {
  try {
    const direct = await fetch(url, { mode: 'cors' })
    if (direct.ok) return direct
  } catch {
    // fall through to CORS relays
  }

  for (const buildRelay of getRelayBuilders()) {
    try {
      const relayUrl = buildRelay(url)
      onLog?.(`> Intentando vía proxy CORS...`)
      const res = await fetch(relayUrl)
      if (res.ok) return res
    } catch {
      // try next relay
    }
  }

  throw new Error('CORS_BLOCKED')
}

async function tryTwitterExtract(url: string, onLog?: (msg: string) => void): Promise<string | null> {
  const m = /^https?:\/\/(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/i.exec(url)
  if (!m) return null
  try {
    onLog?.(`> Consultando extractor Twitter/X (vxtwitter)...`)
    const res = await fetch(`https://api.vxtwitter.com/${m[1]}/status/${m[2]}`)
    if (!res.ok) return null
    const data = (await res.json()) as {
      media_extended?: Array<{ type?: string; url?: string }>
      mediaURLs?: string[]
    }
    const videoItem = data.media_extended?.find((item) => item.type === 'video' || item.type === 'gif')
    if (videoItem?.url) return videoItem.url
    if (data.mediaURLs?.[0]) return data.mediaURLs[0]
    return null
  } catch {
    return null
  }
}

async function tryTikTokExtract(url: string, onLog?: (msg: string) => void): Promise<string | null> {
  if (!/tiktok\.com/i.test(url)) return null
  try {
    onLog?.(`> Consultando extractor TikTok...`)
    const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    const data = (await res.json()) as { data?: { play?: string; wmplay?: string } }
    return data?.data?.play || data?.data?.wmplay || null
  } catch {
    return null
  }
}

async function tryCobaltExtract(url: string, onLog?: (msg: string) => void): Promise<string | null> {
  try {
    onLog?.(`> Consultando extractor de video integrado (Cobalt)...`)
    const res = await fetch('https://api.cobalt.tools/', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        videoQuality: '720',
        filenameStyle: 'basic',
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { status?: string; url?: string }
    if (data?.url && (data.status === 'tunnel' || data.status === 'redirect' || data.status === 'stream')) {
      return data.url
    }
    return null
  } catch {
    return null
  }
}

export async function downloadMediaFromUrl(
  rawUrl: string,
  t: Translations,
  onLog?: (msg: string) => void
): Promise<File> {
  const originalUrl = rawUrl.trim()
  if (!/^https?:\/\//i.test(originalUrl)) {
    throw new Error(t.errInvalidUrl)
  }

  let targetUrl = normalizeMediaUrl(originalUrl)

  // Platform-specific CORS-friendly extractors (Twitter/X, TikTok, then Cobalt)
  const twitterUrl = await tryTwitterExtract(originalUrl, onLog)
  if (twitterUrl) {
    targetUrl = twitterUrl
    onLog?.(`> Video de Twitter/X extraído.`)
  } else {
    const tiktokUrl = await tryTikTokExtract(originalUrl, onLog)
    if (tiktokUrl) {
      targetUrl = tiktokUrl
      onLog?.(`> Video de TikTok extraído.`)
    } else if (isSocialVideoPage(originalUrl)) {
      const extracted = await tryCobaltExtract(originalUrl, onLog)
      if (extracted) {
        targetUrl = extracted
        onLog?.(`> Stream extraído correctamente.`)
      }
    }
  }

  let response: Response
  try {
    response = await fetchWithCorsFallback(targetUrl, onLog)
  } catch {
    throw new Error(t.errCorsBlocked)
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase()

  // If HTML page, extract embedded video/GIF URL and fetch that instead
  if (contentType.includes('text/html')) {
    onLog?.(`> Página HTML detectada, buscando video/GIF embebido...`)
    const html = await response.text()
    const embeddedUrl = extractMediaUrlFromHtml(html, targetUrl)
    if (!embeddedUrl) {
      throw new Error(t.errHtmlNoMedia)
    }
    onLog?.(`> Medio encontrado: ${embeddedUrl}`)
    try {
      response = await fetchWithCorsFallback(embeddedUrl, onLog)
      targetUrl = embeddedUrl
    } catch {
      throw new Error(t.errCorsBlocked)
    }
  }

  const finalType = (response.headers.get('content-type') || '').toLowerCase()
  if (finalType.includes('text/html')) {
    throw new Error(t.errHtmlNoMedia)
  }

  const blob = await response.blob()
  if (blob.size === 0) {
    throw new Error(t.errEmptyFile)
  }

  const mime = finalType.split(';')[0].trim() || blob.type || 'video/mp4'
  const filename = guessFilename(targetUrl, mime)
  return new File([blob], filename, { type: mime })
}
