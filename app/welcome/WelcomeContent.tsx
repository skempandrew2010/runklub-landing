"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Mode = "loading" | "email_form" | "email_sent" | "activating" | "pending" | "success" | "error"

export default function WelcomeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const claimToken = searchParams.get("t")

  const [mode, setMode] = useState<Mode>("loading")
  const [clubName, setClubName] = useState("")
  const [email, setEmail] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const activated = useRef(false)

  const activate = async (accessToken: string) => {
    if (activated.current) return
    activated.current = true
    setMode("activating")

    const res = await fetch("/api/claim/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(claimToken ? { claim_token: claimToken } : {}),
    })

    if (res.ok) {
      const json = await res.json()
      if (json.pending) {
        setMode("pending")
      } else {
        setMode("success")
        setTimeout(() => router.push(json.club_id ? `/clubs/${json.club_id}` : "/explore"), 2500)
      }
    } else {
      const json = await res.json().catch(() => ({}))
      setErrorMsg(json.error ?? "Something went wrong.")
      setMode("error")
    }
  }

  useEffect(() => {
    // If already signed in (returning from magic link click), activate immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        activate(session.access_token)
        return
      }

      // Not signed in — need claim token to show the form
      if (!claimToken) {
        setErrorMsg("No invite token found. Please use the link from your email.")
        setMode("error")
        return
      }

      fetch(`/api/claim-lookup/${claimToken}`)
        .then(r => r.json())
        .then(data => {
          if (data.error === "used") { setErrorMsg("This club has already been claimed."); setMode("error"); return }
          if (!data.club) { setErrorMsg("This invite link is invalid or has expired."); setMode("error"); return }
          setClubName(data.club.name)
          setMode("email_form")
        })
        .catch(() => { setErrorMsg("Could not load club info. Please try again."); setMode("error") })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.access_token) {
        activate(session.access_token)
      }
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    const redirectTo = claimToken
      ? `${window.location.origin}/welcome?t=${claimToken}`
      : `${window.location.origin}/welcome`

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    })

    if (error) { setErrorMsg(error.message); setMode("error"); return }
    setMode("email_sent")
  }

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
            <p className="text-white/60 text-sm">{mode === "activating" ? "Linking your club…" : "Loading…"}</p>
          </>
        )}

        {mode === "email_form" && (
          <>
            <div>
              <p className="text-white/50 text-sm mb-1">You&rsquo;ve been invited to claim</p>
              <p className="text-white font-black text-2xl">{clubName}</p>
            </div>
            <form onSubmit={handleSendLink} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-semibold text-white/50 mb-1.5">Your email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="w-full bg-white/8 border border-white/15 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/60 transition"
                />
              </div>
              <button
                type="submit"
                disabled={!email.trim()}
                className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl hover:bg-[#d4ff45] transition disabled:opacity-40"
              >
                Send me a sign-in link
              </button>
            </form>
          </>
        )}

        {mode === "email_sent" && (
          <>
            <div className="w-14 h-14 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/30 flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c5f135" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-black text-xl mb-2">Check your inbox</p>
              <p className="text-white/50 text-sm leading-relaxed">
                We sent a sign-in link to <span className="text-white font-semibold">{email}</span>.
                Click it and your club will be linked automatically.
              </p>
            </div>
            <button onClick={() => setMode("email_form")} className="text-white/40 text-sm hover:text-white/60 transition underline underline-offset-2">
              Use a different email
            </button>
          </>
        )}

        {mode === "pending" && (
          <>
            <div className="w-14 h-14 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/30 flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c5f135" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-black text-xl mb-2">Claim submitted!</p>
              <p className="text-white/50 text-sm leading-relaxed">
                {clubName ? `Your claim for ${clubName} is pending review.` : "Your claim is pending review."}
                {" "}We&rsquo;ll approve it and link your club shortly.
              </p>
            </div>
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
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div>
              <p className="text-white font-black text-xl mb-2">Something went wrong</p>
              <p className="text-white/50 text-sm mb-4">{errorMsg}</p>
              <a href="/" className="text-[#c5f135] text-sm font-bold hover:underline">Go to RunKlub</a>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
