"use client"

import { useEffect, useRef, useState, Children, isValidElement, type ReactElement, type ReactNode } from "react"
import { ChevronDown, Check } from "lucide-react"
import { splitFieldClasses } from "./splitFieldClasses"

// Drop-in replacement for a native <select> that renders <option>/<optgroup>
// children exactly like the real thing (same value/onChange shape as
// onChange={(e) => setX(e.target.value)}), so most call sites only need
// their tag name capitalized. Built because the browser's own dropdown
// popup - specifically the highlighted "currently selected" row - can't be
// recolored via CSS (color-scheme: dark only gets you so far; that one row
// is drawn by the OS's own widget chrome). This gives full control instead.

type OptionItem = { value: string; label: ReactNode; disabled?: boolean }
type GroupItem = { label: string; options: OptionItem[] }
type Item = OptionItem | GroupItem

function isGroup(item: Item): item is GroupItem {
  return "options" in item
}

function parseChildren(children: ReactNode): Item[] {
  const items: Item[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const el = child as ReactElement<any>
    if (el.type === "option") {
      items.push({ value: String(el.props.value ?? ""), label: el.props.children, disabled: el.props.disabled })
    } else if (el.type === "optgroup") {
      const options: OptionItem[] = []
      Children.forEach(el.props.children, (opt) => {
        if (isValidElement(opt)) {
          const o = opt as ReactElement<any>
          options.push({ value: String(o.props.value ?? ""), label: o.props.children, disabled: o.props.disabled })
        }
      })
      items.push({ label: el.props.label, options })
    }
  })
  return items
}

function flatten(items: Item[]): OptionItem[] {
  return items.flatMap((it) => (isGroup(it) ? it.options : [it]))
}

export function Select({
  value,
  onChange,
  children,
  className = "",
  disabled = false,
  placeholder = "Select...",
}: {
  value: string
  onChange: (e: { target: { value: string } }) => void
  children: ReactNode
  className?: string
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
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
  }, [open])

  const items = parseChildren(children)
  const flat = flatten(items)
  const selected = flat.find((o) => o.value === value)
  const { sizing, visual } = splitFieldClasses(className)

  const toggleOpen = () => {
    if (disabled) return
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect()
      setOpenUp(window.innerHeight - rect.bottom < 260 && rect.top > 260)
    }
    setOpen((o) => !o)
  }

  const selectValue = (v: string) => {
    onChange({ target: { value: v } })
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className={`relative inline-block ${sizing}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className={`w-full flex items-center justify-between gap-2 text-left cursor-pointer disabled:cursor-not-allowed ${visual}`}
      >
        <span className={`truncate ${!selected ? "opacity-60" : ""}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 opacity-45 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className={`absolute z-50 left-0 right-0 min-w-max max-h-64 overflow-y-auto bg-[#1e2d12] border border-[#2e3d1a] rounded-xl shadow-2xl py-1 ${
            openUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {items.map((it, i) =>
            isGroup(it) ? (
              <div key={i}>
                <div className="px-3 pt-2 pb-1 text-[10px] font-black text-white/30 uppercase tracking-widest">{it.label}</div>
                {it.options.map((opt) => (
                  <OptionRow key={opt.value} opt={opt} active={opt.value === value} onSelect={selectValue} />
                ))}
              </div>
            ) : (
              <OptionRow key={it.value} opt={it} active={it.value === value} onSelect={selectValue} />
            )
          )}
        </div>
      )}
    </div>
  )
}

function OptionRow({ opt, active, onSelect }: { opt: OptionItem; active: boolean; onSelect: (v: string) => void }) {
  return (
    <button
      type="button"
      disabled={opt.disabled}
      onClick={() => onSelect(opt.value)}
      className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm transition disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "text-[#c5f135] bg-[#2e3d1a]/60" : "text-white/80 hover:bg-[#2e3d1a]/50 hover:text-white"
      }`}
    >
      <span className="truncate">{opt.label}</span>
      {active && <Check className="w-3.5 h-3.5 shrink-0" />}
    </button>
  )
}
