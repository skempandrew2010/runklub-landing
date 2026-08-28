"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Clock } from "lucide-react"
import { splitFieldClasses } from "./splitFieldClasses"
import { usePopoverPosition } from "./usePopoverPosition"

// Same hybrid pattern as DateInput: a real <input type="time"> stays
// underneath for typing and the mobile OS picker, but the clock icon opens a
// custom three-column roller (hour / minute / AM-PM, iOS-style scroll wheel)
// instead of the browser's own unthemeable time popup. Portaled to
// document.body and fixed-positioned so it never gets clipped by an
// ancestor's overflow-hidden/overflow-y-auto.

const ITEM_H = 32
const VISIBLE_ROWS = 5
const COL_PAD = (ITEM_H * (VISIBLE_ROWS - 1)) / 2
const PANEL_WIDTH = 200

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))
const PERIODS = ["AM", "PM"]

function parseValue(value: string): { hourIdx: number; minuteIdx: number; periodIdx: number } {
  const [hStr, mStr] = value.split(":")
  const h24 = Number(hStr) || 0
  const minute = Number(mStr) || 0
  const periodIdx = h24 >= 12 ? 1 : 0
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return { hourIdx: h12 - 1, minuteIdx: minute, periodIdx }
}

function buildValue(hourIdx: number, minuteIdx: number, periodIdx: number): string {
  const h12 = hourIdx + 1
  const isPM = periodIdx === 1
  const h24 = isPM ? (h12 % 12) + 12 : h12 % 12
  return `${String(h24).padStart(2, "0")}:${String(minuteIdx).padStart(2, "0")}`
}

function RollerColumn({ items, index, onChange }: { items: string[]; index: number; onChange: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const settleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = index * ITEM_H
  }, [index])

  const handleScroll = () => {
    if (settleTimeout.current) clearTimeout(settleTimeout.current)
    settleTimeout.current = setTimeout(() => {
      if (!ref.current) return
      const i = Math.max(0, Math.min(items.length - 1, Math.round(ref.current.scrollTop / ITEM_H)))
      ref.current.scrollTo({ top: i * ITEM_H, behavior: "smooth" })
      if (i !== index) onChange(i)
    }, 120)
  }

  const pick = (i: number) => {
    ref.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" })
    onChange(i)
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="h-[160px] w-14 overflow-y-scroll snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ paddingTop: COL_PAD, paddingBottom: COL_PAD }}
    >
      {items.map((label, i) => (
        <div
          key={label}
          onClick={() => pick(i)}
          className={`h-8 flex items-center justify-center snap-center text-sm cursor-pointer transition-colors ${
            i === index ? "text-[#c5f135] font-black" : "text-white/40 hover:text-white/60"
          }`}
        >
          {label}
        </div>
      ))}
    </div>
  )
}

export function TimeInput({
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
  const { hourIdx, minuteIdx, periodIdx } = parseValue(value || "12:00")

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

  const setPart = (part: "hour" | "minute" | "period", i: number) => {
    const next = {
      hour: () => buildValue(i, minuteIdx, periodIdx),
      minute: () => buildValue(hourIdx, i, periodIdx),
      period: () => buildValue(hourIdx, minuteIdx, i),
    }[part]()
    onChange({ target: { value: next } })
  }

  const { sizing, visual } = splitFieldClasses(className)

  return (
    <div ref={triggerRef} className={`relative inline-block ${sizing}`}>
      <input
        type="time"
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
        aria-label="Open time picker"
        className="absolute right-0 top-0 h-full w-9 flex items-center justify-center text-white/60 hover:text-[#c5f135] transition disabled:pointer-events-none"
      >
        <Clock className="w-4 h-4" />
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
          className="z-50 bg-[#1e2d12] border border-[#2e3d1a] rounded-xl shadow-2xl p-2"
        >
          <div className="relative flex items-center justify-center">
            <div
              className="absolute left-0 right-0 rounded-lg bg-[#2e3d1a]/60 border-y border-[#c5f135]/20 pointer-events-none"
              style={{ top: COL_PAD, height: ITEM_H }}
            />
            <RollerColumn items={HOURS} index={hourIdx} onChange={(i) => setPart("hour", i)} />
            <span className="text-white/30 text-sm font-black -mx-0.5">:</span>
            <RollerColumn items={MINUTES} index={minuteIdx} onChange={(i) => setPart("minute", i)} />
            <RollerColumn items={PERIODS} index={periodIdx} onChange={(i) => setPart("period", i)} />
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full mt-1 pt-2 border-t border-[#2e3d1a] text-[11px] font-bold text-white/40 hover:text-[#c5f135] transition"
          >
            Done
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
