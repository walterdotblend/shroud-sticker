import { useRef } from 'react'
import { Repeat, RotateCcw, Trash2, Upload, Volume2, VolumeX } from 'lucide-react'
import type { AudioTrackInfo } from '../engine/types'
import type { Translations } from '../i18n/translations'

interface AudioTrackBarProps {
  t: Translations
  audioTrack: AudioTrackInfo | null
  videoHasOriginalAudio: boolean
  audioEnabled: boolean
  audioVolume: number
  audioStart: number
  loopVideoToAudio: boolean
  effectiveVideoDuration: number
  currentAudioTime: number
  onToggleAudioEnabled: (enabled: boolean) => void
  onVolumeChange: (vol: number) => void
  onAudioStartChange: (startSec: number) => void
  onToggleLoopVideo: (loop: boolean) => void
  onUploadAudioFile: (file: File) => void
  onRemoveAudio: () => void
  onRestoreVideoAudio: () => void
  onScrubStart: () => void
  onScrubAudioTime: (audioSec: number) => void
  onScrubEnd: () => void
}

export function AudioTrackBar({
  t,
  audioTrack,
  videoHasOriginalAudio,
  audioEnabled,
  audioVolume,
  audioStart,
  loopVideoToAudio,
  effectiveVideoDuration,
  currentAudioTime,
  onToggleAudioEnabled,
  onVolumeChange,
  onAudioStartChange,
  onToggleLoopVideo,
  onUploadAudioFile,
  onRemoveAudio,
  onRestoreVideoAudio,
  onScrubStart,
  onScrubAudioTime,
  onScrubEnd,
}: AudioTrackBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const waveTrackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const trackDur = Math.max(0.2, audioTrack?.duration || 1)
  const maxAudioWindow = Math.min(10, loopVideoToAudio ? Math.max(effectiveVideoDuration, trackDur - audioStart) : effectiveVideoDuration)
  const audioEnd = Math.min(trackDur, audioStart + maxAudioWindow)
  const audioLongerThanVideo = !!audioTrack && trackDur - audioStart > effectiveVideoDuration + 0.12

  const startPct = Math.max(0, Math.min(100, (audioStart / trackDur) * 100))
  const endPct = Math.max(startPct, Math.min(100, (audioEnd / trackDur) * 100))
  const playPct = Math.max(0, Math.min(100, (currentAudioTime / trackDur) * 100))

  const clientXToTime = (clientX: number) => {
    const rect = waveTrackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return 0
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Number((ratio * trackDur).toFixed(2))
  }

  return (
    <div className="audio-track-bar">
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
        <div className="audio-bar-title">
          <button
            type="button"
            className={`audio-mute-btn ${audioEnabled && audioTrack ? 'active' : ''}`}
            disabled={!audioTrack}
            onClick={() => onToggleAudioEnabled(!audioEnabled)}
            title={audioEnabled ? t.audioMuteHint : t.audioUnmuteHint}
          >
            {audioEnabled && audioTrack && audioVolume > 0 ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
          <span className="audio-track-name">
            {audioTrack ? `${t.audioLabel}: ${audioTrack.name}` : t.audioNone}
          </span>
        </div>

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

      {audioTrack && audioEnabled && (
        <>
          {/* Synced Waveform Scrubber */}
          <div
            ref={waveTrackRef}
            className="audio-wave-track"
            onPointerDown={(e) => {
              e.preventDefault()
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              draggingRef.current = true
              onScrubStart()
              const tSec = clientXToTime(e.clientX)
              const clamped = Math.max(audioStart, Math.min(audioEnd, tSec))
              onScrubAudioTime(clamped)
            }}
            onPointerMove={(e) => {
              if (!draggingRef.current) return
              const tSec = clientXToTime(e.clientX)
              const clamped = Math.max(audioStart, Math.min(audioEnd, tSec))
              onScrubAudioTime(clamped)
            }}
            onPointerUp={() => {
              if (!draggingRef.current) return
              draggingRef.current = false
              onScrubEnd()
            }}
            onPointerCancel={() => {
              if (!draggingRef.current) return
              draggingRef.current = false
              onScrubEnd()
            }}
          >
            <div className="audio-wave-bars" aria-hidden="true">
              {audioTrack.peaks.map((p, idx) => (
                <span
                  key={idx}
                  className="audio-wave-bar"
                  style={{ height: `${Math.max(12, Math.round(p * 100))}%` }}
                />
              ))}
            </div>
            <div
              className="audio-window-highlight"
              style={{ left: `${startPct}%`, width: `${Math.max(1, endPct - startPct)}%` }}
            />
            <div className="audio-playhead" style={{ left: `${playPct}%` }} />
          </div>

          {/* Volume, Audio Start Offset & Loop Video to Match Audio */}
          <div className="audio-controls-row">
            <label className="audio-ctrl-item">
              <span>{t.audioVolume}: <strong>{Math.round(audioVolume * 100)}%</strong></span>
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={Math.round(audioVolume * 100)}
                onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
                className="crimson-slider audio-vol-slider"
              />
            </label>

            <label className="audio-ctrl-item">
              <span>{t.audioOffset}:</span>
              <input
                type="number"
                min={0}
                max={Number(Math.max(0, trackDur - 0.1).toFixed(2))}
                step={0.05}
                value={Number(audioStart.toFixed(2))}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isFinite(v)) {
                    onAudioStartChange(Math.max(0, Math.min(Math.max(0, trackDur - 0.1), v)))
                  }
                }}
                className="trim-sec-input audio-offset-input"
              />
              <span className="trim-sec-unit">s</span>
            </label>

            {audioLongerThanVideo && (
              <label className="checkbox-inline audio-loop-toggle" title={t.loopVideoToAudioHint}>
                <input
                  type="checkbox"
                  checked={loopVideoToAudio}
                  onChange={(e) => onToggleLoopVideo(e.target.checked)}
                />
                <Repeat size={11} className="icon-crimson" />
                <span>{t.loopVideoToAudio}</span>
              </label>
            )}
          </div>
        </>
      )}
    </div>
  )
}
