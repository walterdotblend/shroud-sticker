chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.shroudWa !== 'SEND_STICKER') return false

  ;(async () => {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' })
      let waTab = tabs && tabs[0]
      if (!waTab) {
        await chrome.tabs.create({ url: 'https://web.whatsapp.com/', active: true })
        sendResponse({
          ok: false,
          error: 'WhatsApp Web opened in a new tab. Sign in / wait for chats to load, then click Send again.',
        })
        return
      }

      if (waTab.id != null) {
        await chrome.tabs.update(waTab.id, { active: true }).catch(() => {})
        const res = await chrome.tabs.sendMessage(waTab.id, {
          shroudWa: 'DISPATCH',
          payload: msg.payload,
        })
        sendResponse(res || { ok: false, error: 'No response from WhatsApp Web tab.' })
      } else {
        sendResponse({ ok: false, error: 'Invalid WhatsApp Web tab.' })
      }
    } catch (err) {
      sendResponse({
        ok: false,
        error: err && err.message ? err.message : String(err),
      })
    }
  })()

  return true
})
