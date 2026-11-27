import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Trash2, Upload, Volume2, VolumeX } from 'lucide-react'
import { WHATSAPP_MAX_DURATION_SEC, type AudioTrackInfo } from '../engine/types'
import type { Translations } from '../i18n/translations'

interface AudioTrackBarProps {
  t: Translations
  audioTrack: AudioTrackInfo | null
  videoHasOriginalAudio: boolean
  audioEnabled: boolean
  audioVolume: number
  audioStart: number
  audioEnd: number
  effectiveVideoDuration: number
  currentAudioTime: number
  onToggleAudioEnabled: (enabled: boolean) => void
  onVolumeChange: (vol: number) => void
  onAudioTrimChange: (startSec: number, endSec: number) => void
  onUploadAudioFile: (file: File) => void
  onRemoveAudio: () => void
  onRestoreVideoAudio: () => void
  onScrubStart: () => void
  onScrubAudioTime: (audioSec: number) => void
  onScrubEnd: () => void
}

/**
 * Unified 10-second sliding-window Audio Timeline matching TrimTimeline's exact design,
 * while keeping the waveform bars inside the track.
 */
export function AudioTrackBar({
  t,
  audioTrack,
  videoHasOriginalAudio,
  audioEnabled,
  audioVolume,
  audioStart,
  audioEnd,
  effectiveVideoDuration,
  currentAudioTime,
  onToggleAudioEnabled,
  onVolumeChange,
  onAudioTrimChange,
  onUploadAudioFile,
  onRemoveAudio,
  onRestoreVideoAudio,
  onScrubStart,
  onScrubAudioTime,
  onScrubEnd,
}: AudioTrackBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    which: 'start' | 'end' | 'playhead' | 'selection'
    startClientX: number
    origStart: number
    origEnd: number
    origWinStart: number
  } | null>(null)

  const totalDur = Math.max(0.2, audioTrack?.duration || 1)
  const maxAudioSpan = Math.min(totalDur, Math.min(WHATSAPP_MAX_DURATION_SEC, Math.max(0.2, effectiveVideoDuration)))
  const windowLen = Math.min(totalDur, WHATSAPP_MAX_DURATION_SEC)

  const [windowStart, setWindowStart] = useState(0)
  const [startDraft, setStartDraft] = useState(audioStart.toFixed(2))
  const [endDraft, setEndDraft] = useState(audioEnd.toFixed(2))
  const [editingStart, setEditingStart] = useState(false)
  const [editingEnd, setEditingEnd] = useState(false)

  useEffect(() => {
    if (!editingStart) setStartDraft(audioStart.toFixed(2))
  }, [audioStart, editingStart])

  useEffect(() => {
    if (!editingEnd) setEndDraft(audioEnd.toFixed(2))
  }, [audioEnd, editingEnd])

  useEffect(() => {
    const maxWinStart = Math.max(0, totalDur - windowLen)
    setWindowStart((ws) => {
      let next = Math.max(0, Math.min(maxWinStart, ws))
      if (audioStart < next) next = Math.max(0, audioStart)
      if (audioEnd > next + windowLen) next = Math.min(maxWinStart, audioEnd - windowLen)
      return next
    })
  }, [totalDur, windowLen, audioStart, audioEnd])

  const windowEnd = Math.min(totalDur, windowStart + windowLen)
  const safeEnd = Math.min(totalDur, Math.max(audioStart + 0.1, audioEnd))

  const startPct = Math.max(0, Math.min(100, ((audioStart - windowStart) / windowLen) * 100))
  const endPct = Math.max(startPct, Math.min(100, ((safeEnd - windowStart) / windowLen) * 100))
  const playPct = Math.max(0, Math.min(100, ((currentAudioTime - windowStart) / windowLen) * 100))

  // Slice waveform peaks to match the visible 10s window
  const peaks = audioTrack?.peaks || []
  const peakStartIdx = Math.floor((windowStart / totalDur) * peaks.length)
  const peakEndIdx = Math.max(peakStartIdx + 1, Math.ceil((windowEnd / totalDur) * peaks.length))
  const visiblePeaks = peaks.slice(peakStartIdx, peakEndIdx)

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
      origStart: audioStart,
      origEnd: safeEnd,
      origWinStart: windowStart,
    }
    onScrubStart()
    if (which === 'playhead') {
      onScrubAudioTime(Math.max(0, Math.min(totalDur, clientXToTime(e.clientX))))
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const rect = trackRef.current?.getBoundingClientRect()
    const trackW = Math.max(1, rect?.width || 300)

    if (d.which === 'playhead') {
      onScrubAudioTime(Math.max(0, Math.min(totalDur, clientXToTime(e.clientX, d.origWinStart))))
    } else if (d.which === 'start') {
      const time = clientXToTime(e.clientX, d.origWinStart)
      const minStart = Math.max(0, safeEnd - maxAudioSpan)
      const nextStart = Number(Math.max(minStart, Math.min(safeEnd - 0.1, time)).toFixed(2))
      onAudioTrimChange(nextStart, safeEnd)
      onScrubAudioTime(nextStart)
    } else if (d.which === 'end') {
      const time = clientXToTime(e.clientX, d.origWinStart)
      const maxEnd = Math.min(totalDur, audioStart + maxAudioSpan)
      const nextEnd = Number(Math.min(maxEnd, Math.max(audioStart + 0.1, time)).toFixed(2))
      onAudioTrimChange(audioStart, nextEnd)
      onScrubAudioTime(nextEnd)
    } else if (d.which === 'selection') {
      const dxRatio = (e.clientX - d.startClientX) / trackW
      const span = d.origEnd - d.origStart
      const deltaSec = dxRatio * Math.max(windowLen, totalDur > windowLen ? totalDur * 0.45 : windowLen)
      const nextStart = Number(Math.max(0, Math.min(totalDur - span, d.origStart + deltaSec)).toFixed(2))
      const nextEnd = Number((nextStart + span).toFixed(2))
      onAudioTrimChange(nextStart, nextEnd)
      onScrubAudioTime(nextStart)
    }
  }

  const endDrag = () => {
    if (!dragRef.current) return
    dragRef.current = null
    onScrubEnd()
  }

  const commitStartInput = (raw: string) => {
    setEditingStart(false)
    const num = Number(raw.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(num)) {
      setStartDraft(audioStart.toFixed(2))
      return
    }
    const minStart = Math.max(0, safeEnd - maxAudioSpan)
    const clamped = Number(Math.max(minStart, Math.min(safeEnd - 0.1, num)).toFixed(2))
    setStartDraft(clamped.toFixed(2))
    onAudioTrimChange(clamped, safeEnd)
    onScrubAudioTime(clamped)
  }

  const commitEndInput = (raw: string) => {
    setEditingEnd(false)
    const num = Number(raw.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(num)) {
      setEndDraft(safeEnd.toFixed(2))
      return
    }
    const maxEnd = Math.min(totalDur, audioStart + maxAudioSpan)
    const clamped = Number(Math.min(maxEnd, Math.max(audioStart + 0.1, num)).toFixed(2))
    setEndDraft(clamped.toFixed(2))
    onAudioTrimChange(audioStart, clamped)
    onScrubAudioTime(clamped)
  }

  return (
    <div className="trim-timeline-wrap">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/mp4,video/webm,.mp3,.wav,.ogg,.m4a,.aac,.opus"
        className="hidden-input"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onUploadAudioFile(f)
          e.target.value = ''
        }}
      />

      <div className="audio-bar-header">
        <span className="audio-track-name">
          {audioTrack ? `${t.audioLabel}: ${audioTrack.name}` : t.audioNone}
        </span>

        <div className="audio-bar-actions">
          {videoHasOriginalAudio && (!audioTrack || !audioTrack.isFromVideo) && (
            <button
              type="button"
              className="btn-ghost-sm"
              onClick={onRestoreVideoAudio}
              title={t.audioRestoreVideo}
            >
              <RotateCcw size={11} /> {t.audioUseVideo}
            </button>
          )}
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={() => fileInputRef.current?.click()}
            title={t.audioAddCustom}
          >
            <Upload size={11} /> {t.audioAddCustom}
          </button>
          {audioTrack && (
            <button
              type="button"
              className="btn-ghost-sm audio-del-btn"
              onClick={onRemoveAudio}
              title={t.audioRemove}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {audioTrack && (
        <>
          <div className="trim-timeline-meta">
            <div className="trim-bound-group">
              <button
                type="button"
                className="trim-set-btn"
                onClick={() => {
                  const nextStart = Number(Math.max(0, Math.min(totalDur - 0.1, currentAudioTime)).toFixed(2))
                  const nextEnd =
                    nextStart >= safeEnd - 0.1
                      ? Number(Math.min(totalDur, nextStart + Math.min(maxAudioSpan, 1)).toFixed(2))
                      : Number(Math.min(safeEnd, nextStart + maxAudioSpan).toFixed(2))
                  onAudioTrimChange(nextStart, nextEnd)
                }}
                title={t.setStartAtCurrentTitle}
              >
                {t.start}
              </button>
              <div className="trim-sec-input-wrap">
                <input
                  type="number"
                  min={0}
                  max={Number(Math.max(0, safeEnd - 0.1).toFixed(2))}
                  step={0.05}
                  value={startDraft}
                  onFocus={() => setEditingStart(true)}
                  onChange={(e) => {
                    setStartDraft(e.target.value)
                    const num = Number(e.target.value)
                    const minStart = Math.max(0, safeEnd - maxAudioSpan)
                    if (Number.isFinite(num) && num >= minStart && num <= safeEnd - 0.1) {
                      onAudioTrimChange(Number(num.toFixed(2)), safeEnd)
                      onScrubAudioTime(num)
                    }
                  }}
                  onBlur={(e) => commitStartInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitStartInput((e.target as HTMLInputElement).value)
                  }}
                  className="trim-sec-input"
                  aria-label="Audio start seconds"
                />
                <span className="trim-sec-unit">s</span>
              </div>
            </div>

            <label className="audio-ctrl-item">
              <span>{Math.round(audioVolume * 100)}%</span>
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={Math.round(audioVolume * 100)}
                onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
                className="crimson-slider audio-vol-slider"
                aria-label="Audio volume"
              />
            </label>

            <div className="trim-bound-group">
              <button
                type="button"
                className="trim-set-btn"
                onClick={() => {
                  const nextEnd = Number(Math.min(totalDur, Math.max(0.1, currentAudioTime)).toFixed(2))
                  const nextStart =
                    nextEnd <= audioStart + 0.1
                      ? Number(Math.max(0, nextEnd - Math.min(maxAudioSpan, 1)).toFixed(2))
                      : Number(Math.max(audioStart, nextEnd - maxAudioSpan).toFixed(2))
                  onAudioTrimChange(nextStart, nextEnd)
                }}
                title={t.setEndAtCurrentTitle}
              >
                {t.end}
              </button>
              <div className="trim-sec-input-wrap">
                <input
                  type="number"
                  min={Number((audioStart + 0.1).toFixed(2))}
                  max={Number(Math.min(totalDur, audioStart + maxAudioSpan).toFixed(2))}
                  step={0.05}
                  value={endDraft}
                  onFocus={() => setEditingEnd(true)}
                  onChange={(e) => {
                    setEndDraft(e.target.value)
                    const num = Number(e.target.value)
                    const maxEnd = Math.min(totalDur, audioStart + maxAudioSpan)
                    if (Number.isFinite(num) && num >= audioStart + 0.1 && num <= maxEnd) {
                      onAudioTrimChange(audioStart, Number(num.toFixed(2)))
                      onScrubAudioTime(num)
                    }
                  }}
                  onBlur={(e) => commitEndInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEndInput((e.target as HTMLInputElement).value)
                  }}
                  className="trim-sec-input"
                  aria-label="Audio end seconds"
                />
                <span className="trim-sec-unit">s</span>
              </div>
            </div>
          </div>

          <div className="trim-track-row">
            <button
              type="button"
              className="trim-play-btn"
              onClick={() => onToggleAudioEnabled(!audioEnabled)}
              title={audioEnabled ? t.audioMuteHint : t.audioUnmuteHint}
              aria-label={audioEnabled ? t.audioMuteHint : t.audioUnmuteHint}
            >
              {audioEnabled && audioVolume > 0 ? <Volume2 size={12} /> : <VolumeX size={12} />}
            </button>

            <div
              ref={trackRef}
              className={`trim-track audio-wave-unified ${!audioEnabled ? 'audio-muted-dim' : ''}`}
              onPointerDown={(e) => startDrag(e, 'playhead')}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <div className="audio-wave-bars" aria-hidden="true">
                {visiblePeaks.map((p, idx) => (
                  <span
                    key={idx}
                    className="audio-wave-bar"
                    style={{ height: `${Math.max(12, Math.round(p * 100))}%` }}
                  />
                ))}
              </div>
              <div
                className="trim-selection trim-selection-draggable"
                style={{ left: `${startPct}%`, width: `${Math.max(1.5, endPct - startPct)}%` }}
                onPointerDown={(e) => startDrag(e, 'selection')}
                title="Drag to slide audio selection"
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

          {totalDur > windowLen + 0.05 && (
            <div className="trim-pan-row">
              <span className="trim-pan-label">
                {windowStart.toFixed(1)}s–{windowEnd.toFixed(1)}s / {totalDur.toFixed(1)}s
              </span>
              <input
                type="range"
                min={0}
                max={Number((totalDur - windowLen).toFixed(2))}
                step={0.1}
                value={Number(windowStart.toFixed(2))}
                onChange={(e) => {
                  const nextWs = Number(e.target.value)
                  const span = safeEnd - audioStart
                  const clampedStart = Number(Math.max(nextWs, Math.min(nextWs + windowLen - span, audioStart)).toFixed(2))
                  setWindowStart(nextWs)
                  onAudioTrimChange(clampedStart, Number((clampedStart + span).toFixed(2)))
                }}
                className="crimson-slider trim-pan-slider"
                aria-label="Pan 10s audio window"
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
