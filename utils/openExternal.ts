import type { MouseEvent } from "react"
import { isNativeApp } from "@/utils/platform"

export async function openExternal(url: string) {
  if (isNativeApp()) {
    try {
      const { Browser } = await import("@capacitor/browser")
      await Browser.open({ url })
      return
    } catch { /* fall through to web behavior */ }
  }
  window.open(url, "_blank", "noopener,noreferrer")
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
