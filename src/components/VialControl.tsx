import { useState, useRef } from 'react'

interface VialControlProps {
  label: string
  value: number
  min: number
  max: number
  editMin?: number
  editMax?: number
  step?: number
  unit?: string
  editable?: boolean
  accent?: 'obsidian' | 'cursed'
  hint?: string
  onChange: (value: number) => void
  onReset?: () => void
}

/**
 * Vertical gothic vial control filled with dark bubbling liquid.
 * Drag up/down, scroll wheel, double-click to reset, or click the value text to type directly.
 */
export function VialControl({
  label,
  value,
  min,
  max,
  editMin,
  editMax,
  step = 1,
  unit = '',
  editable = false,
  accent = 'obsidian',
  hint,
  onChange,
  onReset,
}: VialControlProps) {
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))

  const clampAndSnap = (raw: number, lower = min, upper = max) => {
    const clamped = Math.max(lower, Math.min(upper, raw))
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
    onChange(clampAndSnap(next, min, max))
  }

  const handlePointerUp = () => {
    dragRef.current = null
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const dir = e.deltaY < 0 ? 1 : -1
    onChange(clampAndSnap(value + dir * step, editMin ?? min, editMax ?? max))
  }

  const commitDraft = () => {
    setEditing(false)
    const cleaned = draft.replace(/[^0-9.-]/g, '').trim()
    if (!cleaned || cleaned === '-') return
    const num = Number(cleaned)
    if (Number.isFinite(num)) {
      onChange(clampAndSnap(num, editMin ?? min, editMax ?? max))
    }
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
        title={hint || 'Drag up/down or use mouse wheel (double-click to reset)'}
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
        {editable && editing ? (
          <input
            type="number"
            min={min}
            max={editMax ?? max}
            step={step}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="vial-inline-input"
          />
        ) : (
          <strong
            className={`vial-value ${editable ? 'vial-value-editable' : ''}`}
            onClick={() => {
              if (!editable) return
              setDraft(String(value))
              setEditing(true)
            }}
            title={editable ? 'Click to type custom value' : undefined}
          >
            {value}
            {unit}
          </strong>
        )}
      </div>
    </div>
  )
}
