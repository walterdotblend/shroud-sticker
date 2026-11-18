import { useRef, useState } from 'react'
import {
  Clock,
  Crop,
  Download,
  Flame,
  Gauge,
  Link2,
  Maximize2,
  RotateCcw,
  Upload,
} from 'lucide-react'
import { computeEffectiveDuration } from '../engine/ffmpegArgs'
import {
  WHATSAPP_MAX_DURATION_SEC,
  type CropAspect,
  type CropRect,
  type FitMode,
  type MediaInfo,
  type StickerSettings,
} from '../engine/types'

interface ToolRackProps {
  media: MediaInfo | null
  settings: StickerSettings
  aspect: CropAspect
  urlLoading: boolean
  urlError: string | null
  onFileSelected: (file: File) => void
  onUrlSubmit: (url: string) => void
  onSettingsChange: (patch: Partial<StickerSettings>) => void
  onAspectChange: (aspect: CropAspect) => void
}

const SPEED_PRESETS = [0.5, 1, 1.5, 2, 3, 4]
const ASPECT_PRESETS: { id: CropAspect; label: string }[] = [
  { id: '1:1', label: '1:1' },
  { id: 'free', label: 'Libre' },
  { id: '16:9', label: '16:9' },
  { id: '4:3', label: '4:3' },
  { id: '9:16', label: '9:16' },
]

const FIT_MODES: { id: FitMode; label: string; hint: string }[] = [
  { id: 'contain-transparent', label: 'Contain (Transparente)', hint: 'Mantiene proporción con fondo alpha' },
  { id: 'cover', label: 'Cover (Llenar 512×512)', hint: 'Recorta bordes para llenar el cuadro' },
  { id: 'contain-dark', label: 'Contain (Fondo Oscuro)', hint: 'Bordes color obsidiana #080709' },
  { id: 'stretch', label: 'Estirar (Stretch)', hint: 'Ajusta exacto a 512×512' },
]

function computeCenteredAspectCrop(width: number, height: number, aspect: CropAspect): CropRect | null {
  if (aspect === 'free') return null
  const ratio =
    aspect === '1:1' ? 1 : aspect === '16:9' ? 16 / 9 : aspect === '4:3' ? 4 / 3 : 9 / 16
  let cw = width
  let ch = Math.round(cw / ratio)
  if (ch > height) {
    ch = height
    cw = Math.round(ch * ratio)
  }
  return {
    x: Math.round((width - cw) / 2),
    y: Math.round((height - ch) / 2),
    width: cw,
    height: ch,
  }
}

export function ToolRack({
  media,
  settings,
  aspect,
  urlLoading,
  urlError,
  onFileSelected,
  onUrlSubmit,
  onSettingsChange,
  onAspectChange,
}: ToolRackProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [urlInput, setUrlInput] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const maxDur = media ? Math.max(0.5, media.duration) : 10
  const effectiveDuration = computeEffectiveDuration(settings.trimStart, settings.trimEnd, settings.speed)
  const durationTooLong = effectiveDuration > WHATSAPP_MAX_DURATION_SEC

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFileSelected(file)
  }

  const handleAspectPick = (next: CropAspect) => {
    onAspectChange(next)
    if (media) {
      onSettingsChange({ crop: computeCenteredAspectCrop(media.width, media.height, next) })
    }
  }

  return (
    <div className="tool-rack">
      {/* 1. SOURCE */}
      <section className="panel">
        <div className="panel-header">
          <div className="panel-title-group">
            <Upload size={14} className="icon-crimson" />
            <span className="panel-title">01 // FUENTE (GIF / VIDEO)</span>
          </div>
          {media && (
            <span className="muted-meta">
              {media.width}×{media.height} · {(media.sizeBytes / 1024).toFixed(0)} KB
            </span>
          )}
        </div>

        <div
          className={`dropzone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/gif,image/webp,video/mp4,video/webm,video/quicktime,video/x-matroska,.gif,.mp4,.webm,.mov,.mkv,.webp"
            className="hidden-input"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFileSelected(f)
              e.target.value = ''
            }}
          />
          <span className="dropzone-main">
            {media ? `Archivo: ${media.name}` : 'Arrastra un GIF o video corto aquí (o haz clic)'}
          </span>
          <span className="dropzone-sub">Procesamiento 100% local en tu PC · GIF, MP4, WebM, MOV</span>
        </div>

        <form
          className="url-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (urlInput.trim()) onUrlSubmit(urlInput.trim())
          }}
        >
          <div className="url-input-wrap">
            <Link2 size={13} className="url-icon" />
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://... enlace directo a .gif o .mp4"
              className="terminal-input"
            />
          </div>
          <button type="submit" className="btn-secondary" disabled={urlLoading || !urlInput.trim()}>
            <Download size={13} />
            {urlLoading ? 'Bajando...' : 'Cargar'}
          </button>
        </form>
        {urlError && <p className="error-line">{urlError}</p>}
      </section>

      {/* 2. TRIM & SPEED */}
      <section className="panel">
        <div className="panel-header">
          <div className="panel-title-group">
            <Clock size={14} className="icon-crimson" />
            <span className="panel-title">02 // DURACIÓN &amp; VELOCIDAD</span>
          </div>
          <span className={`duration-badge ${durationTooLong ? 'warn' : 'ok'}`}>
            Final: {effectiveDuration.toFixed(2)}s {durationTooLong ? '(Máx 10s WhatsApp)' : '✓'}
          </span>
        </div>

        <div className="control-grid">
          <div className="control-row">
            <label className="control-label">
              Inicio: <strong>{settings.trimStart.toFixed(2)}s</strong>
            </label>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, settings.trimEnd - 0.1)}
              step={0.05}
              value={settings.trimStart}
              disabled={!media}
              onChange={(e) => onSettingsChange({ trimStart: Number(e.target.value) })}
              className="crimson-slider"
            />
          </div>

          <div className="control-row">
            <label className="control-label">
              Fin: <strong>{settings.trimEnd.toFixed(2)}s</strong>
            </label>
            <input
              type="range"
              min={Math.min(maxDur, settings.trimStart + 0.1)}
              max={maxDur}
              step={0.05}
              value={settings.trimEnd}
              disabled={!media}
              onChange={(e) => onSettingsChange({ trimEnd: Number(e.target.value) })}
              className="crimson-slider"
            />
          </div>

          <div className="control-row">
            <div className="control-label-row">
              <span className="control-label">
                <Gauge size={12} /> Acelerar / Velocidad: <strong>{settings.speed.toFixed(2)}×</strong>
              </span>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={settings.reverse}
                  onChange={(e) => onSettingsChange({ reverse: e.target.checked })}
                />
                <span>Reversa</span>
              </label>
            </div>
            <div className="chip-row">
              {SPEED_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`mini-chip ${Math.abs(settings.speed - s) < 0.01 ? 'active' : ''}`}
                  onClick={() => onSettingsChange({ speed: s })}
                >
                  {s}×
                </button>
              ))}
            </div>
            <input
              type="range"
              min={0.25}
              max={4}
              step={0.05}
              value={settings.speed}
              onChange={(e) => onSettingsChange({ speed: Number(e.target.value) })}
              className="crimson-slider"
            />
          </div>
        </div>
      </section>

      {/* 3. CROP & RESIZE */}
      <section className="panel">
        <div className="panel-header">
          <div className="panel-title-group">
            <Crop size={14} className="icon-crimson" />
            <span className="panel-title">03 // RECORTAR &amp; REDIMENSIONAR</span>
          </div>
          <button
            type="button"
            className="btn-link-sm"
            disabled={!media}
            onClick={() => {
              onAspectChange('free')
              onSettingsChange({ crop: null })
            }}
          >
            <RotateCcw size={11} /> Sin recorte
          </button>
        </div>

        <div className="control-grid">
          <div className="control-row">
            <span className="control-label">Proporción de recorte (arrastra el cuadro en el visor):</span>
            <div className="chip-row">
              {ASPECT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`mini-chip ${aspect === p.id ? 'active' : ''}`}
                  onClick={() => handleAspectPick(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-row">
            <span className="control-label">
              <Maximize2 size={12} /> Ajuste a 512×512 (WhatsApp):
            </span>
            <select
              value={settings.fitMode}
              onChange={(e) => onSettingsChange({ fitMode: e.target.value as FitMode })}
              className="terminal-select"
            >
              {FIT_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.hint}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 4. AUTO COMPRESS */}
      <section className="panel">
        <div className="panel-header">
          <div className="panel-title-group">
            <Flame size={14} className="icon-crimson" />
            <span className="panel-title">04 // COMPRESIÓN WHATSAPP</span>
          </div>
          <label className="toggle-pill">
            <input
              type="checkbox"
              checked={settings.autoCompressWhatsApp}
              onChange={(e) => onSettingsChange({ autoCompressWhatsApp: e.target.checked })}
            />
            <span>Auto ≤ 500 KB</span>
          </label>
        </div>

        <div className="control-grid two-col">
          <div className="control-row">
            <label className="control-label">
              FPS: <strong>{settings.fps}</strong>
            </label>
            <input
              type="range"
              min={8}
              max={30}
              step={1}
              value={settings.fps}
              onChange={(e) => onSettingsChange({ fps: Number(e.target.value) })}
              className="crimson-slider"
            />
          </div>

          <div className="control-row">
            <label className="control-label">
              Calidad inicial: <strong>{settings.quality}%</strong>
            </label>
            <input
              type="range"
              min={15}
              max={95}
              step={5}
              value={settings.quality}
              onChange={(e) => onSettingsChange({ quality: Number(e.target.value) })}
              className="crimson-slider"
            />
          </div>
        </div>
      </section>
    </div>
  )
}
