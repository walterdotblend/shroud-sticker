import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe, ShieldCheck, Skull, Terminal } from 'lucide-react'
import { BloodBackdrop } from './components/backdrop/BloodBackdrop'
import { CropStage } from './components/CropStage'
import { ToolRack, type WizardStep } from './components/ToolRack'
import { stickerEngine } from './engine/ffmpegClient'
import { probeMediaFile } from './engine/mediaProbe'
import {
  WHATSAPP_MAX_DURATION_SEC,
  WHATSAPP_SAFE_TARGET_BYTES,
  WHATSAPP_STICKER_SIZE,
  type CropAspect,
  type EncodeResult,
  type MediaInfo,
  type StickerSettings,
} from './engine/types'
import { downloadMediaFromUrl } from './engine/urlLoader'
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
  targetSize: WHATSAPP_STICKER_SIZE,
  fps: 15,
  quality: 75,
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
  const [aspect, setAspect] = useState<CropAspect>('free')
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
    }
  }, [result])

  const loadFile = async (file: File) => {
    setUrlError(null)
    try {
      const info = await probeMediaFile(file)
      setMedia(info)
      setResult(null)
      setViewMode('source')
      setAspect('free')
      setSettings((prev) => ({
        ...prev,
        trimStart: 0,
        trimEnd: Number(Math.min(info.duration, WHATSAPP_MAX_DURATION_SEC).toFixed(2)),
        speed: 1,
        reverse: false,
        crop: null,
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

  const handleUrlSubmit = async (url: string) => {
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
  }

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

  const handleDownload = () => {
    if (!result || !media) return
    const stem = media.name.replace(/\.[^.]+$/, '') || 'sticker'
    const a = document.createElement('a')
    a.href = result.url
    a.download = `${stem}-whatsapp.webp`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="app-shell">
      <BloodBackdrop />

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
          <label className="lang-pill" title="Language">
            <Globe size={12} className="icon-crimson" />
            <select
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

      {/* Main studio workspace */}
      <main className={`workspace-grid ${step === 1 && !media ? 'single-step' : ''}`}>
        {(step !== 1 || media) && (
          <CropStage
            t={t}
            media={media}
            crop={settings.crop}
            aspect={aspect}
            trimStart={settings.trimStart}
            trimEnd={settings.trimEnd}
            speed={settings.speed}
            result={result}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onCropChange={(crop) => handleSettingsChange({ crop })}
          />
        )}

        <ToolRack
          t={t}
          step={step}
          media={media}
          settings={settings}
          aspect={aspect}
          urlLoading={urlLoading}
          urlError={urlError}
          encoding={encoding}
          result={result}
          onStepChange={setStep}
          onFileSelected={loadFile}
          onUrlSubmit={handleUrlSubmit}
          onSettingsChange={handleSettingsChange}
          onAspectChange={setAspect}
          onForge={handleForge}
          onDownload={handleDownload}
        />
      </main>

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
              <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
