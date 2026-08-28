"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown } from "lucide-react"
import { splitFieldClasses } from "./splitFieldClasses"
import { usePopoverPosition } from "./usePopoverPosition"

// Single-column iOS-style scroll wheel version of Select - same trigger/
// onChange shape, but the open panel is a snap-scrolling roller (like
// TimeInput's hour/minute/period columns) instead of a plain option list.
// Meant for option sets where "spin to the value you want" reads better
// than a tall dropdown list, e.g. timezone pickers.

const ITEM_H = 32
const VISIBLE_ROWS = 5
const COL_PAD = (ITEM_H * (VISIBLE_ROWS - 1)) / 2

export function RollerSelect({
  value,
  onChange,
  options,
  className = "",
  disabled = false,
  panelWidth = 220,
  placeholder = "Select...",
}: {
  value: string
  onChange: (e: { target: { value: string } }) => void
  options: { value: string; label: string }[]
  className?: string
  disabled?: boolean
  panelWidth?: number
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const colRef = useRef<HTMLDivElement>(null)
  const settleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { triggerRef, rect, openUp } = usePopoverPosition(open)
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const selected = options[index]

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
    // rect is in the deps because the portaled column only exists in the DOM
    // once usePopoverPosition resolves it (one render after `open` flips
    // true) - syncing on `open` alone would run before colRef is attached.
    if (open && colRef.current) colRef.current.scrollTop = index * ITEM_H
  }, [open, index, rect])

  const handleScroll = () => {
    if (settleTimeout.current) clearTimeout(settleTimeout.current)
    settleTimeout.current = setTimeout(() => {
      if (!colRef.current) return
      const i = Math.max(0, Math.min(options.length - 1, Math.round(colRef.current.scrollTop / ITEM_H)))
      colRef.current.scrollTo({ top: i * ITEM_H, behavior: "smooth" })
      if (options[i] && options[i].value !== value) onChange({ target: { value: options[i].value } })
    }, 120)
  }

  const pick = (i: number) => {
    colRef.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" })
    onChange({ target: { value: options[i].value } })
  }

  const toggleOpen = () => {
    if (disabled) return
    setOpen((o) => !o)
  }

  const { sizing, visual } = splitFieldClasses(className)

  return (
    <div ref={triggerRef} className={`relative inline-block ${sizing}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className={`w-full flex items-center justify-between gap-2 text-left cursor-pointer disabled:cursor-not-allowed ${visual}`}
      >
        <span className={`truncate ${!selected ? "opacity-60" : ""}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 opacity-45 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && rect && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            left: rect.left,
            width: panelWidth,
            ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
          }}
          className="z-50 bg-[#1e2d12] border border-[#2e3d1a] rounded-xl shadow-2xl p-2"
        >
          <div className="relative">
            <div
              className="absolute left-0 right-0 rounded-lg bg-[#2e3d1a]/60 border-y border-[#c5f135]/20 pointer-events-none"
              style={{ top: COL_PAD, height: ITEM_H }}
            />
            <div
              ref={colRef}
              onScroll={handleScroll}
              className="h-[160px] overflow-y-scroll snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ paddingTop: COL_PAD, paddingBottom: COL_PAD }}
            >
              {options.map((o, i) => (
                <div
                  key={o.value}
                  onClick={() => pick(i)}
                  className={`h-8 flex items-center justify-center snap-center text-xs text-center px-2 cursor-pointer truncate transition-colors ${
                    i === index ? "text-[#c5f135] font-black" : "text-white/40 hover:text-white/60"
                  }`}
                >
                  {o.label}
                </div>
              ))}
            </div>
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
