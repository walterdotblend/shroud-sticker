(() => {
  const pending = new Map()
  let seq = 1

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return
    const d = ev.data
    if (!d || d.__shroudWaMain !== 'RESULT' || !d.reqId) return
    const cb = pending.get(d.reqId)
    if (cb) {
      pending.delete(d.reqId)
      cb({ ok: !!d.ok, error: d.error })
    }
  })

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.shroudWa !== 'DISPATCH') return false
    const reqId = `sw_${Date.now()}_${seq++}`
    const timer = setTimeout(() => {
      if (pending.has(reqId)) {
        pending.delete(reqId)
        sendResponse({ ok: false, error: 'Timed out waiting for WhatsApp Web sender.' })
      }
    }, 35000)

    pending.set(reqId, (res) => {
      clearTimeout(timer)
      sendResponse(res)
    })

    window.postMessage(
      { __shroudWaMain: 'PUBLISH', reqId, payload: msg.payload },
      'https://web.whatsapp.com'
    )
    return true
  })
})()
