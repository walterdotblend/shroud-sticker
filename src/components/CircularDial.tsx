import { useRef } from 'react'

interface CircularDialProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  size?: number
  onChange: (value: number) => void
  onReset?: () => void
}

/**
 * Interactive rotary knob / circular dial with pointer drag & wheel support.
 */
export function CircularDial({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  size = 64,
  onChange,
  onReset,
}: CircularDialProps) {
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null)

  const clampAndSnap = (raw: number) => {
    const clamped = Math.max(min, Math.min(max, raw))
    const snapped = Math.round(clamped / step) * step
    return Number(snapped.toFixed(2))
  }

  const ratio = (value - min) / Math.max(0.0001, max - min)
  // Sweep from -135deg to +135deg
  const angleDeg = -135 + ratio * 270

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startVal: value }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dy = dragRef.current.startY - e.clientY
    const range = max - min
    const next = dragRef.current.startVal + (dy / 120) * range
    onChange(clampAndSnap(next))
  }

  const handlePointerUp = () => {
    dragRef.current = null
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const dir = e.deltaY < 0 ? 1 : -1
    onChange(clampAndSnap(value + dir * step))
  }

  return (
    <div className="dial-control">
      <div
        className="dial-knob"
        style={{ width: size, height: size }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={onReset}
        title="Arrastra arriba/abajo o usa la rueda del ratón (doble clic para resetear)"
      >
        <svg viewBox="0 0 64 64" className="dial-svg">
          <circle cx="32" cy="32" r="26" className="dial-ring-bg" />
          <circle
            cx="32"
            cy="32"
            r="26"
            className="dial-ring-active"
            strokeDasharray={`${Math.max(0, ratio) * 122.5} 200`}
            transform="rotate(135 32 32)"
          />
          <g transform={`rotate(${angleDeg} 32 32)`}>
            <line x1="32" y1="32" x2="32" y2="10" className="dial-needle" />
            <circle cx="32" cy="10" r="2.5" className="dial-dot" />
          </g>
        </svg>
      </div>
      <div className="dial-meta">
        <span className="dial-label">{label}</span>
        <strong className="dial-value">
          {value}
          {unit}
        </strong>
      </div>
    </div>
  )
}
