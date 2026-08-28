"use client"

import { useEffect, useRef, useState } from "react"

// Shared by Select/DateInput/TimeInput: their dropdown panels are portaled
// to document.body and positioned with `position: fixed` using the numbers
// this returns, instead of `position: absolute` relative to the trigger.
// Absolute positioning gets clipped by any ancestor with overflow-hidden or
// overflow-y-auto (e.g. a rounded card, a scrollable modal) - fixed
// positioning via a portal escapes that entirely. Recomputes on scroll/
// resize while open so the panel stays glued to its trigger.
export function usePopoverPosition(open: boolean) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [openUp, setOpenUp] = useState(false)

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setRect(null)
      return
    }
    const update = () => {
      if (!triggerRef.current) return
      const r = triggerRef.current.getBoundingClientRect()
      setRect(r)
      setOpenUp(window.innerHeight - r.bottom < 300 && r.top > 300)
    }
    update()
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [open])

  return { triggerRef, rect, openUp }
}
