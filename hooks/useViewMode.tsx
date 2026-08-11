"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

export type ViewMode = "coach" | "member"

const STORAGE_KEY = "runklub_view_mode"

type ViewModeContextValue = { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void }

const ViewModeContext = createContext<ViewModeContextValue | null>(null)

/**
 * Holds the single shared coach/member view state for the whole app — mounted
 * once in ShellWrapper. Without this, each component calling useViewMode had
 * its own local state, so switching modes in Settings only took effect after
 * a reload (whichever component you were on next would re-read localStorage).
 */
export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [viewMode, setViewModeState] = useState<ViewMode>("coach")

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === "coach" || stored === "member") setViewModeState(stored)
    } catch { /* localStorage unavailable — default to coach */ }
  }, [])

  // Keep in sync with whichever of /director or /passport is actually being
  // viewed (so a direct link or the back button doesn't desync it).
  useEffect(() => {
    if (pathname.startsWith("/director")) setViewModeState("coach")
    else if (pathname.startsWith("/passport")) setViewModeState("member")
  }, [pathname])

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode)
    try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* non-fatal */ }
    if (pathname.startsWith("/director") || pathname.startsWith("/passport")) {
      router.push(mode === "coach" ? "/director" : "/passport")
    }
  }, [pathname, router])

  const value = useMemo(() => ({ viewMode, setViewMode }), [viewMode, setViewMode])

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>
}

/**
 * Lets a director/coach account (profiles.role === "manager") switch between the
 * Director-facing "Coach" nav/dashboard and the runner-facing "Member" nav/Passport.
 * Backed by the shared ViewModeProvider so a change made anywhere (e.g. Settings)
 * is reflected everywhere immediately, without a reload.
 */
export function useViewMode(eligible: boolean): ViewModeContextValue {
  const ctx = useContext(ViewModeContext)
  if (!ctx) throw new Error("useViewMode must be used within ViewModeProvider")
  return { viewMode: eligible ? ctx.viewMode : "member", setViewMode: ctx.setViewMode }
}
