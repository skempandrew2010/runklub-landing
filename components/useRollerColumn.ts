"use client"

import { useEffect, useRef } from "react"

// Shared scroll-wheel-picker behavior for TimeInput's hour/minute/period
// columns and RollerSelect's single column. Wheel/trackpad/touch scrolling
// on an overflow-y element works for free in every browser, but a plain
// left-click-and-drag does nothing without this - which is the expected way
// to "spin" a roller with a mouse when there's no visible scrollbar to grab.
export function useRollerColumn(itemHeight: number, itemCount: number, index: number, onChange: (i: number) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const settleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartScrollTop = useRef(0)

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = index * itemHeight
  }, [index, itemHeight])

  const settle = () => {
    const el = ref.current
    if (!el) return
    const i = Math.max(0, Math.min(itemCount - 1, Math.round(el.scrollTop / itemHeight)))
    el.scrollTo({ top: i * itemHeight, behavior: "smooth" })
    if (i !== index) onChange(i)
  }

  const onScroll = () => {
    if (dragging.current) return
    if (settleTimeout.current) clearTimeout(settleTimeout.current)
    settleTimeout.current = setTimeout(settle, 120)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return
    dragging.current = true
    dragStartY.current = e.clientY
    dragStartScrollTop.current = ref.current?.scrollTop ?? 0
    if (ref.current) ref.current.style.scrollSnapType = "none"
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !ref.current) return
    const delta = dragStartY.current - e.clientY
    ref.current.scrollTop = dragStartScrollTop.current + delta
  }

  const endDrag = () => {
    if (!dragging.current) return
    dragging.current = false
    if (ref.current) ref.current.style.scrollSnapType = ""
    settle()
  }

  const pick = (i: number) => {
    ref.current?.scrollTo({ top: i * itemHeight, behavior: "smooth" })
    onChange(i)
  }

  return {
    ref,
    pick,
    columnProps: {
      onScroll,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerLeave: endDrag,
      onPointerCancel: endDrag,
    },
  }
}
