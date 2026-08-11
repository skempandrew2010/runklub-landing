"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

export type ViewMode = "member" | "director" | "coach"

// Bumped from the old "runklub_view_mode" key: that key's only ever-stored
// value "coach" used to mean today's "director" (klub owner) — now that
// "coach" means something else entirely (a pace-group-scoped assistant),
// reusing the key would silently reinterpret old directors as coaches.
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
      if (stored === "member" || stored === "director" || stored === "coach") setViewModeState(stored)
    } catch { /* localStorage unavailable — default to director */ }
  }, [])

  // Keep in sync with whichever of /director, /coach, or /passport is
  // actually being viewed (so a direct link or the back button doesn't desync it).
  useEffect(() => {
    if (pathname.startsWith("/director")) setViewModeState("director")
    else if (pathname.startsWith("/coach")) setViewModeState("coach")
    else if (pathname.startsWith("/passport")) setViewModeState("member")
  }, [pathname])

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode)
    try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* non-fatal */ }
    if (pathname.startsWith("/director") || pathname.startsWith("/coach") || pathname.startsWith("/passport")) {
      router.push(mode === "director" ? "/director" : mode === "coach" ? "/coach" : "/passport")
    }
  }, [pathname, router])

  const value = useMemo(() => ({ viewMode, setViewMode }), [viewMode, setViewMode])

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>
}

export type ViewModeEligibility = { canDirector: boolean; canCoach: boolean }

/**
 * Lets an account switch between the runner-facing Member view, the
 * assistant-coach view (pace-group/branch-scoped, granted by a director's
 * invite), and the full Director view (klub owner). Backed by the shared
 * ViewModeProvider so a change made anywhere (e.g. Settings) is reflected
 * everywhere immediately, without a reload. The returned mode is clamped to
 * whatever the caller is actually eligible for — e.g. if the shared state
 * says "director" but this account doesn't own a klub, it falls back to
 * "coach" (if eligible) or "member".
 */
export function useViewMode(eligibility: ViewModeEligibility): ViewModeContextValue {
  const ctx = useContext(ViewModeContext)
  if (!ctx) throw new Error("useViewMode must be used within ViewModeProvider")
  const { canDirector, canCoach } = eligibility

  let viewMode = ctx.viewMode
  if (viewMode === "director" && !canDirector) viewMode = canCoach ? "coach" : "member"
  else if (viewMode === "coach" && !canCoach) viewMode = canDirector ? "director" : "member"

  return { viewMode, setViewMode: ctx.setViewMode }
}
