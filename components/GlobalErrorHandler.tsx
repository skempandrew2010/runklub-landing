"use client"

import { useEffect, Component, ReactNode } from "react"

// ── Client-side global error handler ──────────────────────────────────────────
// Catches uncaught JS errors and unhandled promise rejections in the browser
// and forwards them to /api/log-error so they appear in Vercel's server logs.

function sendError(payload: object) {
  try {
    navigator.sendBeacon("/api/log-error", JSON.stringify(payload))
  } catch {
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  }
}

// A stale chunk hash from a page loaded before the latest deploy — the fix is
// always a fresh reload, never the generic crash screen (guarded against
// looping in case the reload itself races another deploy).
function isChunkLoadError(message: string | null | undefined) {
  return !!message && /Failed to (fetch|load) (dynamically imported module|chunk)|ChunkLoadError|Loading chunk .* failed|Importing a module script failed/i.test(message)
}

function reloadForStaleChunk() {
  try {
    const key = "rk_chunk_reload_at"
    const last = Number(sessionStorage.getItem(key) || 0)
    if (Date.now() - last < 10000) return
    sessionStorage.setItem(key, String(Date.now()))
  } catch { /* sessionStorage unavailable — reload once is still safe */ }
  window.location.reload()
}

export function GlobalErrorHandler() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isChunkLoadError(e.message)) { reloadForStaleChunk(); return }
      sendError({
        type: "uncaught",
        message: e.message,
        stack: e.error?.stack,
        url: window.location.href,
      })
    }

    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      const message = String(e.reason?.message ?? e.reason)
      if (isChunkLoadError(message)) { reloadForStaleChunk(); return }
      sendError({
        type: "unhandledRejection",
        message,
        stack: e.reason?.stack,
        url: window.location.href,
      })
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onUnhandledRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onUnhandledRejection)
    }
  }, [])

  return null
}

// ── React error boundary ───────────────────────────────────────────────────────
// Catches errors thrown during rendering so the whole page doesn't go blank.

type Props = { children: ReactNode }
type State = { crashed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    sendError({
      type: "reactCrash",
      message: error.message,
      stack: error.stack,
      context: info.componentStack,
      url: typeof window !== "undefined" ? window.location.href : "ssr",
    })
    if (isChunkLoadError(error.message)) reloadForStaleChunk()
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <p className="text-2xl font-black text-white mb-2">Something went wrong</p>
            <p className="text-white/40 text-sm mb-6">We've logged the error. Try refreshing the page.</p>
            <button
              onClick={() => this.setState({ crashed: false })}
              className="px-6 py-2.5 bg-[#c5f135] text-[#1a2110] font-black rounded-full text-sm hover:bg-[#d4ff45] transition"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
