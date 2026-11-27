import { useRef, useState } from 'react'
import {
  Download,
  Flame,
  Gauge,
  HelpCircle,
  Link2,
  Move,
  Plus,
  QrCode,
  RotateCcw,
  Send,
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
  waExtAvailable: boolean
  waSending: boolean
  waSendStatus: string | null
  onStepChange: (step: WizardStep) => void
  onFileSelected: (file: File) => void
  onUrlSubmit: (url: string) => void
  onSettingsChange: (patch: Partial<StickerSettings>) => void
  onForge: () => void
  onDownload: () => void
  onAddToPack: () => void
  onSendToWhatsAppWeb: (targetMode: 'self' | 'active', openForward: boolean) => void
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
  waExtAvailable,
  waSending,
  waSendStatus,
  onStepChange,
  onFileSelected,
  onUrlSubmit,
  onSettingsChange,
  onForge,
  onDownload,
  onAddToPack,
  onSendToWhatsAppWeb,
}: ToolRackProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [urlInput, setUrlInput] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [waTargetMode, setWaTargetMode] = useState<'self' | 'active'>('self')
  const [waOpenForward, setWaOpenForward] = useState(true)

  const effectiveDuration = computeEffectiveDuration(settings.trimStart, settings.trimEnd, settings.speed)
  const durationTooLong = effectiveDuration > WHATSAPP_MAX_DURATION_SEC
  const maxSourceFps = Math.max(8, Math.min(45, media?.sourceFps ?? 30))
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
              <Gauge size={14} className="icon-crimson" />
              <span className="panel-title">{t.speed.replace(':', '')}</span>
            </div>
            <span className={`duration-badge ${durationTooLong ? 'warn' : 'ok'}`}>
              {t.finalDuration} {effectiveDuration.toFixed(2)}s {durationTooLong ? t.max10s : '✓'}
            </span>
          </div>

          <div className="control-grid">
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
                onSettingsChange({ canvasScale: 1, canvasX: 0, canvasY: 0, rotationDeg: 0, flipH: false })
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
              hint={t.vialDragHint}
              onChange={(pct) => onSettingsChange({ canvasScale: Number((pct / 100).toFixed(2)) })}
              onReset={() => onSettingsChange({ canvasScale: 1 })}
            />

            <div className="vial-control mirror-control-col">
              <button
                type="button"
                className={`mirror-vial-btn gothic-blood-mirror ${settings.flipH ? 'active' : ''}`}
                onClick={() => onSettingsChange({ flipH: !settings.flipH })}
                title={t.mirrorHint}
                aria-pressed={settings.flipH}
              >
                <span className="mirror-arch-frame" aria-hidden="true">
                  <svg viewBox="0 0 48 96" className="mirror-arch-svg">
                    <defs>
                      <linearGradient id="mirrorIntactGlass" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#46383e" />
                        <stop offset="45%" stopColor="#1b1418" />
                        <stop offset="100%" stopColor="#090608" />
                      </linearGradient>
                      <radialGradient id="mirrorShatterGlow" cx="50%" cy="42%" r="58%">
                        <stop offset="0%" stopColor="#ff4d5a" stopOpacity="0.85" />
                        <stop offset="55%" stopColor="#7a141d" stopOpacity="0.92" />
                        <stop offset="100%" stopColor="#090507" />
                      </radialGradient>
                    </defs>

                    {/* Top Gothic Crown Finial */}
                    <path
                      d="M24 2 L28 9 L24 12 L20 9 Z"
                      fill={settings.flipH ? '#cc3540' : '#4c272c'}
                      stroke={settings.flipH ? '#ffe4e6' : '#8f5259'}
                      strokeWidth="1"
                    />

                    {/* Ornate Wide Oval Mirror Frame */}
                    <ellipse
                      cx="24"
                      cy="42"
                      rx="18"
                      ry="28"
                      fill="#120b0e"
                      stroke={settings.flipH ? '#ffe4e6' : '#9c5a62'}
                      strokeWidth="2"
                    />

                    {/* Inner Mirror Glass (Intact by default, Shattered when active) */}
                    <ellipse
                      cx="24"
                      cy="42"
                      rx="14.5"
                      ry="24.5"
                      fill={settings.flipH ? 'url(#mirrorShatterGlow)' : 'url(#mirrorIntactGlass)'}
                      stroke={settings.flipH ? '#ff8e98' : '#5e353b'}
                      strokeWidth="1"
                    />

                    {!settings.flipH ? (
                      /* Intact smooth glass reflection streaks */
                      <>
                        <line x1="14" y1="30" x2="25" y2="19" stroke="rgba(255,255,255,0.45)" strokeWidth="1.6" strokeLinecap="round" />
                        <line x1="16" y1="36" x2="29" y2="23" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" strokeLinecap="round" />
                        <line x1="20" y1="58" x2="32" y2="46" stroke="rgba(255,255,255,0.16)" strokeWidth="1" strokeLinecap="round" />
                      </>
                    ) : (
                      /* Shattered glass cracks radiating from impact center */
                      <>
                        <circle cx="24" cy="40" r="2.2" fill="#ffffff" />
                        <polyline points="24,40 16,24 12,21" fill="none" stroke="#ffe4e6" strokeWidth="1.2" />
                        <polyline points="24,40 33,22 36,27" fill="none" stroke="#ffe4e6" strokeWidth="1.2" />
                        <polyline points="24,40 11,42 13,52" fill="none" stroke="#ffd1d6" strokeWidth="1.1" />
                        <polyline points="24,40 37,43 33,57" fill="none" stroke="#ffd1d6" strokeWidth="1.1" />
                        <polyline points="24,40 22,58 26,65" fill="none" stroke="#ffe4e6" strokeWidth="1.2" />
                        <line x1="16" y1="24" x2="29" y2="29" stroke="#ff9aa4" strokeWidth="0.9" />
                        <line x1="15" y1="47" x2="31" y2="51" stroke="#ff9aa4" strokeWidth="0.9" />
                      </>
                    )}

                    {/* Hand-Mirror Neck & Handle Base */}
                    <path
                      d="M20 69 L28 69 L26.5 92 L24 94 L21.5 92 Z"
                      fill={settings.flipH ? '#7a141d' : '#261418'}
                      stroke={settings.flipH ? '#ffe4e6' : '#7a3b42'}
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                {settings.flipH && (
                  <span className="mirror-sparks" aria-hidden="true">
                    <i className="m-spark ms1" />
                    <i className="m-spark ms2" />
                    <i className="m-spark ms3" />
                    <i className="m-spark ms4" />
                  </span>
                )}
              </button>
              <div className="vial-meta">
                <span className="vial-label">{t.mirrorLabel}</span>
                <strong className="vial-value">{settings.flipH ? 'ON' : 'OFF'}</strong>
              </div>
            </div>

            <VialControl
              label={t.rotateLabel}
              value={settings.rotationDeg}
              min={-180}
              max={180}
              editMin={-360}
              editMax={360}
              step={1}
              unit="°"
              editable
              hint={t.vialDragHint}
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
            hint={t.vialDragHint}
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
            hint={t.vialDragHint}
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
            hint={t.vialDragHint}
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

        {/* Direct WhatsApp Web Sound Sticker Bridge (via SHROUD Extension) */}
        <div className="wa-web-send-box">
          <div className="wa-web-controls-row">
            <select
              value={waTargetMode}
              onChange={(e) => setWaTargetMode(e.target.value as 'self' | 'active')}
              className="terminal-select"
              aria-label="WhatsApp target chat"
            >
              <option value="self">{t.waTargetSelf}</option>
              <option value="active">{t.waTargetActive}</option>
            </select>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={waOpenForward}
                onChange={(e) => setWaOpenForward(e.target.checked)}
              />
              <span>{t.waOpenForward}</span>
            </label>
          </div>
          <button
            type="button"
            className="btn-crimson forge-main-btn"
            disabled={!result || encoding || waSending}
            onClick={() => onSendToWhatsAppWeb(waTargetMode, waOpenForward)}
          >
            <Send size={15} />
            {waSending ? t.sendToWaWebSending : t.sendToWaWebBtn}
          </button>
          {waSendStatus && <div className="p2p-status-badge">{waSendStatus}</div>}
          {!waExtAvailable && (
            <a
              href={`${import.meta.env.BASE_URL}shroud-extension.zip`}
              download="shroud-extension.zip"
              className="btn-secondary ext-download-btn"
            >
              <Download size={13} />
              {t.downloadExtBtn}
            </a>
          )}
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
