"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"

// Wraps a nav tab's normal visual content (icon/label/sublabel) so clicking
// it opens a "which klub am I coaching?" popover instead of navigating
// straight there - used only when the signed-in coach has more than one
// active klub, so there's actually something to pick between. Positioned
// via getBoundingClientRect + a body portal (not CSS anchoring) so it isn't
// clipped by the nav's own overflow and stays glued to the tab on scroll/
// resize while open.
export default function NavClubSwitcher({
  clubs,
  activeClubId,
  openUp = false,
  triggerClassName,
  registerRef,
  children,
}: {
  clubs: { id: string; name: string }[]
  activeClubId?: string | null
  openUp?: boolean
  triggerClassName: string
  registerRef?: (el: HTMLButtonElement | null) => void
  children: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!open || !btnRef.current) { setRect(null); return }
    const update = () => setRect(btnRef.current?.getBoundingClientRect() ?? null)
    update()
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        ref={(el) => { btnRef.current = el; registerRef?.(el) }}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {children}
      </button>
      {open && rect && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            left: Math.min(rect.left, window.innerWidth - 216),
            ...(openUp ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
          }}
          className="z-50 w-[208px] max-h-64 overflow-y-auto bg-[#1e2d12] border border-[#2e3d1a] rounded-xl shadow-2xl py-1 animate-[fadeUp_0.15s_ease-out_forwards]"
        >
          <p className="px-3 pt-1.5 pb-1 text-[10px] font-black text-white/30 uppercase tracking-widest">Coaching</p>
          {clubs.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { setOpen(false); router.push(`/director?as=coach&club_id=${c.id}`) }}
              className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm transition ${
                c.id === activeClubId ? "text-[#c5f135] bg-[#2e3d1a]/60" : "text-white/80 hover:bg-[#2e3d1a]/50 hover:text-white"
              }`}
            >
              <span className="truncate">{c.name}</span>
              {c.id === activeClubId && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
