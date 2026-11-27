import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Globe, Share2, ShieldCheck, Smartphone, Terminal } from 'lucide-react'
import { AdBannerRail } from './components/AdBannerRail'
import { BloodBackdrop } from './components/backdrop/BloodBackdrop'
import { CropStage } from './components/CropStage'
import { PackSidebar } from './components/PackSidebar'
import { ToolRack, type WizardStep } from './components/ToolRack'
import { stickerEngine } from './engine/ffmpegClient'
import { probeMediaFile } from './engine/mediaProbe'
import { probeAudioSource } from './engine/oggOpusEncoder'
import { loadSavedPackState, savePackState } from './engine/packStorage'
import { pingShroudExtension, sendStickerToWhatsAppWeb } from './engine/waWebBridge'
import {
  receiveP2pStickerFromHost,
  startP2pStickerHost,
  type P2pHostSession,
  type ReceivedP2pSticker,
} from './engine/p2pTransfer'
import {
  WHATSAPP_MAX_DURATION_SEC,
  WHATSAPP_SAFE_TARGET_BYTES,
  WHATSAPP_STICKER_SIZE,
  type AudioTrackInfo,
  type EncodeResult,
  type MediaInfo,
  type StickerSettings,
} from './engine/types'
import { downloadMediaFromUrl } from './engine/urlLoader'
import {
  buildWastickersPack,
  generateAppQrDataUrl,
  validateWhatsAppWebp,
  type PackStickerItem,
} from './engine/wastickers'
import {
  detectInitialLang,
  getTranslations,
  SUPPORTED_LANGS,
  type LangCode,
} from './i18n/translations'

const INITIAL_SETTINGS: StickerSettings = {
  trimStart: 0,
  trimEnd: 6,
  speed: 1,
  reverse: false,
  crop: null,
  fitMode: 'contain-transparent',
  canvasBg: 'transparent',
  canvasScale: 1,
  canvasX: 0,
  canvasY: 0,
  rotationDeg: 0,
  flipH: false,
  targetSize: WHATSAPP_STICKER_SIZE,
  fps: 15,
  quality: 75,
  cursedLevel: 0,
  removeBg: false,
  bgModel: 'rmbg',
  compressionLevel: 4,
  autoCompressWhatsApp: true,
  maxBytes: WHATSAPP_SAFE_TARGET_BYTES,
  audioEnabled: false,
  audioVolume: 1,
  audioStart: 0,
  audioEnd: 6,
  loopVideoToAudio: false,
}

export function App() {
  const [lang, setLang] = useState<LangCode>(() => detectInitialLang())
  const t = getTranslations(lang)

  const [step, setStep] = useState<WizardStep>(1)
  const [media, setMedia] = useState<MediaInfo | null>(null)
  const [settings, setSettings] = useState<StickerSettings>(INITIAL_SETTINGS)
  const [viewMode, setViewMode] = useState<'source' | 'result'>('source')

  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  const [encoding, setEncoding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState(() => getTranslations(detectInitialLang()).readyStatus)
  const [logs, setLogs] = useState<string[]>([
    '> SHROUD // WhatsApp Sticker Forge ready.',
    '> Engine: FFmpeg.wasm (100% client-side, zero uploads).',
  ])
  const [result, setResult] = useState<EncodeResult | null>(null)
  const [stickerName, setStickerName] = useState<string>('sticker')
  const [packName, setPackName] = useState<string>('SHROUD Pack')
  const [packItems, setPackItems] = useState<PackStickerItem[]>([])
  const [packLoaded, setPackLoaded] = useState<boolean>(false)
  const [packError, setPackError] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [p2pStatus, setP2pStatus] = useState<string | null>(null)
  const p2pHostRef = useRef<P2pHostSession | null>(null)

  const [audioTrack, setAudioTrack] = useState<AudioTrackInfo | null>(null)
  const [videoOriginalAudio, setVideoOriginalAudio] = useState<AudioTrackInfo | null>(null)
  const [waExtAvailable, setWaExtAvailable] = useState(false)
  const [waSending, setWaSending] = useState(false)
  const [waSendStatus, setWaSendStatus] = useState<string | null>(null)

  // Mobile P2P receiver mode (?p2p=<peerId>)
  const [incomingPeerId] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('p2p')?.trim() || null
    } catch {
      return null
    }
  })
  const [mobileReceiveStatus, setMobileReceiveStatus] = useState<string>(
    'Connecting to your PC via WebRTC P2P...'
  )
  const [receivedSticker, setReceivedSticker] = useState<ReceivedP2pSticker | null>(null)

  const logEndRef = useRef<HTMLDivElement>(null)

  const handleLangChange = (next: LangCode) => {
    setLang(next)
    try {
      localStorage.setItem('shroud_lang', next)
    } catch {
      // ignore
    }
  }

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [...prev.slice(-80), line])
  }, [])

  // Restore saved sticker pack from IndexedDB on initial mount
  useEffect(() => {
    let cancelled = false
    loadSavedPackState()
      .then((saved) => {
        if (cancelled) return
        if (saved) {
          setPackName(saved.packName || 'SHROUD Pack')
          if (saved.items.length > 0) {
            setPackItems(saved.items)
            appendLog(`> Restored saved sticker pack "${saved.packName}" (${saved.items.length}/30 stickers).`)
          }
        }
        setPackLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setPackLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [appendLog])

  // Persist sticker pack changes to IndexedDB automatically
  useEffect(() => {
    if (!packLoaded) return
    savePackState(packName, packItems)
  }, [packLoaded, packName, packItems])

  // Detect SHROUD Chrome/Edge Extension for direct WhatsApp Web Sound Sticker Bridge
  useEffect(() => {
    const checkExt = () => {
      pingShroudExtension(600).then((ok) => {
        if (ok) setWaExtAvailable(true)
      })
    }
    checkExt()
    const onMsg = (ev: MessageEvent) => {
      if (ev.source === window && ev.data?.__shroudExt === 'PONG') {
        setWaExtAvailable(true)
      }
    }
    window.addEventListener('message', onMsg)
    window.addEventListener('focus', checkExt)
    return () => {
      window.removeEventListener('message', onMsg)
      window.removeEventListener('focus', checkExt)
    }
  }, [])

  // Non-blocking visit telemetry to Zylo Central Panel (once per session)
  useEffect(() => {
    if (incomingPeerId) return
    try {
      if (sessionStorage.getItem('shroud_visit_sent')) return
      sessionStorage.setItem('shroud_visit_sent', '1')
      const isNew = !localStorage.getItem('shroud_seen_before')
      localStorage.setItem('shroud_seen_before', '1')
      fetch('https://zylo.stream/api/stats/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'shroud', isNew }),
      }).catch(() => {})
    } catch {
      // ignore
    }
  }, [incomingPeerId])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    return () => {
      if (media?.objectUrl) URL.revokeObjectURL(media.objectUrl)
    }
  }, [media])

  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url)
      p2pHostRef.current?.destroy()
    }
  }, [result])

  // If opened on phone via P2P QR (?p2p=<peerId>), receive .wastickers directly from PC
  useEffect(() => {
    if (!incomingPeerId) return
    let cancelled = false
    receiveP2pStickerFromHost(incomingPeerId, (st) => {
      if (!cancelled) setMobileReceiveStatus(st)
    })
      .then((item) => {
        if (cancelled) return
        setReceivedSticker(item)
        // Auto-trigger download of .wastickers on the phone
        const dlUrl = URL.createObjectURL(item.wastickersBlob)
        const a = document.createElement('a')
        a.href = dlUrl
        a.download = item.filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(dlUrl), 5000)
      })
      .catch((err) => {
        if (!cancelled) {
          setMobileReceiveStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
        }
      })
    return () => {
      cancelled = true
    }
  }, [incomingPeerId])

  const loadFile = async (file: File) => {
    setUrlError(null)
    setWaSendStatus(null)
    try {
      const info = await probeMediaFile(file)
      setMedia(info)
      setStickerName(info.name.replace(/\.[^.]+$/, '') || 'sticker')
      setResult(null)
      setViewMode('source')

      // Probe video audio track by default (if non-GIF)
      const probedAudio = !info.isGif ? await probeAudioSource(file, true) : null
      setVideoOriginalAudio(probedAudio)
      setAudioTrack(probedAudio)

      setSettings((prev) => ({
        ...prev,
        trimStart: 0,
        trimEnd: Number(Math.min(info.duration, WHATSAPP_MAX_DURATION_SEC).toFixed(2)),
        speed: 1,
        reverse: false,
        crop: null,
        canvasScale: 1,
        canvasX: 0,
        canvasY: 0,
        rotationDeg: 0,
        flipH: false,
        fps: Math.min(15, info.sourceFps),
        cursedLevel: 0,
        audioEnabled: !!probedAudio,
        audioVolume: 1,
        audioStart: 0,
        audioEnd: probedAudio
          ? Number(Math.min(probedAudio.duration, info.duration, WHATSAPP_MAX_DURATION_SEC).toFixed(2))
          : 0,
        loopVideoToAudio: false,
      }))
      setStep(2)
      appendLog(
        `> Media loaded: ${info.name} (${info.width}×${info.height}, ${info.duration.toFixed(2)}s, ${(
          info.sizeBytes / 1024
        ).toFixed(1)} KB${probedAudio ? ', with audio' : ''})`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUrlError(msg)
      appendLog(`! Error: ${msg}`)
    }
  }

  const handleUploadAudioFile = async (file: File) => {
    const probed = await probeAudioSource(file, false)
    if (!probed) {
      appendLog(`! Could not decode audio from "${file.name}".`)
      return
    }
    setAudioTrack(probed)
    setSettings((prev) => {
      const vidDur = Math.min(WHATSAPP_MAX_DURATION_SEC, Math.max(0.2, (prev.trimEnd - prev.trimStart) / Math.max(0.1, prev.speed)))
      return {
        ...prev,
        audioEnabled: true,
        audioStart: 0,
        audioEnd: Number(Math.min(probed.duration, vidDur, WHATSAPP_MAX_DURATION_SEC).toFixed(2)),
        audioVolume: 1,
      }
    })
    appendLog(`> Custom audio loaded: ${probed.name} (${probed.duration.toFixed(2)}s)`)
  }

  const handleRemoveAudio = () => {
    setAudioTrack(null)
    setSettings((prev) => ({ ...prev, audioEnabled: false, loopVideoToAudio: false }))
    appendLog('> Audio track removed.')
  }

  const handleRestoreVideoAudio = () => {
    if (!videoOriginalAudio) return
    setAudioTrack(videoOriginalAudio)
    setSettings((prev) => ({
      ...prev,
      audioEnabled: true,
      audioStart: Math.min(videoOriginalAudio.duration, prev.trimStart),
      audioEnd: Math.min(videoOriginalAudio.duration, prev.trimEnd),
      loopVideoToAudio: false,
    }))
    appendLog('> Restored original video audio.')
  }

  const handleUrlSubmit = useCallback(
    async (url: string) => {
      setUrlLoading(true)
      setUrlError(null)
      appendLog(`> Fetching URL: ${url}`)
      try {
        const file = await downloadMediaFromUrl(url, t, appendLog)
        await loadFile(file)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setUrlError(msg)
        appendLog(`! ${msg}`)
      } finally {
        setUrlLoading(false)
      }
    },
    [t, appendLog]
  )

  // Auto-load ?url=... parameter (from SHROUD Chrome/Firefox extension)
  const autoUrlHandledRef = useRef(false)
  useEffect(() => {
    if (autoUrlHandledRef.current) return
    const params = new URLSearchParams(window.location.search)
    const incomingUrl = params.get('url')?.trim()
    if (incomingUrl && /^https?:\/\//i.test(incomingUrl)) {
      autoUrlHandledRef.current = true
      handleUrlSubmit(incomingUrl)
    }
  }, [handleUrlSubmit])

  const handleSettingsChange = (patch: Partial<StickerSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }

  const handleForge = async () => {
    if (!media || encoding) return
    setEncoding(true)
    setProgress(0.02)
    setStatusText(t.forgingButton)
    setResult(null)
    setWaSendStatus(null)

    try {
      const encoded = await stickerEngine.encodeSticker(
        media,
        settings,
        {
          onLog: appendLog,
          onProgress: (ratio, text) => {
            setProgress(ratio)
            setStatusText(text)
          },
        },
        audioTrack
      )
      setResult(encoded)
      setViewMode('result')
      const kb = (encoded.sizeBytes / 1024).toFixed(1)
      setStatusText(`${t.forgedStatus} · ${kb} KB (${encoded.fpsUsed}fps, q${encoded.qualityUsed})`)
      appendLog(`> ✓ Ready: ${kb} KB | ${encoded.width}×${encoded.height} | ${encoded.durationSec.toFixed(2)}s`)
      fetch('https://zylo.stream/api/stats/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'shroud_forge', isNew: false }),
      }).catch(() => {})
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatusText(`Error: ${msg}`)
      appendLog(`! Error: ${msg}`)
    } finally {
      setEncoding(false)
    }
  }

  const startQrP2pForResult = async (packBlob?: Blob, customFilename?: string) => {
    if (!packBlob && (!result || !media)) return
    const stem = (packName || media?.name.replace(/\.[^.]+$/, '') || 'shroud-pack').trim()
    const filename = customFilename || `${stem}.wastickers`
    const finalPack =
      packBlob ??
      (await buildWastickersPack(
        [
          {
            id: 'single',
            name: stickerName || 'sticker',
            blob: result!.blob,
            url: result!.url,
            sizeBytes: result!.sizeBytes,
          },
        ],
        stem
      ))

    p2pHostRef.current?.destroy()
    setP2pStatus('Initializing WebRTC P2P channel...')

    const wastickersBytes = await finalPack.arrayBuffer()
    const webpBytes = result ? await result.blob.arrayBuffer() : new ArrayBuffer(0)

    try {
      const session = await startP2pStickerHost(
        { filename, wastickersBytes, webpBytes },
        (st) => {
          setP2pStatus(st)
          appendLog(`> [P2P] ${st}`)
        }
      )
      p2pHostRef.current = session
      setQrDataUrl(session.qrDataUrl)
    } catch {
      const fallbackQr = await generateAppQrDataUrl(window.location.href)
      setQrDataUrl(fallbackQr)
      setP2pStatus('WebRTC signaling unavailable; transfer the file to your mobile.')
    }
  }

  const handleDownload = async () => {
    if (!result || !media) return
    const stem = (stickerName || media.name.replace(/\.[^.]+$/, '') || 'sticker').trim()
    const a = document.createElement('a')
    a.href = result.url
    a.download = `${stem}.webp`
    document.body.appendChild(a)
    a.click()
    a.remove()
    appendLog(`> Exported .webp: ${stem}.webp`)
    await startQrP2pForResult()
  }

  const handleSendToWhatsAppWeb = async (targetMode: 'self' | 'active', openForward: boolean) => {
    if (!result || waSending) return
    setWaSending(true)
    setWaSendStatus(t.sendToWaWebSending)
    try {
      const hasExt = waExtAvailable || (await pingShroudExtension(600))
      if (!hasExt) {
        setWaExtAvailable(false)
        setWaSendStatus(null)
        return
      }
      setWaExtAvailable(true)
      const res = await sendStickerToWhatsAppWeb({
        webpBlob: result.blob,
        oggBlob: result.oggBlob,
        durationSec: result.audioDurationSec ?? result.durationSec,
        isAnimated: result.durationSec > 0.2,
        targetMode,
        openForward,
      })
      if (res.ok) {
        setWaSendStatus(
          result.oggBlob
            ? '✓ Sent to WhatsApp Web with audio!'
            : '✓ Sent sticker to WhatsApp Web!'
        )
        appendLog(
          `> ✓ Sent to WhatsApp Web (${result.oggBlob ? 'WebP + OGG/Opus audio' : 'WebP'}).`
        )
      } else {
        setWaSendStatus(`! ${res.error || 'Failed to send to WhatsApp Web.'}`)
        appendLog(`! WhatsApp Web send failed: ${res.error || 'Unknown error'}`)
      }
    } finally {
      setWaSending(false)
    }
  }

  const handleAddToPack = () => {
    if (!result) return
    setPackError(null)
    if (packItems.length >= 30) {
      setPackError('WhatsApp pack limit is 30 stickers.')
      return
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const url = URL.createObjectURL(result.blob)
    const cleanName = (stickerName || `sticker-${packItems.length + 1}`).trim()
    setPackItems((prev) => [
      ...prev,
      { id, name: cleanName, blob: result.blob, url, sizeBytes: result.sizeBytes },
    ])
    appendLog(`> Added "${cleanName}" to pack (${packItems.length + 1}/30).`)
  }

  const handleDropWebpFiles = async (files: FileList | File[]) => {
    setPackError(null)
    const list = Array.from(files)
    for (const file of list) {
      if (packItems.length >= 30) {
        setPackError('WhatsApp pack limit is 30 stickers.')
        break
      }
      const check = await validateWhatsAppWebp(file)
      if (!check.ok) {
        setPackError(`${file.name}: ${check.reason}`)
        appendLog(`! Rejected ${file.name}: ${check.reason}`)
        continue
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const url = URL.createObjectURL(file)
      const cleanName = file.name.replace(/\.[^.]+$/, '') || 'sticker'
      setPackItems((prev) => [
        ...prev,
        { id, name: cleanName, blob: file, url, sizeBytes: file.size },
      ])
      appendLog(`> Added external .webp "${cleanName}" to pack.`)
    }
  }

  const handleRenamePackItem = (id: string, nextName: string) => {
    setPackItems((prev) => prev.map((it) => (it.id === id ? { ...it, name: nextName } : it)))
  }

  const handleRemovePackItem = (id: string) => {
    setPackItems((prev) => {
      const target = prev.find((it) => it.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((it) => it.id !== id)
    })
  }

  const handleClearPack = () => {
    packItems.forEach((it) => URL.revokeObjectURL(it.url))
    setPackItems([])
    setPackError(null)
    appendLog('> Cleared sticker pack list.')
  }

  const handleDownloadPack = async () => {
    if (packItems.length === 0) return
    setPackError(null)
    const cleanPackTitle = (packName || 'SHROUD Pack').trim()
    const filename = `${cleanPackTitle.replace(/[^a-zA-Z0-9_-]+/g, '_')}.wastickers`
    appendLog(`> Packing ${packItems.length} sticker(s) into ${filename}...`)
    try {
      const packBlob = await buildWastickersPack(packItems, cleanPackTitle)
      const url = URL.createObjectURL(packBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)

      appendLog(`> ✓ Exported ${filename} (${(packBlob.size / 1024).toFixed(1)} KB). Starting P2P QR host...`)
      await startQrP2pForResult(packBlob, filename)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPackError(msg)
      appendLog(`! Error packing .wastickers: ${msg}`)
    }
  }

  const handleMobileShareWastickers = async () => {
    if (!receivedSticker) return
    const file = new File([receivedSticker.wastickersBlob], receivedSticker.filename, {
      type: 'application/octet-stream',
    })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'SHROUD WhatsApp Sticker Pack',
          files: [file],
        })
        return
      } catch {
        // fall back to direct download
      }
    }
    const dlUrl = URL.createObjectURL(receivedSticker.wastickersBlob)
    const a = document.createElement('a')
    a.href = dlUrl
    a.download = receivedSticker.filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(dlUrl), 4000)
  }

  return (
    <div className="app-shell">
      <BloodBackdrop />
      <AdBannerRail slot="viewer_left" lang={lang} />
      <AdBannerRail slot="viewer_right" lang={lang} />

      {/* Top Hyprland-style status bar */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand-pill">
            <img
              src={`${import.meta.env.BASE_URL}logos/logo-shroud-sigil.svg`}
              alt="SHROUD Sigil"
              className="brand-sigil-img"
            />
            <span className="brand-name">{t.appTitle}</span>
          </div>
          <span className="status-pill">
            <ShieldCheck size={12} />
            {t.localBadge}
          </span>
        </div>

        <div className="topbar-right">
          <span className="spec-pill">{t.specBadge}</span>
          <label className="lang-pill" title={t.langLabel}>
            <Globe size={13} className="icon-crimson" />
            <span className="lang-prefix">{t.langLabel}</span>
            <select
              aria-label="Language"
              value={lang}
              onChange={(e) => handleLangChange(e.target.value as LangCode)}
              className="lang-select"
            >
              {SUPPORTED_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* Dynamic Step-by-Step Wizard Bar */}
      <nav className="stepper-bar" aria-label="Steps">
        <button
          type="button"
          className={`step-tab ${step === 1 ? 'active' : ''}`}
          onClick={() => setStep(1)}
        >
          {t.step1Title}
        </button>
        <span className="step-sep">›</span>
        <button
          type="button"
          className={`step-tab ${step === 2 ? 'active' : ''}`}
          disabled={!media}
          onClick={() => setStep(2)}
        >
          {t.step2Title}
        </button>
        <span className="step-sep">›</span>
        <button
          type="button"
          className={`step-tab ${step === 3 ? 'active' : ''}`}
          disabled={!media}
          onClick={() => setStep(3)}
        >
          {t.step3Title}
        </button>
      </nav>

      {/* Main studio workspace (or Mobile P2P Receiver View when opened via QR) */}
      {incomingPeerId ? (
        <main className="workspace-grid single-step">
          <section className="panel p2p-receiver-card">
            <div className="panel-header">
              <div className="panel-title-group">
                <Smartphone size={15} className="icon-crimson" />
                <span className="panel-title">{t.p2pReceivingTitle}</span>
              </div>
            </div>

            <div className="p2p-status-badge">{mobileReceiveStatus}</div>

            {receivedSticker && (
              <div className="result-preview-wrap">
                <div className="checkerboard-box">
                  <img
                    src={receivedSticker.webpUrl}
                    alt="Received WhatsApp Sticker"
                    className="result-webp-img"
                  />
                </div>
                <div className="p2p-mobile-actions">
                  <button
                    type="button"
                    className="btn-crimson forge-main-btn"
                    onClick={handleMobileShareWastickers}
                  >
                    <Share2 size={15} />
                    {t.p2pShareStickerMaker}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary forge-main-btn"
                    onClick={handleMobileShareWastickers}
                  >
                    <Download size={15} />
                    {t.p2pDownloadWastickers} ({receivedSticker.filename})
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className={`workspace-grid ${step === 1 && !media ? 'with-pack-only' : 'with-pack-full'}`}>
          {(step !== 1 || media) && (
            <CropStage
              t={t}
              stickerName={stickerName}
              media={media}
              canvasBg={settings.canvasBg}
              canvasScale={settings.canvasScale}
              canvasX={settings.canvasX}
              canvasY={settings.canvasY}
              rotationDeg={settings.rotationDeg}
              flipH={settings.flipH}
              trimStart={settings.trimStart}
              trimEnd={settings.trimEnd}
              speed={settings.speed}
              audioTrack={audioTrack}
              videoHasOriginalAudio={!!videoOriginalAudio}
              audioEnabled={settings.audioEnabled}
              audioVolume={settings.audioVolume}
              audioStart={settings.audioStart}
              audioEnd={settings.audioEnd}
              loopVideoToAudio={settings.loopVideoToAudio}
              result={result}
              viewMode={viewMode}
              interactive={step === 2}
              onStickerNameChange={setStickerName}
              onViewModeChange={setViewMode}
              onTrimChange={(start, end) =>
                handleSettingsChange({ trimStart: start, trimEnd: end })
              }
              onTransformChange={(patch) => handleSettingsChange(patch)}
              onAudioSettingsChange={(patch) => handleSettingsChange(patch)}
              onUploadAudioFile={handleUploadAudioFile}
              onRemoveAudio={handleRemoveAudio}
              onRestoreVideoAudio={handleRestoreVideoAudio}
              onResetTransform={() =>
                handleSettingsChange({ canvasScale: 1, canvasX: 0, canvasY: 0, rotationDeg: 0, flipH: false })
              }
            />
          )}

          <ToolRack
            t={t}
            step={step}
            media={media}
            settings={settings}
            urlLoading={urlLoading}
            urlError={urlError}
            encoding={encoding}
            result={result}
            qrDataUrl={qrDataUrl}
            p2pStatus={p2pStatus}
            waSending={waSending}
            waSendStatus={waSendStatus}
            onStepChange={setStep}
            onFileSelected={loadFile}
            onUrlSubmit={handleUrlSubmit}
            onSettingsChange={handleSettingsChange}
            onForge={handleForge}
            onDownload={handleDownload}
            onAddToPack={handleAddToPack}
            onSendToWhatsAppWeb={handleSendToWhatsAppWeb}
          />

          <PackSidebar
            t={t}
            packName={packName}
            items={packItems}
            packError={packError}
            onPackNameChange={setPackName}
            onDropWebpFiles={handleDropWebpFiles}
            onRenameItem={handleRenamePackItem}
            onRemoveItem={handleRemovePackItem}
            onClearPack={handleClearPack}
            onDownloadPack={handleDownloadPack}
          />
        </main>
      )}

      {/* Bottom Terminal & Progress Bar */}
      <footer className="panel footer-terminal">
        <div className="terminal-log-box">
          <div className="terminal-header">
            <Terminal size={12} className="icon-crimson" />
            <span>shroud@local-wasm:~/sticker-forge</span>
          </div>
          <div className="terminal-lines">
            {logs.map((line, idx) => (
              <div key={idx} className={`term-line ${line.startsWith('!') ? 'term-err' : ''}`}>
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        <div className="forge-actions">
          <div className="progress-wrap">
            <div className="progress-meta">
              <span>{statusText}</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="progress-track">
              <div
                className={`progress-fill ${encoding ? 'forging' : ''}`}
                style={{ width: `${Math.round(progress * 100)}%` }}
              >
                {encoding && (
                  <span className="forge-sparks" aria-hidden="true">
                    <i className="spark s1" />
                    <i className="spark s2" />
                    <i className="spark s3" />
                    <i className="spark s4" />
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
