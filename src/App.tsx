import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Flame, ShieldCheck, Skull, Terminal } from 'lucide-react'
import { BloodBackdrop } from './components/backdrop/BloodBackdrop'
import { CropStage } from './components/CropStage'
import { ToolRack } from './components/ToolRack'
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
  const [media, setMedia] = useState<MediaInfo | null>(null)
  const [settings, setSettings] = useState<StickerSettings>(INITIAL_SETTINGS)
  const [aspect, setAspect] = useState<CropAspect>('free')
  const [viewMode, setViewMode] = useState<'source' | 'result'>('source')

  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  const [encoding, setEncoding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('Listo para forjar.')
  const [logs, setLogs] = useState<string[]>([
    '> SHROUD // WhatsApp Sticker Forge iniciado.',
    '> Motor: FFmpeg.wasm (100% local en tu navegador, cero servidores).',
  ])
  const [result, setResult] = useState<EncodeResult | null>(null)

  const logEndRef = useRef<HTMLDivElement>(null)

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [...prev.slice(-80), line])
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Cleanup object URLs on unmount or replacement
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
      appendLog(
        `> Medio cargado: ${info.name} (${info.width}×${info.height}, ${info.duration.toFixed(2)}s, ${(
          info.sizeBytes / 1024
        ).toFixed(1)} KB)`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUrlError(msg)
      appendLog(`! Error cargando archivo: ${msg}`)
    }
  }

  const handleUrlSubmit = async (url: string) => {
    setUrlLoading(true)
    setUrlError(null)
    appendLog(`> Descargando medio desde URL: ${url}`)
    try {
      const file = await downloadMediaFromUrl(url)
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
    setStatusText('Preparando FFmpeg.wasm...')
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
      setStatusText(`Completado · ${kb} KB (${encoded.fpsUsed}fps, q${encoded.qualityUsed})`)
      appendLog(`> ✓ Sticker listo: ${kb} KB | ${encoded.width}×${encoded.height} | ${encoded.durationSec.toFixed(2)}s`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatusText(`Error: ${msg}`)
      appendLog(`! Error en codificación: ${msg}`)
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
            <span className="brand-name">SHROUD // STICKER FORGE</span>
          </div>
          <span className="status-pill">
            <ShieldCheck size={12} />
            100% LOCAL · WASM
          </span>
        </div>

        <div className="topbar-right">
          <span className="spec-pill">WHATSAPP: 512×512 · ≤500 KB · ≤10s · WEBP</span>
        </div>
      </header>

      {/* Main studio workspace */}
      <main className="workspace-grid">
        <CropStage
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

        <ToolRack
          media={media}
          settings={settings}
          aspect={aspect}
          urlLoading={urlLoading}
          urlError={urlError}
          onFileSelected={loadFile}
          onUrlSubmit={handleUrlSubmit}
          onSettingsChange={handleSettingsChange}
          onAspectChange={setAspect}
        />
      </main>

      {/* Bottom Terminal & Forge Action Bar */}
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

          <div className="action-buttons">
            <button
              type="button"
              className="btn-crimson"
              disabled={!media || encoding}
              onClick={handleForge}
            >
              <Flame size={15} />
              {encoding ? 'Forjando...' : 'Forjar Sticker (.webp)'}
            </button>

            <button
              type="button"
              className="btn-bone"
              disabled={!result || encoding}
              onClick={handleDownload}
            >
              <Download size={15} />
              Descargar .webp
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
