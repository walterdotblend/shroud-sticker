import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, Scissors } from 'lucide-react'
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
  flipH: boolean
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
    flipH?: boolean
  }) => void
  onResetTransform: () => void
}

type DragAction = 'move' | 'scale' | 'rotate' | 'axisX' | 'axisY' | null

const AXIS_LIMIT = 260

/**
 * Gothic circular sawblade SVG thumb for the horizontal and vertical axis sliders.
 * Rotates dynamically as the slider position changes.
 */
function SawbladeThumbSvg({ angleDeg }: { angleDeg: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className="sawblade-svg"
      style={{ transform: `rotate(${angleDeg}deg)` }}
      aria-hidden="true"
    >
      {/* 12-tooth circular sawblade outer path */}
      <path
        d="M16 1 L18.8 5.4 L23.5 3 L23.4 8.2 L28.9 8.5 L26.3 13.1 L31 16 L26.6 18.8 L29 23.5 L23.8 23.4 L23.5 28.9 L18.9 26.3 L16 31 L13.2 26.6 L8.5 29 L8.6 23.8 L3.1 23.5 L5.7 18.9 L1 16 L5.4 13.2 L3 8.5 L8.2 8.6 L8.5 3.1 L13.1 5.7 Z"
        fill="#cc3540"
        stroke="#e6c2c2"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="7.5" fill="#160c10" stroke="#e6c2c2" strokeWidth="1" />
      <circle cx="16" cy="16" r="3" fill="#080608" stroke="#cc3540" strokeWidth="1.3" />
    </svg>
  )
}

export function CropStage({
  t,
  stickerName,
  media,
  canvasBg,
  canvasScale,
  canvasX,
  canvasY,
  rotationDeg,
  flipH,
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
}: CropStageProps) {
  const canvasBoxRef = useRef<HTMLDivElement>(null)
  const axisXTrackRef = useRef<HTMLDivElement>(null)
  const axisYTrackRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)

  // Non-canceling frame-locked seek queue for ultra-fluid scrubbing
  const isSeekingRef = useRef(false)
  const pendingSeekTimeRef = useRef<number | null>(null)
  const isScrubbingRef = useRef(false)
  const wasPlayingBeforeScrubRef = useRef(true)

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

  // Frame-locked seek executor: waits for each frame decode to paint before seeking to the next latest pointer time
  const queueFluidVideoSeek = useCallback(
    (targetSec: number) => {
      const v = videoRef.current
      if (!v || !media || media.isGif) return
      const clamped = Math.max(0, Math.min(media.duration || 10, targetSec))
      pendingSeekTimeRef.current = clamped

      if (isSeekingRef.current) return

      const executeNextSeek = () => {
        const next = pendingSeekTimeRef.current
        if (next === null || !videoRef.current) {
          isSeekingRef.current = false
          return
        }
        pendingSeekTimeRef.current = null
        if (Math.abs(videoRef.current.currentTime - next) < 0.004) {
          isSeekingRef.current = false
          return
        }
        isSeekingRef.current = true

        let settled = false
        const onDone = () => {
          if (settled) return
          settled = true
          videoRef.current?.removeEventListener('seeked', onDone)
          clearTimeout(fallbackTimer)
          if (pendingSeekTimeRef.current !== null) {
            executeNextSeek()
          } else {
            isSeekingRef.current = false
          }
        }
        const fallbackTimer = setTimeout(onDone, 90)
        videoRef.current.addEventListener('seeked', onDone, { once: true })
        videoRef.current.currentTime = next
      }

      executeNextSeek()
    },
    [media]
  )

  // 60 FPS smooth playhead & trim loop tracker
  useEffect(() => {
    const v = videoRef.current
    if (!v || !media || media.isGif) return

    let rafId = 0
    const tick = () => {
      if (!isScrubbingRef.current && videoRef.current) {
        const cur = videoRef.current.currentTime
        setCurrentTime(cur)
        if (!videoRef.current.paused && (cur >= trimEnd || cur < trimStart - 0.05)) {
          videoRef.current.currentTime = trimStart
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(rafId)
  }, [media, trimStart, trimEnd])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      if (v.currentTime >= trimEnd || v.currentTime < trimStart) {
        v.currentTime = trimStart
      }
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

  // Sawblade Axis Sliders (Horizontal X and Vertical Y)
  const updateAxisXFromClient = (clientX: number) => {
    const rect = axisXTrackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const val = Math.round((ratio * 2 - 1) * AXIS_LIMIT)
    onTransformChange({ canvasX: Math.abs(val) <= 3 ? 0 : val })
  }

  const updateAxisYFromClient = (clientY: number) => {
    const rect = axisYTrackRef.current?.getBoundingClientRect()
    if (!rect || rect.height <= 0) return
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    const val = Math.round((ratio * 2 - 1) * AXIS_LIMIT)
    onTransformChange({ canvasY: Math.abs(val) <= 3 ? 0 : val })
  }

  const axisXPct = Math.max(0, Math.min(100, ((canvasX + AXIS_LIMIT) / (AXIS_LIMIT * 2)) * 100))
  const axisYPct = Math.max(0, Math.min(100, ((canvasY + AXIS_LIMIT) / (AXIS_LIMIT * 2)) * 100))

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
            <img
              src={`${import.meta.env.BASE_URL}logos/logo-shroud-sigil.svg`}
              alt="SHROUD Sigil"
              className="stage-empty-sigil"
            />
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
            <div className={`canvas-with-saw-sliders ${interactive ? 'is-interactive' : ''}`}>
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
                      <img
                        src={media.objectUrl}
                        alt={media.name}
                        className="canvas-layer-media"
                        style={flipH ? { transform: 'scaleX(-1)' } : undefined}
                        draggable={false}
                      />
                    ) : (
                      <video
                        ref={videoRef}
                        src={media.objectUrl}
                        className="canvas-layer-media"
                        style={flipH ? { transform: 'scaleX(-1)' } : undefined}
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
                          title={t.dragRotateHint}
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
                    512×512 · {Math.round(canvasScale * 100)}% · {rotationDeg}°{flipH ? ' · ⇄' : ''}
                  </span>
                  <div className="canvas-bounds-mask" aria-hidden="true" />
                </div>
              </div>

              {interactive && (
                <>
                  {/* Vertical Sawblade Slider (Right side of canvas square) */}
                  <div
                    ref={axisYTrackRef}
                    className="saw-axis-slider saw-axis-y"
                    title={`${t.panYHint} (Y: ${canvasY}px)`}
                    onDoubleClick={() => onTransformChange({ canvasY: 0 })}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                      dragRef.current = {
                        action: 'axisY',
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        startX: canvasX,
                        startY: canvasY,
                        startScale: canvasScale,
                        centerX: 0,
                        centerY: 0,
                        startDist: 0,
                      }
                      updateAxisYFromClient(e.clientY)
                    }}
                    onPointerMove={(e) => {
                      if (dragRef.current?.action === 'axisY') {
                        updateAxisYFromClient(e.clientY)
                      }
                    }}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    <div className="saw-axis-groove" />
                    <div className="saw-axis-center-tick" />
                    <div className="saw-axis-thumb" style={{ top: `${axisYPct}%` }}>
                      <SawbladeThumbSvg angleDeg={canvasY * 2.2} />
                    </div>
                  </div>

                  {/* Horizontal Sawblade Slider (Below canvas square) */}
                  <div
                    ref={axisXTrackRef}
                    className="saw-axis-slider saw-axis-x"
                    title={`${t.panXHint} (X: ${canvasX}px)`}
                    onDoubleClick={() => onTransformChange({ canvasX: 0 })}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                      dragRef.current = {
                        action: 'axisX',
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        startX: canvasX,
                        startY: canvasY,
                        startScale: canvasScale,
                        centerX: 0,
                        centerY: 0,
                        startDist: 0,
                      }
                      updateAxisXFromClient(e.clientX)
                    }}
                    onPointerMove={(e) => {
                      if (dragRef.current?.action === 'axisX') {
                        updateAxisXFromClient(e.clientX)
                      }
                    }}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    <div className="saw-axis-groove" />
                    <div className="saw-axis-center-tick" />
                    <div className="saw-axis-thumb" style={{ left: `${axisXPct}%` }}>
                      <SawbladeThumbSvg angleDeg={canvasX * 2.2} />
                    </div>
                  </div>

                  {/* Intersection Corner Reset (0,0) */}
                  <button
                    type="button"
                    className="saw-axis-corner-reset"
                    title={t.centerAxesHint}
                    onClick={() => onTransformChange({ canvasX: 0, canvasY: 0 })}
                  >
                    ⊹
                  </button>
                </>
              )}
            </div>

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
                isScrubbingRef.current = true
                if (videoRef.current && !media.isGif) {
                  wasPlayingBeforeScrubRef.current = !videoRef.current.paused
                  if (!videoRef.current.paused) {
                    videoRef.current.pause()
                    setPlaying(false)
                  }
                }
              }}
              onScrub={(sec) => {
                setCurrentTime(sec)
                queueFluidVideoSeek(sec)
              }}
              onScrubEnd={() => {
                isScrubbingRef.current = false
                if (videoRef.current && !media.isGif && wasPlayingBeforeScrubRef.current) {
                  videoRef.current.play().catch(() => {})
                  setPlaying(true)
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
