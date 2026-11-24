import { useEffect, useRef, useState } from 'react'
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
  onScrubEnd?: () => void
}

/**
 * Zylo-style dual-handle trim timeline placed directly below the canvas.
 * - Clickable Start / End buttons set cut points to current playback second.
 * - Writable Start / End numeric inputs allow typing exact seconds.
 * - Live frame-locked scrubbing while dragging handles or playhead.
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
  onScrubEnd,
}: TrimTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragTarget = useRef<'start' | 'end' | 'playhead' | null>(null)

  const [startDraft, setStartDraft] = useState(trimStart.toFixed(2))
  const [endDraft, setEndDraft] = useState(trimEnd.toFixed(2))
  const [editingStart, setEditingStart] = useState(false)
  const [editingEnd, setEditingEnd] = useState(false)

  useEffect(() => {
    if (!editingStart) setStartDraft(trimStart.toFixed(2))
  }, [trimStart, editingStart])

  useEffect(() => {
    if (!editingEnd) setEndDraft(trimEnd.toFixed(2))
  }, [trimEnd, editingEnd])

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
    return Number((ratio * safeDur).toFixed(3))
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
      const nextStart = Math.max(0, Math.min(trimEnd - 0.1, time))
      onTrimChange(Number(nextStart.toFixed(2)), trimEnd)
      onScrub(nextStart)
    } else {
      const nextEnd = Math.min(safeDur, Math.max(trimStart + 0.1, time))
      onTrimChange(trimStart, Number(nextEnd.toFixed(2)))
      onScrub(nextEnd)
    }
  }

  const endDrag = () => {
    if (!dragTarget.current) return
    dragTarget.current = null
    onScrubEnd?.()
  }

  const commitStartInput = (raw: string) => {
    setEditingStart(false)
    const num = Number(raw.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(num)) {
      setStartDraft(trimStart.toFixed(2))
      return
    }
    const clamped = Number(Math.max(0, Math.min(trimEnd - 0.1, num)).toFixed(2))
    setStartDraft(clamped.toFixed(2))
    onTrimChange(clamped, trimEnd)
    onScrub(clamped)
  }

  const commitEndInput = (raw: string) => {
    setEditingEnd(false)
    const num = Number(raw.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(num)) {
      setEndDraft(trimEnd.toFixed(2))
      return
    }
    const clamped = Number(Math.min(safeDur, Math.max(trimStart + 0.1, num)).toFixed(2))
    setEndDraft(clamped.toFixed(2))
    onTrimChange(trimStart, clamped)
    onScrub(clamped)
  }

  const handleSetStartAtCurrent = () => {
    const nextStart = Number(Math.max(0, Math.min(safeDur - 0.1, currentTime)).toFixed(2))
    const nextEnd = nextStart >= trimEnd - 0.1 ? Number(Math.min(safeDur, nextStart + 0.5).toFixed(2)) : trimEnd
    onTrimChange(nextStart, nextEnd)
    setStartDraft(nextStart.toFixed(2))
    setEndDraft(nextEnd.toFixed(2))
  }

  const handleSetEndAtCurrent = () => {
    const nextEnd = Number(Math.min(safeDur, Math.max(0.1, currentTime)).toFixed(2))
    const nextStart = nextEnd <= trimStart + 0.1 ? Number(Math.max(0, nextEnd - 0.5).toFixed(2)) : trimStart
    onTrimChange(nextStart, nextEnd)
    setStartDraft(nextStart.toFixed(2))
    setEndDraft(nextEnd.toFixed(2))
  }

  return (
    <div className="trim-timeline-wrap">
      <div className="trim-timeline-meta">
        <div className="trim-bound-group">
          <button
            type="button"
            className="trim-set-btn"
            onClick={handleSetStartAtCurrent}
            title={t.setStartAtCurrentTitle}
          >
            {t.start}
          </button>
          <div className="trim-sec-input-wrap">
            <input
              type="number"
              min={0}
              max={Number(Math.max(0, trimEnd - 0.1).toFixed(2))}
              step={0.05}
              value={startDraft}
              onFocus={() => setEditingStart(true)}
              onChange={(e) => {
                setStartDraft(e.target.value)
                const num = Number(e.target.value)
                if (Number.isFinite(num) && num >= 0 && num <= trimEnd - 0.1) {
                  onTrimChange(Number(num.toFixed(2)), trimEnd)
                  onScrub(num)
                }
              }}
              onBlur={(e) => commitStartInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitStartInput((e.target as HTMLInputElement).value)
              }}
              className="trim-sec-input"
              aria-label="Start seconds"
            />
            <span className="trim-sec-unit">s</span>
          </div>
        </div>

        <span className={`duration-badge ${tooLong ? 'warn' : 'ok'}`}>
          {t.finalDuration} {effectiveDuration.toFixed(2)}s {tooLong ? t.max10s : '✓'}
        </span>

        <div className="trim-bound-group">
          <button
            type="button"
            className="trim-set-btn"
            onClick={handleSetEndAtCurrent}
            title={t.setEndAtCurrentTitle}
          >
            {t.end}
          </button>
          <div className="trim-sec-input-wrap">
            <input
              type="number"
              min={Number((trimStart + 0.1).toFixed(2))}
              max={Number(safeDur.toFixed(2))}
              step={0.05}
              value={endDraft}
              onFocus={() => setEditingEnd(true)}
              onChange={(e) => {
                setEndDraft(e.target.value)
                const num = Number(e.target.value)
                if (Number.isFinite(num) && num >= trimStart + 0.1 && num <= safeDur) {
                  onTrimChange(trimStart, Number(num.toFixed(2)))
                  onScrub(num)
                }
              }}
              onBlur={(e) => commitEndInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEndInput((e.target as HTMLInputElement).value)
              }}
              className="trim-sec-input"
              aria-label="End seconds"
            />
            <span className="trim-sec-unit">s</span>
          </div>
        </div>
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
            title={t.dragStartHandleHint}
          />
          <div
            className="trim-handle trim-handle-end"
            style={{ left: `${endPct}%` }}
            onPointerDown={(e) => startDrag(e, 'end')}
            title={t.dragEndHandleHint}
          />
        </div>
      </div>
    </div>
  )
}
