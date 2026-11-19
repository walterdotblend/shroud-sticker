import { useEffect, useRef, useState } from 'react'
import { Eye, Pause, Play, RotateCcw, Scissors } from 'lucide-react'
import type { CropAspect, CropRect, EncodeResult, MediaInfo } from '../engine/types'
import type { Translations } from '../i18n/translations'

interface CropStageProps {
  t: Translations
  media: MediaInfo | null
  crop: CropRect | null
  aspect: CropAspect
  trimStart: number
  trimEnd: number
  speed: number
  result: EncodeResult | null
  viewMode: 'source' | 'result'
  onViewModeChange: (mode: 'source' | 'result') => void
  onCropChange: (crop: CropRect | null) => void
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | null

function aspectToRatio(aspect: CropAspect): number | null {
  switch (aspect) {
    case '1:1':
      return 1
    case '16:9':
      return 16 / 9
    case '4:3':
      return 4 / 3
    case '9:16':
      return 9 / 16
    default:
      return null
  }
}

export function CropStage({
  t,
  media,
  crop,
  aspect,
  trimStart,
  trimEnd,
  speed,
  result,
  viewMode,
  onViewModeChange,
  onCropChange,
}: CropStageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const dragState = useRef<{
    mode: DragMode
    startX: number
    startY: number
    initialCrop: CropRect
    boxRect: DOMRect
  } | null>(null)

  // Keep video playback within [trimStart, trimEnd] and apply preview playbackRate
  useEffect(() => {
    const v = videoRef.current
    if (!v || !media || media.isGif) return
    v.playbackRate = Math.max(0.25, Math.min(4, speed))
  }, [speed, media])

  useEffect(() => {
    const v = videoRef.current
    if (!v || !media || media.isGif) return
    const onTimeUpdate = () => {
      setCurrentTime(v.currentTime)
      if (v.currentTime >= trimEnd || v.currentTime < trimStart - 0.05) {
        v.currentTime = trimStart
      }
    }
    v.addEventListener('timeupdate', onTimeUpdate)
    return () => v.removeEventListener('timeupdate', onTimeUpdate)
  }, [media, trimStart, trimEnd])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  const activeCrop: CropRect = crop ?? {
    x: 0,
    y: 0,
    width: media?.width ?? 512,
    height: media?.height ?? 512,
  }

  const startDrag = (e: React.PointerEvent, mode: DragMode) => {
    if (!media || !stageRef.current) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragState.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...activeCrop },
      boxRect: stageRef.current.getBoundingClientRect(),
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragState.current
    if (!d || !media || !d.mode) return

    const scaleX = media.width / d.boxRect.width
    const scaleY = media.height / d.boxRect.height
    const dx = (e.clientX - d.startX) * scaleX
    const dy = (e.clientY - d.startY) * scaleY

    const minSize = 32
    const ratio = aspectToRatio(aspect)
    let { x, y, width, height } = d.initialCrop

    if (d.mode === 'move') {
      x = Math.max(0, Math.min(media.width - width, x + dx))
      y = Math.max(0, Math.min(media.height - height, y + dy))
    } else {
      if (d.mode.includes('e')) {
        width = Math.max(minSize, Math.min(media.width - x, width + dx))
      }
      if (d.mode.includes('s')) {
        height = Math.max(minSize, Math.min(media.height - y, height + dy))
      }
      if (d.mode.includes('w')) {
        const nextX = Math.max(0, Math.min(x + width - minSize, x + dx))
        width = width + (x - nextX)
        x = nextX
      }
      if (d.mode.includes('n')) {
        const nextY = Math.max(0, Math.min(y + height - minSize, y + dy))
        height = height + (y - nextY)
        y = nextY
      }

      if (ratio !== null) {
        height = width / ratio
        if (y + height > media.height) {
          height = media.height - y
          width = height * ratio
        }
        if (x + width > media.width) {
          width = media.width - x
          height = width / ratio
        }
      }
    }

    onCropChange({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(minSize, Math.round(width)),
      height: Math.max(minSize, Math.round(height)),
    })
  }

  const endDrag = () => {
    dragState.current = null
  }

  const pct = (val: number, total: number) => `${((val / Math.max(1, total)) * 100).toFixed(3)}%`

  return (
    <div className="panel stage-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <Scissors size={14} className="icon-crimson" />
          <span className="panel-title">{t.viewerTitle}</span>
        </div>
        <div className="stage-tabs">
          <button
            type="button"
            className={`tab-pill ${viewMode === 'source' ? 'active' : ''}`}
            onClick={() => onViewModeChange('source')}
          >
            {t.tabOriginal}
          </button>
          <button
            type="button"
            className={`tab-pill ${viewMode === 'result' ? 'active' : ''}`}
            disabled={!result}
            onClick={() => onViewModeChange('result')}
          >
            <Eye size={12} />
            {t.tabSticker}
          </button>
        </div>
      </div>

      <div className="stage-viewport">
        {!media ? (
          <div className="stage-empty">
            <div className="eerie-sigil" aria-hidden="true">
              ☽ ✦ ☾
            </div>
            <p className="stage-empty-title">{t.emptyTitle}</p>
            <p className="stage-empty-sub">{t.emptySub}</p>
          </div>
        ) : viewMode === 'result' && result ? (
          <div className="result-preview-wrap">
            <div className="checkerboard-box">
              <img src={result.url} alt="WhatsApp Animated Sticker" className="result-webp-img" />
            </div>
            <div className="result-stats-row">
              <span className="stat-chip">
                {result.width}×{result.height}px
              </span>
              <span className="stat-chip">{result.durationSec.toFixed(2)}s</span>
              <span className="stat-chip">{result.fpsUsed} FPS · q{result.qualityUsed}</span>
              <span className={`stat-chip ${result.whatsappValid ? 'chip-ok' : 'chip-warn'}`}>
                {(result.sizeBytes / 1024).toFixed(1)} KB {result.whatsappValid ? t.whatsappOk : t.whatsappTooBig}
              </span>
            </div>
          </div>
        ) : (
          <div className="media-stage-container">
            <div
              ref={stageRef}
              className="media-crop-wrapper"
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {media.isGif ? (
                <img src={media.objectUrl} alt={media.name} className="stage-media" draggable={false} />
              ) : (
                <video
                  ref={videoRef}
                  src={media.objectUrl}
                  className="stage-media"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              )}

              {/* Interactive crop overlay */}
              <div
                className="crop-box"
                style={{
                  left: pct(activeCrop.x, media.width),
                  top: pct(activeCrop.y, media.height),
                  width: pct(activeCrop.width, media.width),
                  height: pct(activeCrop.height, media.height),
                }}
                onPointerDown={(e) => startDrag(e, 'move')}
              >
                <div className="crop-grid" />
                <span className="crop-dims-badge">
                  {activeCrop.width}×{activeCrop.height}
                </span>
                <div className="crop-handle nw" onPointerDown={(e) => startDrag(e, 'nw')} />
                <div className="crop-handle ne" onPointerDown={(e) => startDrag(e, 'ne')} />
                <div className="crop-handle sw" onPointerDown={(e) => startDrag(e, 'sw')} />
                <div className="crop-handle se" onPointerDown={(e) => startDrag(e, 'se')} />
              </div>
            </div>

            {!media.isGif && (
              <div className="stage-transport">
                <button type="button" className="btn-ghost-sm" onClick={togglePlay}>
                  {playing ? <Pause size={13} /> : <Play size={13} />}
                  {playing ? t.pause : t.play}
                </button>
                <span className="transport-time">
                  {currentTime.toFixed(2)}s / {media.duration.toFixed(2)}s
                </span>
                <button
                  type="button"
                  className="btn-ghost-sm"
                  onClick={() => onCropChange(null)}
                  title={t.resetCrop}
                >
                  <RotateCcw size={12} />
                  {t.resetCrop}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
