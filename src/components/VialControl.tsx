import { useRef } from 'react'

interface VialControlProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  accent?: 'obsidian' | 'cursed'
  onChange: (value: number) => void
  onReset?: () => void
}

/**
 * Vertical gothic vial control filled with dark bubbling liquid.
 * Drag up/down, scroll wheel, or double-click to reset.
 */
export function VialControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  accent = 'obsidian',
  onChange,
  onReset,
}: VialControlProps) {
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null)

  const clampAndSnap = (raw: number) => {
    const clamped = Math.max(min, Math.min(max, raw))
    const snapped = Math.round(clamped / step) * step
    return Number(snapped.toFixed(2))
  }

  const ratio = Math.max(0, Math.min(1, (value - min) / Math.max(0.0001, max - min)))
  const fillPct = Math.round(ratio * 100)

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startVal: value }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dy = dragRef.current.startY - e.clientY
    const range = max - min
    const next = dragRef.current.startVal + (dy / 110) * range
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
    <div className="vial-control">
      <div
        className={`vial-tube ${accent === 'cursed' ? 'vial-cursed' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={onReset}
        title="Arrastra arriba/abajo o usa la rueda del ratón (doble clic para resetear)"
      >
        <div className="vial-ticks" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="vial-liquid" style={{ height: `${fillPct}%` }}>
          <div className="vial-meniscus" />
          <span className="vial-bubble b1" />
          <span className="vial-bubble b2" />
          <span className="vial-bubble b3" />
        </div>
      </div>
      <div className="vial-meta">
        <span className="vial-label">{label}</span>
        <strong className="vial-value">
          {value}
          {unit}
        </strong>
      </div>
    </div>
  )
}
