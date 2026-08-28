"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Clock } from "lucide-react"
import { splitFieldClasses } from "./splitFieldClasses"
import { usePopoverPosition } from "./usePopoverPosition"

// Same hybrid pattern as DateInput: a real <input type="time"> stays
// underneath for typing and the mobile OS picker, but the clock icon opens a
// custom-styled scrollable time list instead of the browser's own
// unthemeable time popup. Portaled to document.body and fixed-positioned so
// it never gets clipped by an ancestor's overflow-hidden/overflow-y-auto.

const PANEL_WIDTH = 128

function formatLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  const period = h < 12 ? "AM" : "PM"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

const TIME_OPTIONS: { value: string; label: string }[] = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4)
  const m = (i % 4) * 15
  const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  return { value, label: formatLabel(value) }
})

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

  useEffect(() => {
    if (!open || !panelRef.current) return
    const active = panelRef.current.querySelector('[data-active="true"]') as HTMLElement | null
    active?.scrollIntoView({ block: "center" })
  }, [open, rect])

  const toggleOpen = () => {
    if (disabled) return
    setOpen((o) => !o)
  }

  const pick = (v: string) => {
    onChange({ target: { value: v } })
    setOpen(false)
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
            maxHeight: 224,
            ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
          }}
          className="z-50 overflow-y-auto bg-[#1e2d12] border border-[#2e3d1a] rounded-xl shadow-2xl py-1"
        >
          {TIME_OPTIONS.map((t) => {
            const active = t.value === value
            return (
              <button
                key={t.value}
                type="button"
                data-active={active}
                onClick={() => pick(t.value)}
                className={`w-full text-left px-3 py-1.5 text-sm transition ${
                  active ? "text-[#c5f135] bg-[#2e3d1a]/60 font-bold" : "text-white/80 hover:bg-[#2e3d1a]/50 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}
