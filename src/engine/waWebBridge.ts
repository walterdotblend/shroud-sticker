export async function pingShroudExtension(timeoutMs = 500): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    if (document.documentElement?.dataset?.shroudExt) {
      return true
    }
  } catch {
    // ignore
  }
  return new Promise((resolve) => {
    let settled = false
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== window) return
      if (ev.data && ev.data.__shroudExt === 'PONG') {
        settled = true
        window.removeEventListener('message', onMsg)
        clearTimeout(timer)
        resolve(true)
      }
    }
    const timer = setTimeout(() => {
      if (!settled) {
        window.removeEventListener('message', onMsg)
        resolve(false)
      }
    }, timeoutMs)

    window.addEventListener('message', onMsg)
    window.postMessage({ __shroudExt: 'PING' }, window.location.origin)
  })
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export async function sendStickerToWhatsAppWeb(params: {
  webpBlob: Blob
  oggBlob?: Blob
  durationSec: number
  isAnimated: boolean
  targetMode: 'self' | 'active'
  openForward: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const webpB64 = await blobToBase64(params.webpBlob)
  const oggB64 = params.oggBlob ? await blobToBase64(params.oggBlob) : undefined
  const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  return new Promise((resolve) => {
    let done = false
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== window) return
      const d = ev.data
      if (d && d.__shroudExt === 'SEND_RESULT' && d.reqId === reqId) {
        done = true
        window.removeEventListener('message', onMsg)
        clearTimeout(timer)
        resolve({ ok: !!d.ok, error: d.error })
      }
    }

    const timer = setTimeout(() => {
      if (!done) {
        window.removeEventListener('message', onMsg)
        resolve({
          ok: false,
          error: 'Timed out waiting for SHROUD extension / WhatsApp Web tab.',
        })
      }
    }, 40000)

    window.addEventListener('message', onMsg)
    window.postMessage(
      {
        __shroudExt: 'SEND_STICKER',
        reqId,
        payload: {
          webpB64,
          oggB64,
          durationSec: params.durationSec,
          isAnimated: params.isAnimated,
          targetMode: params.targetMode,
          openForward: params.openForward,
        },
      },
      window.location.origin
    )
  })
}
