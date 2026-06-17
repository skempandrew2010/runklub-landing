"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function WelcomePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const clubId = searchParams.get("club_id")
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const activated = useRef(false)

  useEffect(() => {
    const activate = async (accessToken: string) => {
      if (activated.current) return
      activated.current = true

      if (!clubId) {
        router.push("/")
        return
      }

      const res = await fetch("/api/claim/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ club_id: clubId }),
      })

      if (res.ok) {
        setStatus("success")
        setTimeout(() => router.push(`/clubs/${clubId}`), 2500)
      } else {
        const json = await res.json().catch(() => ({}))
        setErrorMsg(json.error ?? "Something went wrong.")
        setStatus("error")
      }
    }

    // Listen for Supabase to process the magic link hash and sign the user in
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.access_token) {
        activate(session.access_token)
      }
    })

    // Also check if already signed in (page reload after magic link processed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token && !activated.current) {
        activate(session.access_token)
      }
    })

    return () => subscription.unsubscribe()
  }, [clubId, router])

  return (
    <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-5">
      <div className="max-w-sm w-full text-center space-y-6">
        {/* Logo */}
        <div>
          <span className="text-2xl font-black text-white">Run</span>
          <span className="text-2xl font-black text-[#c5f135]">Klub</span>
        </div>

        {status === "loading" && (
          <>
            <div className="w-10 h-10 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin mx-auto" />
            <p className="text-white/60 text-sm">Setting up your club&hellip;</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-14 h-14 rounded-full bg-[#c5f135] flex items-center justify-center mx-auto">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a2110" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-white font-black text-xl mb-2">You&rsquo;re all set!</p>
              <p className="text-white/50 text-sm">Your club is linked. Taking you there now&hellip;</p>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div>
              <p className="text-white font-black text-xl mb-2">Something went wrong</p>
              <p className="text-white/50 text-sm mb-4">{errorMsg || "We couldn’t link your club. Please reply to your approval email and we’ll sort it out."}</p>
              <a href="/" className="text-[#c5f135] text-sm font-bold hover:underline">Go to RunKlub</a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
