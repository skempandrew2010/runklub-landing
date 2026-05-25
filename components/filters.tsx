"use client"

import { useState, useRef } from "react"

export type FilterOptions = {
  distanceRange: [number, number]
  paceRange: [number, number]
}

type FiltersProps = {
  onChange: (filters: FilterOptions) => void
}

const DIST_MIN = 0
const DIST_MAX = 25
const PACE_MIN = 5   // min/mile
const PACE_MAX = 15

export const DEFAULT_FILTERS: FilterOptions = {
  distanceRange: [DIST_MIN, DIST_MAX],
  paceRange: [PACE_MIN, PACE_MAX],
}

function formatDist(v: number) {
  return v >= DIST_MAX ? "25+ mi" : `${v} mi`
}

function formatPace(v: number) {
  const m = Math.floor(v)
  const s = Math.round((v % 1) * 60)
  return `${m}:${String(s).padStart(2, "0")}/mi`
}

// ── Custom dual-handle range slider ──────────────────────────────────────────
function RangeSlider({ min, max, step, value, onChange, format }: {
  min: number
  max: number
  step: number
  value: [number, number]
  onChange: (v: [number, number]) => void
  format: (v: number) => string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [lo, hi] = value

  const pct = (v: number) => ((v - min) / (max - min)) * 100

  const snap = (raw: number) =>
    Math.max(min, Math.min(max, Math.round(raw / step) * step))

  const ratioFromEvent = (e: React.PointerEvent) => {
    const rect = trackRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  const onMoveLo = (e: React.PointerEvent) => {
    if (!(e.buttons & 1)) return
    const v = snap(min + ratioFromEvent(e) * (max - min))
    if (v < hi) onChange([v, hi])
  }

  const onMoveHi = (e: React.PointerEvent) => {
    if (!(e.buttons & 1)) return
    const v = snap(min + ratioFromEvent(e) * (max - min))
    if (v > lo) onChange([lo, v])
  }

  const thumb = "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-[#c5f135] border-2 border-[#1a2110] shadow-md cursor-grab active:cursor-grabbing touch-none select-none hover:scale-110 transition-transform"

  return (
    <div className="pt-1 pb-2">
      <div className="flex justify-between text-xs font-black text-[#c5f135] mb-3">
        <span>{format(lo)}</span>
        <span>{format(hi)}</span>
      </div>
      <div ref={trackRef} className="relative h-1.5 rounded-full bg-[#2e3d1a] mx-2.5">
        {/* filled range */}
        <div
          className="absolute h-full bg-[#c5f135] rounded-full"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        {/* lo thumb */}
        <div
          className={thumb}
          style={{ left: `${pct(lo)}%`, zIndex: lo >= hi - step ? 2 : 1 }}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={onMoveLo}
        />
        {/* hi thumb */}
        <div
          className={thumb}
          style={{ left: `${pct(hi)}%`, zIndex: 1 }}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={onMoveHi}
        />
      </div>
    </div>
  )
}

// ── Main Filters component ────────────────────────────────────────────────────
export default function Filters({ onChange }: FiltersProps) {
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS)

  function update(next: FilterOptions) {
    setFilters(next)
    onChange(next)
  }

  const hasActive =
    filters.distanceRange[0] > DIST_MIN ||
    filters.distanceRange[1] < DIST_MAX ||
    filters.paceRange[0] > PACE_MIN ||
    filters.paceRange[1] < PACE_MAX

  const sectionLabel = "text-[10px] font-bold text-white/30 tracking-widest uppercase mb-2"

  return (
    <div className="space-y-5">

      {/* Distance range */}
      <div>
        <p className={sectionLabel}>Distance from you</p>
        <RangeSlider
          min={DIST_MIN} max={DIST_MAX} step={1}
          value={filters.distanceRange}
          onChange={(v) => update({ ...filters, distanceRange: v })}
          format={formatDist}
        />
      </div>

      {/* Pace range */}
      <div>
        <p className={sectionLabel}>Pace (min / mile)</p>
        <RangeSlider
          min={PACE_MIN} max={PACE_MAX} step={0.5}
          value={filters.paceRange}
          onChange={(v) => update({ ...filters, paceRange: v })}
          format={formatPace}
        />
      </div>

      {hasActive && (
        <button
          onClick={() => update(DEFAULT_FILTERS)}
          className="text-xs text-white/40 hover:text-[#c5f135] underline transition"
        >
          Clear all
        </button>
      )}

    </div>
  )
}
