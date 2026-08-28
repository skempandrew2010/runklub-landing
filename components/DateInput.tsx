"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { localDateStr } from "@/utils/dates"
import { splitFieldClasses } from "./splitFieldClasses"
import { usePopoverPosition } from "./usePopoverPosition"

// Hybrid date field: keeps a real <input type="date"> underneath for typing,
// backspace, and (on touch devices) the OS's own native picker sheet - all
// of that native behavior is left completely alone. Only the calendar icon
// is replaced: instead of calling showPicker() to open the browser's own
// calendar popup (which can't be recolored to match the theme - the
// selected-day highlight is drawn by the OS, same limitation as native
// <select>), clicking it opens a custom-styled calendar grid instead. The
// grid is portaled to document.body and fixed-positioned so it never gets
// clipped by an ancestor's overflow-hidden/overflow-y-auto.

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const PANEL_WIDTH = 256

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function buildGrid(year: number, month: number): (Date | null)[] {
  const firstDow = new Date(year, month, 1).getDay()
  const total = daysInMonth(year, month)
  const cells: (Date | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= total; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function DateInput({
  value,
  onChange,
  className = "",
  required = false,
  disabled = false,
}: {
  value: string
  onChange: (e: { target: { value: string } }) => void
  className?: string
  required?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const { triggerRef, rect, openUp } = usePopoverPosition(open)
  const parsed = value ? new Date(value + "T00:00:00") : null
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? new Date().getMonth())

  useEffect(() => {
    if (!open) return
    const p = value ? new Date(value + "T00:00:00") : new Date()
    setViewYear(p.getFullYear())
    setViewMonth(p.getMonth())
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, triggerRef])

  const toggleOpen = () => {
    if (disabled) return
    setOpen((o) => !o)
  }

  const pick = (d: Date) => {
    onChange({ target: { value: localDateStr(d) } })
    setOpen(false)
  }

  const grid = buildGrid(viewYear, viewMonth)
  const todayStr = localDateStr()
  const { sizing, visual } = splitFieldClasses(className)

  return (
    <div ref={triggerRef} className={`relative inline-block ${sizing}`}>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e)}
        required={required}
        disabled={disabled}
        className={`w-full [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none ${visual}`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        tabIndex={-1}
        aria-label="Open calendar"
        className="absolute right-0 top-0 h-full w-9 flex items-center justify-center text-white/60 hover:text-[#c5f135] transition disabled:pointer-events-none"
      >
        <CalendarDays className="w-4 h-4" />
      </button>
      {open && rect && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            right: window.innerWidth - rect.right,
            width: PANEL_WIDTH,
            ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
          }}
          className="z-50 bg-[#1e2d12] border border-[#2e3d1a] rounded-xl shadow-2xl p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewMonth((m) => { if (m === 0) { setViewYear((y) => y - 1); return 11 } return m - 1 })}
              className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-[#2e3d1a] transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-black text-white">
              {new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => { if (m === 11) { setViewYear((y) => y + 1); return 0 } return m + 1 })}
              className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-[#2e3d1a] transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="text-center text-[10px] font-bold text-white/30 py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {grid.map((d, i) => {
              if (!d) return <div key={i} />
              const dStr = localDateStr(d)
              const isSelected = dStr === value
              const isToday = dStr === todayStr
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(d)}
                  className={`aspect-square rounded-lg text-xs font-bold transition flex items-center justify-center ${
                    isSelected
                      ? "bg-[#c5f135] text-[#1a2110]"
                      : isToday
                      ? "text-[#c5f135] border border-[#c5f135]/40 hover:bg-[#2e3d1a]"
                      : "text-white/70 hover:bg-[#2e3d1a] hover:text-white"
                  }`}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => pick(new Date())}
            className="w-full mt-2 pt-2 border-t border-[#2e3d1a] text-[11px] font-bold text-white/40 hover:text-[#c5f135] transition"
          >
            Today
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
