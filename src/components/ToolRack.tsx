import { useRef, useState } from 'react'
import {
  Clock,
  Download,
  Flame,
  Gauge,
  HelpCircle,
  Link2,
  Move,
  Plus,
  QrCode,
  RotateCcw,
  Smartphone,
  Upload,
} from 'lucide-react'
import {
  computeEffectiveDuration,
  computeMaxAllowedQuality,
} from '../engine/ffmpegArgs'
import {
  WHATSAPP_MAX_DURATION_SEC,
  type CanvasBgMode,
  type EncodeResult,
  type MediaInfo,
  type StickerSettings,
} from '../engine/types'
import type { Translations } from '../i18n/translations'
import { VialControl } from './VialControl'

export type WizardStep = 1 | 2 | 3

interface ToolRackProps {
  t: Translations
  step: WizardStep
  media: MediaInfo | null
  settings: StickerSettings
  urlLoading: boolean
  urlError: string | null
  encoding: boolean
  result: EncodeResult | null
  qrDataUrl: string | null
  p2pStatus: string | null
  onStepChange: (step: WizardStep) => void
  onFileSelected: (file: File) => void
  onUrlSubmit: (url: string) => void
  onSettingsChange: (patch: Partial<StickerSettings>) => void
  onForge: () => void
  onDownload: () => void
  onAddToPack: () => void
}

const SPEED_PRESETS = [0.5, 1, 1.5, 2, 3, 4]

export function ToolRack({
  t,
  step,
  media,
  settings,
  urlLoading,
  urlError,
  encoding,
  result,
  qrDataUrl,
  p2pStatus,
  onStepChange,
  onFileSelected,
  onUrlSubmit,
  onSettingsChange,
  onForge,
  onDownload,
  onAddToPack,
}: ToolRackProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [urlInput, setUrlInput] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const maxDur = media ? Math.max(0.5, media.duration) : 10
  const effectiveDuration = computeEffectiveDuration(settings.trimStart, settings.trimEnd, settings.speed)
  const durationTooLong = effectiveDuration > WHATSAPP_MAX_DURATION_SEC
  const maxSourceFps = Math.max(
    8,
    Math.min(30, Math.round((media?.sourceFps ?? 30) * Math.max(0.25, settings.speed)))
  )
  const activeFps = Math.min(settings.fps, maxSourceFps)
  const maxAllowedQuality = computeMaxAllowedQuality(activeFps, effectiveDuration, settings.removeBg)
  const activeQuality = Math.min(settings.quality, maxAllowedQuality)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFileSelected(file)
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
            className={`dropzone dropzone-square ${dragOver ? 'drag-over' : ''}`}
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
            <Upload size={28} className="icon-crimson" />
            <span className="dropzone-main">{media ? `${t.dropLoaded} ${media.name}` : t.dropMain}</span>
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
                  <Gauge size={12} /> {t.speed}
                </span>
                <div className="speed-input-group">
                  <input
                    type="number"
                    min={0.1}
                    max={8}
                    step={0.05}
                    value={settings.speed}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      if (Number.isFinite(val)) {
                        onSettingsChange({ speed: Math.max(0.1, Math.min(8, val)) })
                      }
                    }}
                    className="terminal-input speed-number-box"
                  />
                  <span className="muted-meta">×</span>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={settings.reverse}
                      onChange={(e) => onSettingsChange({ reverse: e.target.checked })}
                    />
                    <span>{t.reverse}</span>
                  </label>
                </div>
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
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <Move size={14} className="icon-crimson" />
              <span className="panel-title">{t.canvasTransformTitle}</span>
            </div>
            <button
              type="button"
              className="btn-link-sm"
              onClick={() =>
                onSettingsChange({ canvasScale: 1, canvasX: 0, canvasY: 0, rotationDeg: 0 })
              }
            >
              <RotateCcw size={11} /> {t.resetCrop}
            </button>
          </div>

          <div className="dials-row">
            <VialControl
              label={t.scaleLabel}
              value={Math.round(settings.canvasScale * 100)}
              min={10}
              max={300}
              editMax={2000}
              step={5}
              unit="%"
              editable
              onChange={(pct) => onSettingsChange({ canvasScale: Number((pct / 100).toFixed(2)) })}
              onReset={() => onSettingsChange({ canvasScale: 1 })}
            />
            <VialControl
              label={t.rotateLabel}
              value={settings.rotationDeg}
              min={-180}
              max={180}
              step={1}
              unit="°"
              onChange={(deg) => onSettingsChange({ rotationDeg: deg })}
              onReset={() => onSettingsChange({ rotationDeg: 0 })}
            />
          </div>

          <div className="control-row">
            <span className="control-label">{t.canvasBgLabel}</span>
            <select
              value={settings.canvasBg}
              onChange={(e) => onSettingsChange({ canvasBg: e.target.value as CanvasBgMode })}
              className="terminal-select"
            >
              <option value="transparent">{t.bgTransparent}</option>
              <option value="obsidian">{t.bgObsidian}</option>
            </select>
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

        <p className="muted-meta">{t.dynamicBudgetHint}</p>

        <div className="dials-row">
          <VialControl
            label={`FPS (≤${maxSourceFps})`}
            value={activeFps}
            min={8}
            max={maxSourceFps}
            step={1}
            onChange={(fps) => {
              const clampedFps = Math.max(8, Math.min(maxSourceFps, fps))
              const nextMaxQ = computeMaxAllowedQuality(clampedFps, effectiveDuration, settings.removeBg)
              onSettingsChange({
                fps: clampedFps,
                quality: Math.min(settings.quality, nextMaxQ),
              })
            }}
            onReset={() => onSettingsChange({ fps: Math.min(15, maxSourceFps) })}
          />
          <VialControl
            label={`${t.qualityLabel.replace(':', '')} (≤${maxAllowedQuality}%)`}
            value={activeQuality}
            min={15}
            max={maxAllowedQuality}
            step={5}
            unit="%"
            onChange={(q) =>
              onSettingsChange({ quality: Math.max(15, Math.min(maxAllowedQuality, q)) })
            }
            onReset={() => onSettingsChange({ quality: Math.min(75, maxAllowedQuality) })}
          />
          <VialControl
            label={t.cursedLabel}
            value={settings.cursedLevel}
            min={0}
            max={100}
            step={5}
            unit="%"
            accent="cursed"
            onChange={(c) => onSettingsChange({ cursedLevel: Math.max(0, Math.min(100, c)) })}
            onReset={() => onSettingsChange({ cursedLevel: 0 })}
          />
        </div>

        <div className="bg-remove-box">
          <label className="toggle-pill">
            <input
              type="checkbox"
              checked={settings.removeBg}
              onChange={(e) => {
                const nextRemoveBg = e.target.checked
                const nextMaxQ = computeMaxAllowedQuality(activeFps, effectiveDuration, nextRemoveBg)
                onSettingsChange({
                  removeBg: nextRemoveBg,
                  quality: Math.min(settings.quality, nextMaxQ),
                })
              }}
            />
            <span>{t.removeBgLabel}</span>
          </label>
          {settings.removeBg && (
            <select
              value={settings.bgModel}
              onChange={(e) =>
                onSettingsChange({ bgModel: e.target.value as 'modnet' | 'rmbg' })
              }
              className="terminal-select"
            >
              <option value="rmbg">{t.removeBgModelHigh}</option>
              <option value="modnet">{t.removeBgModelFast}</option>
            </select>
          )}
        </div>

        <button type="button" className="btn-crimson forge-main-btn" disabled={!media || encoding} onClick={onForge}>
          <Flame size={16} />
          {encoding ? t.forgingButton : t.forgeButton}
        </button>

        <div className="export-buttons-grid">
          <button type="button" className="btn-export" disabled={!result || encoding} onClick={onDownload}>
            <div className="export-icons">
              <Smartphone size={14} />
              <span className="os-tag">Android · iOS</span>
            </div>
            <span className="export-label">{t.downloadWebpPc}</span>
          </button>

          <button
            type="button"
            className="btn-export btn-export-mobile"
            disabled={!result || encoding}
            onClick={onAddToPack}
          >
            <div className="export-icons">
              <Plus size={15} />
            </div>
            <span className="export-label">{t.addToPack}</span>
          </button>
        </div>

        {qrDataUrl && (
          <div className="qr-card qr-card-large">
            <img src={qrDataUrl} alt="P2P QR Code" className="qr-image-large" />
            <div className="qr-info">
              <div className="qr-title">
                <QrCode size={14} className="icon-crimson" />
                <span>{t.qrTitle}</span>
              </div>
              {p2pStatus && <div className="p2p-status-badge">{p2pStatus}</div>}
              <p className="qr-note">{t.qrLocalNote}</p>
            </div>
          </div>
        )}

        <div className="import-guide">
          <div className="import-guide-title">
            <HelpCircle size={13} className="icon-crimson" />
            <span>{t.importTitle}</span>
          </div>
          <ul className="import-list">
            <li>{t.importAndroid}</li>
            <li>{t.importIos}</li>
            <li>{t.importDesktop}</li>
          </ul>
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
