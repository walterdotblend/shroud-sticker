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

/**
 * Infinite side-view circular sawblade jog wheel SVG.
 * Renders crisp, uniform machined saw teeth peeking out of a cylindrical slot
 * with metallic bevel shading. Translating modulo the tooth pitch (16px)
 * creates seamless endless rotation whenever the wheel or canvas moves.
 */
function SideSawTeeth({
  orientation,
  offsetPx,
}: {
  orientation: 'vertical' | 'horizontal'
  offsetPx: number
}) {
  const pitch = 16
  const shift = ((offsetPx % pitch) + pitch) % pitch - pitch
  const count = 22 // 22 * 16 = 352px (> 300px track)

  if (orientation === 'vertical') {
    const outerPath = Array.from({ length: count }, (_, i) => {
      const y = i * pitch
      return `M22,${y} L6,${y + 5} L13,${y + 11} L22,${y + 13} L22,${y + 16}`
    }).join(' ')

    const bevelLines = Array.from({ length: count }, (_, i) => {
      const y = i * pitch
      return `M22,${y + 1} L7,${y + 5.3} M13,${y + 11} L22,${y + 13}`
    }).join(' ')

    return (
      <svg
        className="side-saw-svg vertical"
        viewBox={`0 0 24 ${count * pitch}`}
        preserveAspectRatio="none"
        style={{ transform: `translateY(${shift}px)` }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="sawBladeVert" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e6c2c2" />
            <stop offset="35%" stopColor="#a8202c" />
            <stop offset="100%" stopColor="#26090e" />
          </linearGradient>
        </defs>
        <path d={`${outerPath} L24,${count * pitch} L24,0 Z`} fill="url(#sawBladeVert)" />
        <path d={bevelLines} fill="none" stroke="#f2d6d6" strokeWidth="1" strokeOpacity="0.75" />
      </svg>
    )
  }

  const outerPath = Array.from({ length: count }, (_, i) => {
    const x = i * pitch
    return `M${x},22 L${x + 5},6 L${x + 11},13 L${x + 13},22 L${x + 16},22`
  }).join(' ')

  const bevelLines = Array.from({ length: count }, (_, i) => {
    const x = i * pitch
    return `M${x + 1},22 L${x + 5.3},7 M${x + 11},13 L${x + 13},22`
  }).join(' ')

  return (
    <svg
      className="side-saw-svg horizontal"
      viewBox={`0 0 ${count * pitch} 24`}
      preserveAspectRatio="none"
      style={{ transform: `translateX(${shift}px)` }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sawBladeHoriz" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e6c2c2" />
          <stop offset="35%" stopColor="#a8202c" />
          <stop offset="100%" stopColor="#26090e" />
        </linearGradient>
      </defs>
      <path d={`${outerPath} L${count * pitch},24 L0,24 Z`} fill="url(#sawBladeHoriz)" />
      <path d={bevelLines} fill="none" stroke="#f2d6d6" strokeWidth="1" strokeOpacity="0.75" />
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
                  {/* Infinite Vertical Side-View Sawblade Jog Wheel (Right side of canvas) */}
                  <div
                    className="saw-jog-wheel saw-jog-y"
                    title={`${t.panYHint} (Y: ${canvasY}px)`}
                    onDoubleClick={() => onTransformChange({ canvasY: 0 })}
                    onWheel={(e) => {
                      e.preventDefault()
                      const step = e.deltaY > 0 ? 12 : -12
                      onTransformChange({ canvasY: canvasY + step })
                    }}
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
                    }}
                    onPointerMove={(e) => {
                      const d = dragRef.current
                      if (d?.action === 'axisY') {
                        const dy = Math.round((e.clientY - d.startClientY) * 1.4)
                        onTransformChange({ canvasY: d.startY + dy })
                      }
                    }}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    <SideSawTeeth orientation="vertical" offsetPx={canvasY} />
                    <div className="saw-jog-sheen vertical" aria-hidden="true" />
                  </div>

                  {/* Infinite Horizontal Side-View Sawblade Jog Wheel (Below canvas) */}
                  <div
                    className="saw-jog-wheel saw-jog-x"
                    title={`${t.panXHint} (X: ${canvasX}px)`}
                    onDoubleClick={() => onTransformChange({ canvasX: 0 })}
                    onWheel={(e) => {
                      e.preventDefault()
                      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
                      const step = delta > 0 ? 12 : -12
                      onTransformChange({ canvasX: canvasX + step })
                    }}
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
                    }}
                    onPointerMove={(e) => {
                      const d = dragRef.current
                      if (d?.action === 'axisX') {
                        const dx = Math.round((e.clientX - d.startClientX) * 1.4)
                        onTransformChange({ canvasX: d.startX + dx })
                      }
                    }}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    <SideSawTeeth orientation="horizontal" offsetPx={canvasX} />
                    <div className="saw-jog-sheen horizontal" aria-hidden="true" />
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
