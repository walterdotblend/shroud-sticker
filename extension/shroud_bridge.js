(() => {
  const ALLOWED = new Set([
    'https://walterdotblend.github.io',
  ])
  const isLocal =
    location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  if (!ALLOWED.has(location.origin) && !isLocal) return

  // Mark DOM so the page can detect the extension synchronously even after late init
  try {
    document.documentElement.dataset.shroudExt = '1.1.0'
  } catch {
    // ignore
  }

  const announce = () => {
    try {
      window.postMessage({ __shroudExt: 'PONG', version: '1.1.0' }, location.origin)
    } catch {
      // ignore
    }
  }

  announce()
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announce, { once: true })
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return
    const d = ev.data
    if (!d || typeof d !== 'object') return

    if (d.__shroudExt === 'PING') {
      announce()
      return
    }

    if (d.__shroudExt === 'SEND_STICKER' && d.payload) {
      try {
        chrome.runtime.sendMessage({ shroudWa: 'SEND_STICKER', payload: d.payload }, (res) => {
          const lastErr = chrome.runtime.lastError
          if (lastErr) {
            window.postMessage(
              { __shroudExt: 'SEND_RESULT', reqId: d.reqId, ok: false, error: lastErr.message },
              location.origin
            )
            return
          }
          window.postMessage(
            {
              __shroudExt: 'SEND_RESULT',
              reqId: d.reqId,
              ok: !!(res && res.ok),
              error: res && res.error ? res.error : undefined,
            },
            location.origin
          )
        })
      } catch (err) {
        window.postMessage(
          {
            __shroudExt: 'SEND_RESULT',
            reqId: d.reqId,
            ok: false,
            error:
              'Extension context invalidated after reload. Refresh this tab (F5) and try again. (' +
              (err && err.message ? err.message : String(err)) +
              ')',
          },
          location.origin
        )
      }
    }
  })
})()
