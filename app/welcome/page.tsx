"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Mode = "loading" | "claim" | "signing_in" | "activating" | "success" | "error"

export default function WelcomePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const claimToken = searchParams.get("t")       // invite link token (/welcome?t=xxx)
  const [mode, setMode] = useState<Mode>("loading")
  const [clubName, setClubName] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const activated = useRef(false)

  // ── Mode A: claim token in URL (/welcome?t=xxx) ───────────────────────────
  // Show a "Sign in to claim" button. The magic link is generated only when
  // the user actually clicks — not at email-send time — so email scanners
  // can't burn the one-time Supabase OTP.
  useEffect(() => {
    if (!claimToken) return
    fetch(`/api/claim-lookup/${claimToken}`)
      .then(r => r.json())
      .then(data => {
        if (data.error === "used") {
          setErrorMsg("This club has already been claimed.")
          setMode("error")
          return
        }
        if (!data.club) {
          setErrorMsg("This invite link is invalid or has expired.")
          setMode("error")
          return
        }
        setClubName(data.club.name)
        setMode("claim")
      })
      .catch(() => {
        setErrorMsg("Could not load club info. Try again.")
        setMode("error")
      })
  }, [claimToken])

  const handleSignIn = async () => {
    setMode("signing_in")
    try {
      const res = await fetch("/api/claim/generate-magic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: claimToken }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErrorMsg(json.error ?? "Could not generate sign-in link.")
        setMode("error")
        return
      }
      // Hard-navigate to the Supabase magic link — it will redirect back here
      window.location.href = json.url
    } catch {
      setErrorMsg("Network error. Please try again.")
      setMode("error")
    }
  }

  // ── Mode B: post-magic-link sign-in (/welcome with auth hash) ────────────
  // Supabase redirected here after processing the magic link.
  // Detect the session and link the club to the user's account.
  useEffect(() => {
    if (claimToken) return // handled by Mode A above

    const activate = async (accessToken: string) => {
      if (activated.current) return
      activated.current = true
      setMode("activating")

      const res = await fetch("/api/claim/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      })

      if (res.ok) {
        const json = await res.json()
        setMode("success")
        setTimeout(() => router.push(json.club_id ? `/clubs/${json.club_id}` : "/explore"), 2500)
      } else {
        const json = await res.json().catch(() => ({}))
        setErrorMsg(json.error ?? "Something went wrong.")
        setMode("error")
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.access_token) {
        activate(session.access_token)
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token && !activated.current) {
        activate(session.access_token)
      }
    })

    return () => subscription.unsubscribe()
  }, [claimToken, router])

  return (
    <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-5">
      <div className="max-w-sm w-full text-center space-y-6">

        <div>
          <span className="text-2xl font-black text-white">Run</span>
          <span className="text-2xl font-black text-[#c5f135]">Klub</span>
        </div>

        {(mode === "loading" || mode === "activating") && (
          <>
            <div className="w-10 h-10 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin mx-auto" />
            <p className="text-white/60 text-sm">
              {mode === "activating" ? "Linking your club…" : "Loading…"}
            </p>
          </>
        )}

        {mode === "claim" && (
          <>
            <div>
              <p className="text-white/50 text-sm mb-1">You&rsquo;ve been invited to claim</p>
              <p className="text-white font-black text-2xl">{clubName}</p>
            </div>
            <p className="text-white/50 text-sm leading-relaxed">
              Click below to sign in and link {clubName} to your account.
              You&rsquo;ll be able to post runs and manage your club page.
            </p>
            <button
              onClick={handleSignIn}
              className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl hover:bg-[#d4ff45] transition"
            >
              Sign in to claim {clubName}
            </button>
          </>
        )}

        {mode === "signing_in" && (
          <>
            <div className="w-10 h-10 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin mx-auto" />
            <p className="text-white/60 text-sm">Preparing your sign-in link…</p>
          </>
        )}

        {mode === "success" && (
          <>
            <div className="w-14 h-14 rounded-full bg-[#c5f135] flex items-center justify-center mx-auto">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a2110" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-white font-black text-xl mb-2">You&rsquo;re all set!</p>
              <p className="text-white/50 text-sm">Your club is linked. Taking you there now…</p>
            </div>
          </>
        )}

        {mode === "error" && (
          <>
            <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div>
              <p className="text-white font-black text-xl mb-2">Something went wrong</p>
              <p className="text-white/50 text-sm mb-4">{errorMsg || "Please reply to your invite email and we'll sort it out."}</p>
              <a href="/" className="text-[#c5f135] text-sm font-bold hover:underline">Go to RunKlub</a>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
