(() => {
  const SOUND_PROPS = [
    'sound_stickers_consumption_enabled',
    'sound_stickers_creation_enabled',
    'sound_stickers_audio_playing_enabled',
  ]

  function ns(name) {
    if (typeof window.importNamespace === 'function') {
      try {
        const m = window.importNamespace(name)
        if (m) return m
      } catch {
        // fallback to require
      }
    }
    return window.require(name)
  }

  function def(name) {
    const m = ns(name)
    return m && m.default !== undefined ? m.default : m
  }

  async function load(name, timeoutMs = 15000) {
    try {
      return ns(name)
    } catch {
      // lazy module
    }
    if (typeof window.requireLazy !== 'function') {
      throw new Error(`Module ${name} unavailable`)
    }
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Timeout loading ${name}`)), timeoutMs)
      window.requireLazy([name], () => {
        clearTimeout(t)
        resolve()
      })
    })
    return ns(name)
  }

  function b64ToBytes(b64) {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }

  function toB64(v) {
    if (v == null) return v
    if (typeof v === 'string') return v
    const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer || v)
    let s = ''
    for (const b of bytes) s += String.fromCharCode(b)
    return btoa(s)
  }

  async function sha256b64(bytes) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    let s = ''
    for (const b of hash) s += String.fromCharCode(b)
    return btoa(s)
  }

  function forceSoundStickers() {
    try {
      const AB = ns('WAWebABProps')
      const orig = AB.getABPropConfigValue
      if (!orig.__shroudPatched) {
        const patched = function (name) {
          if (SOUND_PROPS.includes(name)) return true
          return orig.apply(this, arguments)
        }
        patched.__shroudPatched = true
        AB.getABPropConfigValue = patched
      }
    } catch {
      // ignore
    }
    try {
      const G = ns('WAWebSoundStickerGating')
      G.isSoundStickerConsumptionEnabled = () => true
      G.isSoundStickerCreationEnabled = () => true
      G.isSoundStickerPlaybackEnabled = () => true
    } catch {
      // ignore
    }
  }

  async function getTargetChat(targetMode) {
    const CC = ns('WAWebChatCollection').ChatCollection
    if (targetMode === 'active') {
      const active = CC.getActive()
      if (!active) throw new Error('Open a chat in WhatsApp Web first.')
      return active
    }
    const Me = ns('WAWebUserPrefsMeUser')
    const getters = ['getMaybeMePnUser', 'getMeUserOrThrow', 'getMaybeMeLidUser']
    let firstWid = null
    for (const g of getters) {
      try {
        const wid = Me[g] && Me[g]()
        if (!wid) continue
        firstWid = firstWid || wid
        const chat = CC.get(wid) || CC.get(String(wid._serialized || wid))
        if (chat) return chat
      } catch {
        // try next
      }
    }
    if (!firstWid) throw new Error('Could not resolve your WhatsApp account.')
    const res = await ns('WAWebFindChatAction').findOrCreateLatestChat(firstWid, 'forwardSelectedModals')
    return res && (res.chat || res)
  }

  const noopQpl = new Proxy({}, { get: () => () => undefined })

  async function uploadStickerAudio(oggBlob, seconds, chat) {
    const MT = ns('WAWebMmsMediaTypes').MEDIA_TYPES
    let uploadOrigin = 1
    try {
      uploadOrigin = def('WAWebMediaGetUploadOriginForChat')(chat)
    } catch {
      // default 1
    }
    const params = {
      blob: oggBlob,
      type: MT.AUDIO,
      signal: new AbortController().signal,
      uploadQpl: noopQpl,
      uploadOrigin,
      fileOrigin: undefined,
      userUploadAttemptCount: 0,
      forwardedFromWeb: false,
      isViewOnce: false,
      isHdPhoto: false,
    }
    let res
    try {
      const metrics = def('WAWebCreateMediaUploadMetrics')(params)
      res = await def('WAWebUploadManagerMainThread').encryptAndUpload(params, metrics)
    } catch {
      res = await def('WAWebUploadManager').encryptAndUpload(params)
    }

    const bytes = new Uint8Array(await oggBlob.arrayBuffer())
    const filehash = await sha256b64(bytes)
    const stickerAudio = {
      deprecatedMms3Url: res.url || undefined,
      directPath: res.directPath,
      mediaKey: toB64(res.mediaKey),
      mediaKeyTimestamp: res.mediaKeyTimestamp,
      filehash,
      encFilehash: toB64(res.encFilehash),
      size: bytes.length,
      mimetype: 'audio/ogg; codecs=opus',
      duration: Math.max(1, Math.round(seconds || 1)),
    }
    try {
      const valid = ns('WAWebSoundStickerUtils').isCompleteStickerAudio(stickerAudio)
      if (valid !== true) {
        throw new Error('WhatsApp rejected the uploaded OGG/Opus audio.')
      }
    } catch (err) {
      if (err && String(err.message).includes('rejected')) throw err
    }
    return stickerAudio
  }

  async function publishSticker({ webpB64, oggB64, durationSec, isAnimated, targetMode, openForward }) {
    if (typeof window.require !== 'function') {
      throw new Error('WhatsApp Web is still loading. Wait a few seconds and try again.')
    }
    forceSoundStickers()
    const chat = await getTargetChat(targetMode || 'self')

    const webpBlob = new Blob([b64ToBytes(webpB64)], { type: 'image/webp' })
    let stickerAudio = null
    if (oggB64) {
      const oggBlob = new Blob([b64ToBytes(oggB64)], { type: 'audio/ogg; codecs=opus' })
      stickerAudio = await uploadStickerAudio(oggBlob, durationSec, chat)
    }

    const Opaque = def('WAWebMediaOpaqueData')
    const MediaPrep = def('WAWebMediaPrep')
    const opaque = await Opaque.createFromData(webpBlob, 'image/webp')
    const data = {
      type: 'sticker',
      mediaBlob: opaque,
      mimetype: 'image/webp',
      size: webpBlob.size,
      fullWidth: 512,
      fullHeight: 512,
      isAnimated: !!isAnimated,
      emojis: stickerAudio ? ['🔊'] : ['✨'],
    }
    const prep = new MediaPrep('sticker', Promise.resolve(data))
    const res = await prep.sendToChat({
      chat,
      options: stickerAudio ? { stickerAudio } : {},
    })

    const OK = ns('WAWebSendMsgResultAction').SendMsgResult.OK
    if (!res || res.messageSendResult !== OK) {
      throw new Error(`WhatsApp send failed (${res ? res.messageSendResult : 'unknown'})`)
    }

    if (openForward && res.msg) {
      const ACK = ns('WAWebAck').ACK
      const t0 = Date.now()
      while (Date.now() - t0 < 15000 && res.msg.ack < ACK.SENT) {
        await new Promise((r) => setTimeout(r, 250))
      }
      const React = ns('react')
      const MM = ns('WAWebModalManager')
      const FL = await load('WAWebForwardMessageFlowLoadable')
      const SU = ns('WAWebStateUtils')
      let model = res.msg
      try {
        model = ns('WAWebMsgCollection').MsgCollection.get(res.msg.id) || res.msg
      } catch {
        // use res.msg
      }
      const close = MM.closeModalManager || (() => MM.ModalManager.close())
      MM.ModalManager.open(
        React.createElement(FL.ForwardMessageFlowLoadable, {
          msgs: [SU.unproxy(model)],
          onClose: close,
          onForward: () => {},
        }),
        { transition: 'modal-flow' }
      )
    }
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return
    const d = ev.data
    if (!d || d.__shroudWaMain !== 'PUBLISH' || !d.reqId) return

    publishSticker(d.payload)
      .then(() => {
        window.postMessage({ __shroudWaMain: 'RESULT', reqId: d.reqId, ok: true }, 'https://web.whatsapp.com')
      })
      .catch((err) => {
        window.postMessage(
          {
            __shroudWaMain: 'RESULT',
            reqId: d.reqId,
            ok: false,
            error: err && err.message ? err.message : String(err),
          },
          'https://web.whatsapp.com'
        )
      })
  })
})()
