import { useRef } from 'react'
import { Pause, Play } from 'lucide-react'
import { computeEffectiveDuration } from '../engine/ffmpegArgs'
import { WHATSAPP_MAX_DURATION_SEC } from '../engine/types'
import type { Translations } from '../i18n/translations'

interface TrimTimelineProps {
  t: Translations
  duration: number
  trimStart: number
  trimEnd: number
  currentTime: number
  speed: number
  isVideo: boolean
  playing: boolean
  onTogglePlay: () => void
  onTrimChange: (start: number, end: number) => void
  onScrubStart: () => void
  onScrub: (timeSec: number) => void
}

/**
 * Zylo-style dual-handle trim timeline placed directly below the canvas.
 * Pauses the video while dragging Start or End handles and live-seeks to the cut frame.
 */
export function TrimTimeline({
  t,
  duration,
  trimStart,
  trimEnd,
  currentTime,
  speed,
  isVideo,
  playing,
  onTogglePlay,
  onTrimChange,
  onScrubStart,
  onScrub,
}: TrimTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragTarget = useRef<'start' | 'end' | 'playhead' | null>(null)

  const safeDur = Math.max(0.2, duration)
  const startPct = Math.max(0, Math.min(100, (trimStart / safeDur) * 100))
  const endPct = Math.max(startPct, Math.min(100, (trimEnd / safeDur) * 100))
  const playPct = Math.max(0, Math.min(100, (currentTime / safeDur) * 100))

  const effectiveDuration = computeEffectiveDuration(trimStart, trimEnd, speed)
  const tooLong = effectiveDuration > WHATSAPP_MAX_DURATION_SEC

  const clientXToTime = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return 0
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Number((ratio * safeDur).toFixed(2))
  }

  const startDrag = (e: React.PointerEvent, which: 'start' | 'end' | 'playhead') => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragTarget.current = which
    onScrubStart()
    if (which === 'playhead') {
      onScrub(clientXToTime(e.clientX))
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragTarget.current) return
    const time = clientXToTime(e.clientX)
    if (dragTarget.current === 'playhead') {
      onScrub(time)
    } else if (dragTarget.current === 'start') {
      const nextStart = Math.max(0, Math.min(trimEnd - 0.15, time))
      onTrimChange(Number(nextStart.toFixed(2)), trimEnd)
      onScrub(nextStart)
    } else {
      const nextEnd = Math.min(safeDur, Math.max(trimStart + 0.15, time))
      onTrimChange(trimStart, Number(nextEnd.toFixed(2)))
      onScrub(nextEnd)
    }
  }

  const endDrag = () => {
    dragTarget.current = null
  }

  return (
    <div className="trim-timeline-wrap">
      <div className="trim-timeline-meta">
        <span>
          {t.start} <strong>{trimStart.toFixed(2)}s</strong>
        </span>
        <span className={`duration-badge ${tooLong ? 'warn' : 'ok'}`}>
          {t.finalDuration} {effectiveDuration.toFixed(2)}s {tooLong ? t.max10s : '✓'}
        </span>
        <span>
          {t.end} <strong>{trimEnd.toFixed(2)}s</strong>
        </span>
      </div>

      <div className="trim-track-row">
        {isVideo && (
          <button
            type="button"
            className="trim-play-btn"
            onClick={onTogglePlay}
            title={playing ? t.pause : t.play}
            aria-label={playing ? t.pause : t.play}
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
        )}

        <div
          ref={trackRef}
          className="trim-track"
          onPointerDown={(e) => startDrag(e, 'playhead')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            className="trim-selection"
            style={{ left: `${startPct}%`, width: `${Math.max(1, endPct - startPct)}%` }}
          />
          <div className="trim-playhead" style={{ left: `${playPct}%` }} />
          <div
            className="trim-handle trim-handle-start"
            style={{ left: `${startPct}%` }}
            onPointerDown={(e) => startDrag(e, 'start')}
            title="Drag to set start time"
          />
          <div
            className="trim-handle trim-handle-end"
            style={{ left: `${endPct}%` }}
            onPointerDown={(e) => startDrag(e, 'end')}
            title="Drag to set end time"
          />
        </div>
      </div>
    </div>
  )
}
