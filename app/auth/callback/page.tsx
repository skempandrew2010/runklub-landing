"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    let settled = false

    const finish = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (settled) return
      settled = true

      if (!session) {
        router.replace("/login")
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, onboarding_complete")
        .eq("id", session.user.id)
        .single()

      // First-time Google sign-in — pull their real name from the provider
      // instead of leaving it at the email-prefix default from handle_new_user().
      if (!profile?.onboarding_complete) {
        const googleName = session.user.user_metadata?.full_name || session.user.user_metadata?.name
        if (googleName) {
          await supabase.from("profiles").update({ display_name: googleName }).eq("id", session.user.id)
        }
      }

      if (profile?.role === "admin") {
        router.replace("/admin/claims")
      } else {
        router.replace(profile?.onboarding_complete ? "/today" : "/onboarding")
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") finish()
    })

    // Fallback in case the session/exchange already resolved before we subscribed
    const fallback = setTimeout(finish, 1500)

    return () => { subscription.unsubscribe(); clearTimeout(fallback) }
  }, [router])

  return (
    <div className="relative min-h-screen bg-[#111a0a] flex flex-col items-center justify-center" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <p className="text-white/40 text-sm">Signing you in…</p>
    </div>
  )
}
