/**
 * Cloudflare Worker: Streaming CORS Relay for SHROUD Sticker Forge
 * - Zero storage (no R2, no disk): streams bytes directly in RAM and discards immediately.
 * - Restricted to your GitHub Pages origin so others cannot abuse your 100k/day free quota.
 */

const ALLOWED_ORIGINS = [
  'https://walterdotblend.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || ''
    const headers = corsHeaders(origin)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }

    const reqUrl = new URL(request.url)
    const target = reqUrl.searchParams.get('url')
    if (!target || !/^https?:\/\//i.test(target)) {
      return new Response('Missing or invalid ?url= parameter', { status: 400, headers })
    }

    // Block private/local IP ranges (SSRF protection)
    try {
      const parsed = new URL(target)
      const host = parsed.hostname.toLowerCase()
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.endsWith('.local')
      ) {
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
