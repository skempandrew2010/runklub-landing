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
