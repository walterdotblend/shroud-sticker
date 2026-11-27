import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Repeat } from 'lucide-react'
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
  loopVideoToAudio: boolean
  onTogglePlay: () => void
  onToggleLoop: (loop: boolean) => void
  onTrimChange: (start: number, end: number) => void
  onScrubStart: () => void
  onScrub: (timeSec: number) => void
  onScrubEnd?: () => void
}

/**
 * Unified 10-second sliding-window trim timeline below the canvas:
 * - Hard-clamps effective duration to <= 10.00s.
 * - If source < 10s, allows toggling Loop to extend End up to 10.00s.
 * - If source > 10s, shows a 10s window and lets you drag the selection bar across the full video.
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
  loopVideoToAudio,
  onTogglePlay,
  onToggleLoop,
  onTrimChange,
  onScrubStart,
  onScrub,
  onScrubEnd,
}: TrimTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    which: 'start' | 'end' | 'playhead' | 'selection'
    startClientX: number
    origStart: number
    origEnd: number
    origWinStart: number
  } | null>(null)

  const canLoopExtend = duration < WHATSAPP_MAX_DURATION_SEC - 0.1
  const totalMax = canLoopExtend && loopVideoToAudio ? WHATSAPP_MAX_DURATION_SEC : Math.max(0.2, duration)
  const maxSourceSpan = Math.min(totalMax, WHATSAPP_MAX_DURATION_SEC * Math.max(0.1, speed))
  const windowLen = Math.min(totalMax, Math.max(1, WHATSAPP_MAX_DURATION_SEC * Math.max(0.1, speed)))

  const [windowStart, setWindowStart] = useState(0)
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

  // Keep sliding window aligned if totalMax shrinks or trim moves outside
  useEffect(() => {
    const maxWinStart = Math.max(0, totalMax - windowLen)
    setWindowStart((ws) => {
      let next = Math.max(0, Math.min(maxWinStart, ws))
      if (trimStart < next) next = Math.max(0, trimStart)
      if (trimEnd > next + windowLen) next = Math.min(maxWinStart, trimEnd - windowLen)
      return next
    })
  }, [totalMax, windowLen, trimStart, trimEnd])

  const windowEnd = Math.min(totalMax, windowStart + windowLen)
  const startPct = Math.max(0, Math.min(100, ((trimStart - windowStart) / windowLen) * 100))
  const endPct = Math.max(startPct, Math.min(100, ((trimEnd - windowStart) / windowLen) * 100))
  const playPct = Math.max(0, Math.min(100, ((currentTime - windowStart) / windowLen) * 100))
  const loopMarkerPct =
    canLoopExtend && loopVideoToAudio
      ? Math.max(0, Math.min(100, ((duration - windowStart) / windowLen) * 100))
      : null

  const effectiveDuration = computeEffectiveDuration(trimStart, trimEnd, speed)

  const clientXToTime = (clientX: number, winStart = windowStart): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return winStart
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Number((winStart + ratio * windowLen).toFixed(3))
  }

  const startDrag = (e: React.PointerEvent, which: 'start' | 'end' | 'playhead' | 'selection') => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      which,
      startClientX: e.clientX,
      origStart: trimStart,
      origEnd: trimEnd,
      origWinStart: windowStart,
    }
    onScrubStart()
    if (which === 'playhead') {
      onScrub(Math.min(duration, clientXToTime(e.clientX)))
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const rect = trackRef.current?.getBoundingClientRect()
    const trackW = Math.max(1, rect?.width || 300)

    if (d.which === 'playhead') {
      const time = clientXToTime(e.clientX, d.origWinStart)
      onScrub(Math.min(duration, Math.max(0, time)))
    } else if (d.which === 'start') {
      const time = clientXToTime(e.clientX, d.origWinStart)
      const minStart = Math.max(0, trimEnd - maxSourceSpan)
      const nextStart = Math.max(minStart, Math.min(trimEnd - 0.1, time))
      const rounded = Number(nextStart.toFixed(2))
      onTrimChange(rounded, trimEnd)
      onScrub(Math.min(duration, rounded))
    } else if (d.which === 'end') {
      const time = clientXToTime(e.clientX, d.origWinStart)
      const maxEnd = Math.min(totalMax, trimStart + maxSourceSpan)
      const nextEnd = Math.min(maxEnd, Math.max(trimStart + 0.1, time))
      const rounded = Number(nextEnd.toFixed(2))
      onTrimChange(trimStart, rounded)
      onScrub(Math.min(duration, rounded))
    } else if (d.which === 'selection') {
      const dxRatio = (e.clientX - d.startClientX) / trackW
      const span = d.origEnd - d.origStart
      const deltaSec = dxRatio * Math.max(windowLen, totalMax > windowLen ? totalMax * 0.45 : windowLen)
      const nextStart = Math.max(0, Math.min(totalMax - span, d.origStart + deltaSec))
      const nextEnd = nextStart + span
      const s = Number(nextStart.toFixed(2))
      const en = Number(nextEnd.toFixed(2))
      onTrimChange(s, en)
      onScrub(Math.min(duration, s))
    }
  }

  const endDrag = () => {
    if (!dragRef.current) return
    dragRef.current = null
    onScrubEnd?.()
  }

  const commitStartInput = (raw: string) => {
    setEditingStart(false)
    const num = Number(raw.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(num)) {
      setStartDraft(trimStart.toFixed(2))
      return
    }
    const minStart = Math.max(0, trimEnd - maxSourceSpan)
    const clamped = Number(Math.max(minStart, Math.min(trimEnd - 0.1, num)).toFixed(2))
    setStartDraft(clamped.toFixed(2))
    onTrimChange(clamped, trimEnd)
    onScrub(Math.min(duration, clamped))
  }

  const commitEndInput = (raw: string) => {
    setEditingEnd(false)
    const num = Number(raw.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(num)) {
      setEndDraft(trimEnd.toFixed(2))
      return
    }
    const maxEnd = Math.min(totalMax, trimStart + maxSourceSpan)
    const clamped = Number(Math.min(maxEnd, Math.max(trimStart + 0.1, num)).toFixed(2))
    setEndDraft(clamped.toFixed(2))
    onTrimChange(trimStart, clamped)
    onScrub(Math.min(duration, clamped))
  }

  const handleSetStartAtCurrent = () => {
    const nextStart = Number(Math.max(0, Math.min(totalMax - 0.1, currentTime)).toFixed(2))
    const nextEnd =
      nextStart >= trimEnd - 0.1
        ? Number(Math.min(totalMax, nextStart + Math.min(maxSourceSpan, 1)).toFixed(2))
        : Number(Math.min(trimEnd, nextStart + maxSourceSpan).toFixed(2))
    onTrimChange(nextStart, nextEnd)
  }

  const handleSetEndAtCurrent = () => {
    const nextEnd = Number(Math.min(totalMax, Math.max(0.1, currentTime)).toFixed(2))
    const nextStart =
      nextEnd <= trimStart + 0.1
        ? Number(Math.max(0, nextEnd - Math.min(maxSourceSpan, 1)).toFixed(2))
        : Number(Math.max(trimStart, nextEnd - maxSourceSpan).toFixed(2))
    onTrimChange(nextStart, nextEnd)
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
                const minStart = Math.max(0, trimEnd - maxSourceSpan)
                if (Number.isFinite(num) && num >= minStart && num <= trimEnd - 0.1) {
                  onTrimChange(Number(num.toFixed(2)), trimEnd)
                  onScrub(Math.min(duration, num))
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

        <div className="trim-center-badges">
          <span className="duration-badge ok">
            {t.finalDuration} {effectiveDuration.toFixed(2)}s ✓
          </span>
          {canLoopExtend && (
            <label className="checkbox-inline loop-chip-toggle" title={t.loopVideoToAudioHint}>
              <input
                type="checkbox"
                checked={loopVideoToAudio}
                onChange={(e) => {
                  const checked = e.target.checked
                  onToggleLoop(checked)
                  if (!checked && trimEnd > duration) {
                    onTrimChange(Math.min(trimStart, Math.max(0, duration - 0.2)), Number(duration.toFixed(2)))
                  }
                }}
              />
              <Repeat size={10} className="icon-crimson" />
              <span>Loop</span>
            </label>
          )}
        </div>

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
              max={Number(Math.min(totalMax, trimStart + maxSourceSpan).toFixed(2))}
              step={0.05}
              value={endDraft}
              onFocus={() => setEditingEnd(true)}
              onChange={(e) => {
                setEndDraft(e.target.value)
                const num = Number(e.target.value)
                const maxEnd = Math.min(totalMax, trimStart + maxSourceSpan)
                if (Number.isFinite(num) && num >= trimStart + 0.1 && num <= maxEnd) {
                  onTrimChange(trimStart, Number(num.toFixed(2)))
                  onScrub(Math.min(duration, num))
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
          {loopMarkerPct !== null && (
            <div
              className="trim-loop-boundary"
              style={{ left: `${loopMarkerPct}%` }}
              title={`Original end (${duration.toFixed(2)}s)`}
            />
          )}
          <div
            className="trim-selection trim-selection-draggable"
            style={{ left: `${startPct}%`, width: `${Math.max(1.5, endPct - startPct)}%` }}
            onPointerDown={(e) => startDrag(e, 'selection')}
            title="Drag to slide selection across timeline"
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

      {totalMax > windowLen + 0.05 && (
        <div className="trim-pan-row">
          <span className="trim-pan-label">
            {windowStart.toFixed(1)}s–{windowEnd.toFixed(1)}s / {totalMax.toFixed(1)}s
          </span>
          <input
            type="range"
            min={0}
            max={Number((totalMax - windowLen).toFixed(2))}
            step={0.1}
            value={Number(windowStart.toFixed(2))}
            onChange={(e) => {
              const nextWs = Number(e.target.value)
              const span = trimEnd - trimStart
              const clampedStart = Number(Math.max(nextWs, Math.min(nextWs + windowLen - span, trimStart)).toFixed(2))
              setWindowStart(nextWs)
              onTrimChange(clampedStart, Number((clampedStart + span).toFixed(2)))
            }}
            className="crimson-slider trim-pan-slider"
            aria-label="Pan 10s window"
          />
        </div>
      )}
    </div>
  )
}
