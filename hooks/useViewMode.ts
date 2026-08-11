"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

export type ViewMode = "coach" | "member"

const STORAGE_KEY = "runklub_view_mode"

/**
 * Lets a director/coach account (profiles.role === "manager") switch between the
 * Director-facing "Coach" nav/dashboard and the runner-facing "Member" nav/Passport,
 * persisted locally and kept in sync with whichever of /director or /passport
 * they're actually viewing (so a direct link or the back button doesn't desync it).
 */
export function useViewMode(eligible: boolean): { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void } {
  const pathname = usePathname()
  const router = useRouter()
  const [viewMode, setViewModeState] = useState<ViewMode>("coach")

  useEffect(() => {
    if (!eligible) return
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === "coach" || stored === "member") setViewModeState(stored)
    } catch { /* localStorage unavailable — default to coach */ }
  }, [eligible])

  useEffect(() => {
    if (!eligible) return
    if (pathname.startsWith("/director")) setViewModeState("coach")
    else if (pathname.startsWith("/passport")) setViewModeState("member")
  }, [eligible, pathname])

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode)
    try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* non-fatal */ }
    if (pathname.startsWith("/director") || pathname.startsWith("/passport")) {
      router.push(mode === "coach" ? "/director" : "/passport")
    }
  }, [pathname, router])

  return { viewMode: eligible ? viewMode : "member", setViewMode }
}
