"use client"

import { useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { isNativeApp } from "@/utils/platform"

/** Initializes OneSignal and keeps its logged-in user in sync with Supabase auth, native-only. Renders nothing. */
export default function PushNotificationRegister() {
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!isNativeApp()) return

    let cancelled = false

    async function init() {
      try {
        const { default: OneSignal } = await import("@onesignal/capacitor-plugin")
        const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
        if (!appId) return
        await OneSignal.initialize(appId)
        await OneSignal.Notifications.requestPermission(false)
        initializedRef.current = true

        if (cancelled) return
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user && !cancelled) await OneSignal.login(session.user.id)
      } catch { /* push unavailable — rest of the app still works fine */ }
    }
    init()

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!initializedRef.current) return
      try {
        const { default: OneSignal } = await import("@onesignal/capacitor-plugin")
        if (session?.user) await OneSignal.login(session.user.id)
        else await OneSignal.logout()
      } catch { /* push unavailable — rest of the app still works fine */ }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return null
}
