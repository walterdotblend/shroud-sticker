import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Globe, Share2, ShieldCheck, Skull, Smartphone, Terminal } from 'lucide-react'
import { AdBannerRail } from './components/AdBannerRail'
import { BloodBackdrop } from './components/backdrop/BloodBackdrop'
import { CropStage } from './components/CropStage'
import { ToolRack, type WizardStep } from './components/ToolRack'
import { stickerEngine } from './engine/ffmpegClient'
import { probeMediaFile } from './engine/mediaProbe'
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
  type EncodeResult,
  type MediaInfo,
  type StickerSettings,
} from './engine/types'
import { downloadMediaFromUrl } from './engine/urlLoader'
import { buildWastickersPack, generateAppQrDataUrl } from './engine/wastickers'
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
  targetSize: WHATSAPP_STICKER_SIZE,
  fps: 15,
  quality: 75,
  cursedLevel: 0,
  removeBg: false,
  bgModel: 'modnet',
  compressionLevel: 4,
  autoCompressWhatsApp: true,
  maxBytes: WHATSAPP_SAFE_TARGET_BYTES,
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
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [p2pStatus, setP2pStatus] = useState<string | null>(null)
  const p2pHostRef = useRef<P2pHostSession | null>(null)

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
    try {
      const info = await probeMediaFile(file)
      setMedia(info)
      setResult(null)
      setViewMode('source')
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
        fps: Math.min(15, info.sourceFps),
        cursedLevel: 0,
      }))
      setStep(2)
      appendLog(
        `> Media loaded: ${info.name} (${info.width}×${info.height}, ${info.duration.toFixed(2)}s, ${(
          info.sizeBytes / 1024
        ).toFixed(1)} KB)`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUrlError(msg)
      appendLog(`! Error: ${msg}`)
    }
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

    try {
      const encoded = await stickerEngine.encodeSticker(media, settings, {
        onLog: appendLog,
        onProgress: (ratio, text) => {
          setProgress(ratio)
          setStatusText(text)
        },
      })
      setResult(encoded)
      setViewMode('result')
      const kb = (encoded.sizeBytes / 1024).toFixed(1)
      setStatusText(`${t.forgedStatus} · ${kb} KB (${encoded.fpsUsed}fps, q${encoded.qualityUsed})`)
      appendLog(`> ✓ Ready: ${kb} KB | ${encoded.width}×${encoded.height} | ${encoded.durationSec.toFixed(2)}s`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatusText(`Error: ${msg}`)
      appendLog(`! Error: ${msg}`)
    } finally {
      setEncoding(false)
    }
  }

  const startQrP2pForResult = async (packBlob?: Blob) => {
    if (!result || !media) return
    const stem = media.name.replace(/\.[^.]+$/, '') || 'shroud-pack'
    const filename = `${stem}.wastickers`
    const finalPack = packBlob ?? (await buildWastickersPack(result.blob, result.url, stem))

    p2pHostRef.current?.destroy()
    setP2pStatus('Initializing WebRTC P2P channel...')

    const [wastickersBytes, webpBytes] = await Promise.all([
      finalPack.arrayBuffer(),
      result.blob.arrayBuffer(),
    ])

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
    const stem = media.name.replace(/\.[^.]+$/, '') || 'sticker'
    const a = document.createElement('a')
    a.href = result.url
    a.download = `${stem}-whatsapp.webp`
    document.body.appendChild(a)
    a.click()
    a.remove()
    appendLog(`> Exported .webp: ${stem}-whatsapp.webp`)
    await startQrP2pForResult()
  }

  const handleDownloadWastickers = async () => {
    if (!result || !media) return
    const stem = media.name.replace(/\.[^.]+$/, '') || 'shroud-pack'
    const filename = `${stem}.wastickers`
    appendLog(`> Packing .wastickers archive (3 slots for 1-tap WhatsApp import)...`)
    try {
      const packBlob = await buildWastickersPack(result.blob, result.url, stem)
      const url = URL.createObjectURL(packBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)

      appendLog(`> ✓ Exported ${filename} (${(packBlob.size / 1024).toFixed(1)} KB). Starting P2P QR host...`)
      await startQrP2pForResult(packBlob)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
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
            <Skull size={14} className="icon-crimson" />
            <span className="brand-name">{t.appTitle}</span>
          </div>
          <span className="status-pill">
            <ShieldCheck size={12} />
            {t.localBadge}
          </span>
        </div>

        <div className="topbar-right">
          <span className="spec-pill">{t.specBadge}</span>
          <label className="lang-pill" title="Language / Idioma">
            <Globe size={13} className="icon-crimson" />
            <span className="lang-prefix">Idioma:</span>
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
        <main className={`workspace-grid ${step === 1 && !media ? 'single-step' : ''}`}>
          {(step !== 1 || media) && (
            <CropStage
              t={t}
              media={media}
              canvasBg={settings.canvasBg}
              canvasScale={settings.canvasScale}
              canvasX={settings.canvasX}
              canvasY={settings.canvasY}
              rotationDeg={settings.rotationDeg}
              trimStart={settings.trimStart}
              trimEnd={settings.trimEnd}
              speed={settings.speed}
              result={result}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onTransformChange={(patch) => handleSettingsChange(patch)}
              onResetTransform={() =>
                handleSettingsChange({ canvasScale: 1, canvasX: 0, canvasY: 0, rotationDeg: 0 })
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
            onStepChange={setStep}
            onFileSelected={loadFile}
            onUrlSubmit={handleUrlSubmit}
            onSettingsChange={handleSettingsChange}
            onForge={handleForge}
            onDownload={handleDownload}
            onDownloadWastickers={handleDownloadWastickers}
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
