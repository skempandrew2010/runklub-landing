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

        // Supabase reports failures (redirect-URI mismatch, denied consent,
        // etc.) through this same redirect, as #error=...&error_description=...
        // instead of tokens - surfacing that beats silently doing nothing,
        // which otherwise looks identical to a successful sign-in that just
        // never returns.
        const hashPart = url.includes("#") ? url.split("#")[1] : ""
        const queryPart = url.includes("?") ? url.split("?")[1].split("#")[0] : ""
        const hashParams = new URLSearchParams(hashPart)
        const queryParams = new URLSearchParams(queryPart)

        const oauthError = hashParams.get("error_description") || hashParams.get("error") || queryParams.get("error_description") || queryParams.get("error")
        const access_token = hashParams.get("access_token")
        const refresh_token = hashParams.get("refresh_token")
        const code = queryParams.get("code") || hashParams.get("code")

        await Browser.close().catch(() => {})

        if (oauthError) {
          console.error("OAuth sign-in failed:", oauthError)
          router.replace(`/login?oauth_error=${encodeURIComponent(oauthError)}`)
          return
        }

        try {
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token })
          } else if (code) {
            // Falls back to PKCE-style exchange in case the flow type ever
            // changes - the app currently runs implicit flow (hash tokens
            // above), but this keeps the listener correct either way.
            await supabase.auth.exchangeCodeForSession(code)
          } else {
            console.error("OAuth redirect had neither tokens nor an error:", url)
            router.replace("/login?oauth_error=Sign-in%20didn't%20complete.%20Please%20try%20again.")
            return
          }
          router.replace("/auth/callback")
        } catch (err) {
          console.error("OAuth session exchange failed:", err)
          router.replace("/login?oauth_error=Sign-in%20didn't%20complete.%20Please%20try%20again.")
        }
      })
      removeListener = () => { sub.remove() }
    }
    setup()

    return () => { cancelled = true; removeListener?.() }
  }, [router])

  return null
}
