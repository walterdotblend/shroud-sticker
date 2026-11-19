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
  type EncodeResult,
  type FitMode,
  type MediaInfo,
  type StickerSettings,
} from '../engine/types'
import type { Translations } from '../i18n/translations'

export type WizardStep = 1 | 2 | 3

interface ToolRackProps {
  t: Translations
  step: WizardStep
  media: MediaInfo | null
  settings: StickerSettings
  aspect: CropAspect
  urlLoading: boolean
  urlError: string | null
  encoding: boolean
  result: EncodeResult | null
  onStepChange: (step: WizardStep) => void
  onFileSelected: (file: File) => void
  onUrlSubmit: (url: string) => void
  onSettingsChange: (patch: Partial<StickerSettings>) => void
  onAspectChange: (aspect: CropAspect) => void
  onForge: () => void
  onDownload: () => void
}

const SPEED_PRESETS = [0.5, 1, 1.5, 2, 3, 4]

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
  t,
  step,
  media,
  settings,
  aspect,
  urlLoading,
  urlError,
  encoding,
  result,
  onStepChange,
  onFileSelected,
  onUrlSubmit,
  onSettingsChange,
  onAspectChange,
  onForge,
  onDownload,
}: ToolRackProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [urlInput, setUrlInput] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const maxDur = media ? Math.max(0.5, media.duration) : 10
  const effectiveDuration = computeEffectiveDuration(settings.trimStart, settings.trimEnd, settings.speed)
  const durationTooLong = effectiveDuration > WHATSAPP_MAX_DURATION_SEC

  const ASPECT_PRESETS: { id: CropAspect; label: string }[] = [
    { id: '1:1', label: '1:1' },
    { id: 'free', label: t.aspectFree },
    { id: '16:9', label: '16:9' },
    { id: '4:3', label: '4:3' },
    { id: '9:16', label: '9:16' },
  ]

  const FIT_MODES: { id: FitMode; label: string; hint: string }[] = [
    { id: 'contain-transparent', label: t.fitContainTrans, hint: t.fitContainTransHint },
    { id: 'cover', label: t.fitCover, hint: t.fitCoverHint },
    { id: 'contain-dark', label: t.fitContainDark, hint: t.fitContainDarkHint },
    { id: 'stretch', label: t.fitStretch, hint: t.fitStretchHint },
  ]

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

  if (step === 1) {
    return (
      <div className="tool-rack">
        <section className="panel wizard-card">
          <div className="panel-header">
            <div className="panel-title-group">
              <Upload size={14} className="icon-crimson" />
              <span className="panel-title">{t.step1Heading}</span>
            </div>
            {media && (
              <span className="muted-meta">
                {media.width}×{media.height} · {(media.sizeBytes / 1024).toFixed(0)} KB
              </span>
            )}
          </div>

          <p className="wizard-sub">{t.step1Sub}</p>

          <div
            className={`dropzone dropzone-lg ${dragOver ? 'drag-over' : ''}`}
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
              {media ? `${t.dropLoaded} ${media.name}` : t.dropMain}
            </span>
            <span className="dropzone-sub">{t.dropSub}</span>
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
                placeholder={t.urlPlaceholder}
                className="terminal-input"
              />
            </div>
            <button type="submit" className="btn-secondary" disabled={urlLoading || !urlInput.trim()}>
              <Download size={13} />
              {urlLoading ? t.urlLoading : t.urlButton}
            </button>
          </form>
          <p className="muted-meta">{t.urlHint}</p>
          {urlError && <p className="error-line">{urlError}</p>}

          {media && (
            <div className="wizard-nav">
              <button type="button" className="btn-crimson" onClick={() => onStepChange(2)}>
                {t.continueToEdit}
              </button>
            </div>
          )}
        </section>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="tool-rack">
        <section className="panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <Clock size={14} className="icon-crimson" />
              <span className="panel-title">{t.trimSpeedTitle}</span>
            </div>
            <span className={`duration-badge ${durationTooLong ? 'warn' : 'ok'}`}>
              {t.finalDuration} {effectiveDuration.toFixed(2)}s {durationTooLong ? t.max10s : '✓'}
            </span>
          </div>

          <div className="control-grid">
            <div className="control-row">
              <label className="control-label">
                {t.start} <strong>{settings.trimStart.toFixed(2)}s</strong>
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
                {t.end} <strong>{settings.trimEnd.toFixed(2)}s</strong>
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
                  <Gauge size={12} /> {t.speed} <strong>{settings.speed.toFixed(2)}×</strong>
                </span>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={settings.reverse}
                    onChange={(e) => onSettingsChange({ reverse: e.target.checked })}
                  />
                  <span>{t.reverse}</span>
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

        <section className="panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <Crop size={14} className="icon-crimson" />
              <span className="panel-title">{t.cropResizeTitle}</span>
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
              <RotateCcw size={11} /> {t.noCrop}
            </button>
          </div>

          <div className="control-grid">
            <div className="control-row">
              <span className="control-label">{t.cropHint}</span>
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
                <Maximize2 size={12} /> {t.fitLabel}
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

          <div className="wizard-nav">
            <button type="button" className="btn-secondary" onClick={() => onStepChange(1)}>
              {t.backToSource}
            </button>
            <button type="button" className="btn-crimson" onClick={() => onStepChange(3)}>
              {t.continueToForge}
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="tool-rack">
      <section className="panel wizard-card">
        <div className="panel-header">
          <div className="panel-title-group">
            <Flame size={14} className="icon-crimson" />
            <span className="panel-title">{t.compressTitle}</span>
          </div>
          <label className="toggle-pill">
            <input
              type="checkbox"
              checked={settings.autoCompressWhatsApp}
              onChange={(e) => onSettingsChange({ autoCompressWhatsApp: e.target.checked })}
            />
            <span>{t.autoCompress}</span>
          </label>
        </div>

        <div className="control-grid two-col">
          <div className="control-row">
            <label className="control-label">
              {t.fpsLabel} <strong>{settings.fps}</strong>
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
              {t.qualityLabel} <strong>{settings.quality}%</strong>
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

        <div className="action-buttons">
          <button type="button" className="btn-crimson" disabled={!media || encoding} onClick={onForge}>
            <Flame size={15} />
            {encoding ? t.forgingButton : t.forgeButton}
          </button>

          <button type="button" className="btn-bone" disabled={!result || encoding} onClick={onDownload}>
            <Download size={15} />
            {t.downloadButton}
          </button>
        </div>

        <div className="wizard-nav">
          <button type="button" className="btn-secondary" onClick={() => onStepChange(2)}>
            {t.backToEdit}
          </button>
        </div>
      </section>
    </div>
  )
}
