"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

export type ViewMode = "member" | "director"

const STORAGE_KEY = "runklub_view_mode_v2"

type ViewModeContextValue = { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void }

const ViewModeContext = createContext<ViewModeContextValue | null>(null)

/**
 * Holds the single shared view-mode state for the whole app — mounted once
 * in ShellWrapper. Without this, each component calling useViewMode had its
 * own local state, so switching modes in Settings only took effect after a
 * reload (whichever component you were on next would re-read localStorage).
 */
export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [viewMode, setViewModeState] = useState<ViewMode>("director")

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === "member" || stored === "director") setViewModeState(stored)
    } catch { /* localStorage unavailable — default to director */ }
  }, [])

  // Keep in sync with whichever of /director or /passport is actually being
  // viewed (so a direct link or the back button doesn't desync it).
  useEffect(() => {
    if (pathname.startsWith("/director")) setViewModeState("director")
    else if (pathname.startsWith("/passport")) setViewModeState("member")
  }, [pathname])

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode)
    try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* non-fatal */ }
    if (pathname.startsWith("/director") || pathname.startsWith("/passport")) {
      router.push(mode === "director" ? "/director" : "/passport")
    }
  }, [pathname, router])

  const value = useMemo(() => ({ viewMode, setViewMode }), [viewMode, setViewMode])

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>
}

/**
 * Lets an account switch between the runner-facing Member view and the
 * Director-tab view. "Director" here covers both a full klub owner and an
 * invited pace-group Coach — they land on the same /director tab, and
 * /director/page.tsx itself decides which (full vs. limited) to render.
 * Backed by the shared ViewModeProvider so a change made anywhere (e.g.
 * Settings) is reflected everywhere immediately, without a reload. The
 * returned mode is clamped to "member" if this account isn't eligible for
 * Director at all (not an owner and not an active coach anywhere).
 */
export function useViewMode(eligible: boolean): ViewModeContextValue {
  const ctx = useContext(ViewModeContext)
  if (!ctx) throw new Error("useViewMode must be used within ViewModeProvider")
  const viewMode = ctx.viewMode === "director" && !eligible ? "member" : ctx.viewMode
  return { viewMode, setViewMode: ctx.setViewMode }
}
