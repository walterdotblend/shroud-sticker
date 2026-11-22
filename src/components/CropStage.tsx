import { useEffect, useRef, useState } from 'react'
import { Eye, Pause, Play, RotateCcw, Scissors } from 'lucide-react'
import { computeBaseFitSize } from '../engine/ffmpegArgs'
import type { CanvasBgMode, EncodeResult, MediaInfo } from '../engine/types'
import type { Translations } from '../i18n/translations'
import { TrimTimeline } from './TrimTimeline'

interface CropStageProps {
  t: Translations
  stickerName: string
  media: MediaInfo | null
  canvasBg: CanvasBgMode
  canvasScale: number
  canvasX: number
  canvasY: number
  rotationDeg: number
  trimStart: number
  trimEnd: number
  speed: number
  result: EncodeResult | null
  viewMode: 'source' | 'result'
  interactive: boolean
  onStickerNameChange: (name: string) => void
  onViewModeChange: (mode: 'source' | 'result') => void
  onTrimChange: (start: number, end: number) => void
  onTransformChange: (patch: {
    canvasScale?: number
    canvasX?: number
    canvasY?: number
    rotationDeg?: number
  }) => void
  onResetTransform: () => void
}

type DragAction = 'move' | 'scale' | 'rotate' | null

export function CropStage({
  t,
  stickerName,
  media,
  canvasBg,
  canvasScale,
  canvasX,
  canvasY,
  rotationDeg,
  trimStart,
  trimEnd,
  speed,
  result,
  viewMode,
  interactive,
  onStickerNameChange,
  onViewModeChange,
  onTrimChange,
  onTransformChange,
  onResetTransform,
}: CropStageProps) {
  const canvasBoxRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)

  const dragRef = useRef<{
    action: DragAction
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    startScale: number
    centerX: number
    centerY: number
    startDist: number
  } | null>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v || !media || media.isGif) return
    v.playbackRate = Math.max(0.1, Math.min(8, speed))
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

  const base = media ? computeBaseFitSize(media.width, media.height, 512) : { width: 512, height: 512 }
  const drawW = base.width * canvasScale
  const drawH = base.height * canvasScale

  const startDrag = (e: React.PointerEvent, action: DragAction) => {
    if (!canvasBoxRef.current || !action) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    const box = canvasBoxRef.current.getBoundingClientRect()
    const pxRatio = box.width / 512
    const centerX = box.left + box.width / 2 + canvasX * pxRatio
    const centerY = box.top + box.height / 2 + canvasY * pxRatio
    const startDist = Math.max(10, Math.hypot(e.clientX - centerX, e.clientY - centerY))

    dragRef.current = {
      action,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: canvasX,
      startY: canvasY,
      startScale: canvasScale,
      centerX,
      centerY,
      startDist,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || !canvasBoxRef.current) return
    const box = canvasBoxRef.current.getBoundingClientRect()
    const pxToCanvas = 512 / Math.max(1, box.width)

    if (d.action === 'move') {
      const dx = (e.clientX - d.startClientX) * pxToCanvas
      const dy = (e.clientY - d.startClientY) * pxToCanvas
      onTransformChange({
        canvasX: Math.round(d.startX + dx),
        canvasY: Math.round(d.startY + dy),
      })
    } else if (d.action === 'scale') {
      const dist = Math.max(10, Math.hypot(e.clientX - d.centerX, e.clientY - d.centerY))
      const nextScale = Math.max(0.1, Math.min(20.0, d.startScale * (dist / d.startDist)))
      onTransformChange({ canvasScale: Number(nextScale.toFixed(2)) })
    } else if (d.action === 'rotate') {
      const rad = Math.atan2(e.clientY - d.centerY, e.clientX - d.centerX)
      let deg = Math.round((rad * 180) / Math.PI + 90)
      if (deg > 180) deg -= 360
      if (deg < -180) deg += 360
      onTransformChange({ rotationDeg: deg })
    }
  }

  const endDrag = () => {
    dragRef.current = null
  }

  return (
    <div className="panel stage-panel">
      <div className="panel-header">
        <div className="panel-title-group sticker-name-edit-wrap">
          <Scissors size={14} className="icon-crimson" />
          <input
            type="text"
            maxLength={32}
            value={stickerName}
            onChange={(e) => onStickerNameChange(e.target.value)}
            placeholder={t.stickerNamePlaceholder}
            className="sticker-name-header-input"
            aria-label="Sticker name"
          />
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
            <div className="canvas-clip-arena">
              <div
                ref={canvasBoxRef}
                className={`sticker-canvas-512 ${canvasBg === 'obsidian' ? 'bg-obsidian' : 'bg-checker'} ${
                  interactive ? '' : 'canvas-locked'
                }`}
                onPointerMove={interactive ? onPointerMove : undefined}
                onPointerUp={interactive ? endDrag : undefined}
                onPointerCancel={interactive ? endDrag : undefined}
              >
              <div
                className="canvas-layer"
                style={{
                  width: `${(drawW / 512) * 100}%`,
                  height: `${(drawH / 512) * 100}%`,
                  left: `${50 + (canvasX / 512) * 100}%`,
                  top: `${50 + (canvasY / 512) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
                  cursor: interactive ? 'move' : 'default',
                }}
                onPointerDown={interactive ? (e) => startDrag(e, 'move') : undefined}
              >
                {media.isGif ? (
                  <img src={media.objectUrl} alt={media.name} className="canvas-layer-media" draggable={false} />
                ) : (
                  <video
                    ref={videoRef}
                    src={media.objectUrl}
                    className="canvas-layer-media"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                )}

                {interactive && (
                  <>
                    {/* Rotation stem & handle */}
                    <div className="rotate-stem" />
                    <div
                      className="rotate-handle"
                      onPointerDown={(e) => startDrag(e, 'rotate')}
                      title="Arrastra para rotar"
                    />

                    {/* 4 corner scale handles */}
                    <div className="crop-handle nw" onPointerDown={(e) => startDrag(e, 'scale')} />
                    <div className="crop-handle ne" onPointerDown={(e) => startDrag(e, 'scale')} />
                    <div className="crop-handle sw" onPointerDown={(e) => startDrag(e, 'scale')} />
                    <div className="crop-handle se" onPointerDown={(e) => startDrag(e, 'scale')} />
                  </>
                )}
              </div>

              <span className="canvas-badge-512">
                512×512 · {Math.round(canvasScale * 100)}% · {rotationDeg}°
              </span>
              <div className="canvas-bounds-mask" aria-hidden="true" />
            </div>
            </div>

            {interactive && (
              <div className="stage-transport">
                {!media.isGif && (
                  <>
                    <button type="button" className="btn-ghost-sm" onClick={togglePlay}>
                      {playing ? <Pause size={13} /> : <Play size={13} />}
                      {playing ? t.pause : t.play}
                    </button>
                    <span className="transport-time">
                      {currentTime.toFixed(2)}s / {media.duration.toFixed(2)}s
                    </span>
                  </>
                )}
                <button type="button" className="btn-ghost-sm" onClick={onResetTransform}>
                  <RotateCcw size={12} />
                  {t.resetCrop}
                </button>
              </div>
            )}

            <TrimTimeline
              t={t}
              duration={media.duration}
              trimStart={trimStart}
              trimEnd={trimEnd}
              currentTime={currentTime}
              speed={speed}
              isVideo={!media.isGif}
              playing={playing}
              onTogglePlay={togglePlay}
              onTrimChange={onTrimChange}
              onScrubStart={() => {
                if (videoRef.current && !media.isGif && !videoRef.current.paused) {
                  videoRef.current.pause()
                  setPlaying(false)
                }
              }}
              onScrub={(sec) => {
                setCurrentTime(sec)
                if (videoRef.current && !media.isGif) {
                  videoRef.current.currentTime = sec
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
