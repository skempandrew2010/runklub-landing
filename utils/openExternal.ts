import type { MouseEvent } from "react"
import { isNativeApp } from "@/utils/platform"
import { supabase } from "@/lib/supabase"

// window.open() inside a Capacitor WKWebView doesn't reliably hand off to
// the system browser - without a WKUIDelegate wired up for it, iOS can
// throw "Safari cannot open the page because the address is invalid"
// instead of actually leaving the app. A real <a> element click routes
// through WKWebView's navigation delegate instead, which does hand off
// correctly, so every "leave the app" path here uses this instead of a
// bare window.open() call.
function navigateTo(url: string) {
  const a = document.createElement("a")
  a.href = url
  a.target = "_blank"
  a.rel = "noopener noreferrer"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// Best-effort visibility into /api/log-error (which already surfaces in
// Vercel's logs) for the native-handoff paths below. The "Safari cannot
// open the page" report couldn't be reproduced or inspected locally (no
// device/Web Inspector available), and reasoning about it in the abstract
// has twice pointed at fixes that didn't hold up - this exists so the next
// real failure leaves a record of the exact URL and outcome instead of
// needing another round of guessing.
export function logHandoff(context: string, detail: Record<string, unknown>) {
  try {
    const payload = JSON.stringify({
      type: "native-handoff",
      context,
      ...detail,
      pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
      ts: new Date().toISOString(),
    })
    if (typeof navigator !== "undefined" && navigator.sendBeacon) navigator.sendBeacon("/api/log-error", payload)
    else fetch("/api/log-error", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {})
  } catch { /* logging must never block the actual navigation */ }
}

export async function openExternal(url: string) {
  if (isNativeApp()) {
    try {
      const { Browser } = await import("@capacitor/browser")
      logHandoff("browser-open-attempt", { targetUrl: url })
      await Browser.open({ url })
      return
    } catch (err) {
      logHandoff("browser-open-threw", { targetUrl: url, error: String(err) })
      /* fall through to web behavior */
    }
  }
  logHandoff("navigate-to", { targetUrl: url, native: isNativeApp() })
  navigateTo(url)
}

// For real <a> elements: only intercept the click natively (routing through
// Browser.open) and otherwise let the browser's default anchor behavior
// handle it on web — preserves right-click/middle-click/crawlability there.
export function interceptExternalClick(e: MouseEvent, url: string) {
  if (isNativeApp()) {
    e.preventDefault()
    openExternal(url)
  }
}

// For sending someone from the native app to a *signed-in* page on the
// website - the app's own WKWebView session never carries over to the
// system browser Apple requires purchase-adjacent flows to open in, so a
// plain link would drop them at a login wall. This mints a one-time magic
// link server-side instead, via the caller's own current session, and
// always opens in the real system browser (never the in-app Browser
// sheet - that's reserved for OAuth) to satisfy Apple's external-purchase-
// link rules. Falls back to a plain (signed-out) link if anything fails,
// rather than leaving the button dead.
export async function openAuthenticatedWebLink(redirectPath: string) {
  const fallback = (reason: string) => {
    const url = `https://www.runklub.fit${redirectPath}`
    logHandoff("web-link-fallback", { redirectPath, reason, targetUrl: url })
    navigateTo(url)
  }
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { fallback("no-session"); return }
    const res = await fetch("/api/auth/native-handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ redirect: redirectPath }),
    })
    const data = await res.json()
    if (res.ok && data.url) {
      logHandoff("web-link-success", { redirectPath, targetUrl: data.url })
      navigateTo(data.url)
    } else {
      fallback(`handoff-failed:${res.status}:${data?.error ?? "unknown"}`)
    }
  } catch (err) {
    fallback(`exception:${String(err)}`)
  }
}
