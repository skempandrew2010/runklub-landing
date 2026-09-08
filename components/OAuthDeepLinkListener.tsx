"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { isNativeApp } from "@/utils/platform"

// Google (and every other OAuth provider) refuses to authenticate inside an
// embedded WKWebView, so native sign-in opens the OAuth flow in an in-app
// Safari sheet instead (see handleOAuth in app/login/page.tsx) and redirects
// back here via a custom URL scheme once the provider's done - that scheme
// has to be registered in both ios/App/App/Info.plist (CFBundleURLTypes)
// and Supabase's Auth > URL Configuration allowed redirect list, or the
// provider rejects the redirect before this ever fires.
export default function OAuthDeepLinkListener() {
  const router = useRouter()

  useEffect(() => {
    if (!isNativeApp()) return
    let removeListener: (() => void) | undefined
    let cancelled = false

    const setup = async () => {
      const [{ App }, { Browser }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/browser"),
      ])
      if (cancelled) return

      const sub = await App.addListener("appUrlOpen", async ({ url }) => {
        if (!url.startsWith("fit.runklub.app://auth-callback")) return

        const hash = url.includes("#") ? url.split("#")[1] : ""
        const params = new URLSearchParams(hash)
        const access_token = params.get("access_token")
        const refresh_token = params.get("refresh_token")

        await Browser.close().catch(() => {})

        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token })
          router.replace("/auth/callback")
        }
      })
      removeListener = () => { sub.remove() }
    }
    setup()

    return () => { cancelled = true; removeListener?.() }
  }, [router])

  return null
}
