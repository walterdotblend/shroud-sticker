(() => {
  const ALLOWED = new Set([
    'https://walterdotblend.github.io',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ])
  if (!ALLOWED.has(location.origin)) return

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return
    const d = ev.data
    if (!d || typeof d !== 'object') return

    if (d.__shroudExt === 'PING') {
      window.postMessage({ __shroudExt: 'PONG', version: '1.1.0' }, location.origin)
      return
    }

    if (d.__shroudExt === 'SEND_STICKER' && d.payload) {
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
    }
  })
})()
