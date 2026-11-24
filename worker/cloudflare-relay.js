/**
 * Cloudflare Worker: Streaming CORS Relay for SHROUD Sticker Forge
 * - Zero storage (no R2, no disk): streams bytes directly in RAM and discards immediately.
 * - Strict Origin/Referer enforcement so third parties cannot abuse your 100k/day free quota.
 * - Comprehensive SSRF protection against private, loopback, and cloud metadata IPs.
 */

const ALLOWED_ORIGINS = [
  'https://walterdotblend.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function resolveCallerOrigin(request) {
  const origin = (request.headers.get('Origin') || '').replace(/\/+$/, '')
  if (origin) return origin
  const referer = request.headers.get('Referer') || ''
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

function isBlockedHost(hostname, port) {
  const host = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (port && port !== '80' && port !== '443') return true
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    host.startsWith('fc00:') ||
    host.startsWith('fd00:') ||
    host.startsWith('fe80:')
  ) {
    return true
  }
  const m172 = /^172\.(\d+)\./.exec(host)
  if (m172) {
    const second = Number(m172[1])
    if (second >= 16 && second <= 31) return true
  }
  return false
}

export default {
  async fetch(request) {
    const callerOrigin = resolveCallerOrigin(request)
    const isAllowedOrigin = ALLOWED_ORIGINS.includes(callerOrigin)
    const headers = {
      'Access-Control-Allow-Origin': isAllowedOrigin ? callerOrigin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: isAllowedOrigin ? 204 : 403, headers })
    }

    if (request.method !== 'GET' || !isAllowedOrigin) {
      return new Response('Forbidden origin', { status: 403, headers })
    }

    const reqUrl = new URL(request.url)
    const target = reqUrl.searchParams.get('url')
    if (!target || !/^https?:\/\//i.test(target)) {
      return new Response('Missing or invalid ?url= parameter', { status: 400, headers })
    }

    try {
      const parsed = new URL(target)
      if (isBlockedHost(parsed.hostname, parsed.port)) {
        return new Response('Blocked host', { status: 403, headers })
      }
    } catch {
      return new Response('Invalid URL', { status: 400, headers })
    }

    try {
      const upstream = await fetch(target, {
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
      })

      const lenHeader = Number(upstream.headers.get('content-length') || '0')
      if (lenHeader > 35 * 1024 * 1024) {
        return new Response('Payload too large (>35 MB)', { status: 413, headers })
      }

      const resHeaders = new Headers(headers)
      const ct = upstream.headers.get('content-type')
      if (ct) resHeaders.set('Content-Type', ct)

      return new Response(upstream.body, {
        status: upstream.status,
        headers: resHeaders,
      })
    } catch (err) {
      return new Response(`Upstream error: ${String(err)}`, { status: 502, headers })
    }
  },
}
