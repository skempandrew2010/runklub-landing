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

export async function openExternal(url: string) {
  if (isNativeApp()) {
    try {
      const { Browser } = await import("@capacitor/browser")
      await Browser.open({ url })
      return
    } catch { /* fall through to web behavior */ }
  }
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
  const fallback = () => navigateTo(`https://www.runklub.fit${redirectPath}`)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { fallback(); return }
    const res = await fetch("/api/auth/native-handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ redirect: redirectPath }),
    })
    const data = await res.json()
    if (res.ok && data.url) navigateTo(data.url)
    else fallback()
  } catch {
    fallback()
  }
}
