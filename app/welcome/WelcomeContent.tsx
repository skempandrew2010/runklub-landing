"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Mode = "loading" | "claim_form" | "activating" | "pending" | "success" | "error"

export default function WelcomeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const claimToken = searchParams.get("t")

  const [mode, setMode] = useState<Mode>("loading")
  const [clubName, setClubName] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const activated = useRef(false)

  // Called when user is already signed in:
  // - With claimToken: create pending claim with their user_id
  // - Without claimToken: post-approval magic link path → link club directly
  const activate = async (accessToken: string, contactName?: string) => {
    if (activated.current) return
    activated.current = true
    setMode("activating")

    const body: Record<string, string> = {}
    if (claimToken) body.claim_token = claimToken
    if (contactName) body.contact_name = contactName

    const res = await fetch("/api/claim/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        activate(session.access_token)
        return
      }

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
          setMode("claim_form")
        })
        .catch(() => { setErrorMsg("Could not load club info. Please try again."); setMode("error") })
    })

    // Handles magic link sign-in from approval email
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.access_token) {
        activate(session.access_token)
      }
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password || !claimToken) return
    setSubmitting(true)

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedName = name.trim()

    // Try signing up first; fall back to sign-in if account already exists
    let accessToken: string | undefined

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: { data: { full_name: trimmedName } },
    })

    if (!signUpError) {
      accessToken = signUpData.session?.access_token
      if (!accessToken) {
        // Email confirmation required — rare for this app config
        setErrorMsg("Check your email to confirm your account, then try again.")
        setMode("error")
        setSubmitting(false)
        return
      }
    } else if (signUpError.message.toLowerCase().includes("already registered") ||
               signUpError.message.toLowerCase().includes("already been registered")) {
      // Account exists — sign in with the provided password
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      })
      if (signInError) {
        setErrorMsg("An account with this email already exists. Check your password and try again.")
        setSubmitting(false)
        return
      }
      accessToken = signInData.session?.access_token
    } else {
      setErrorMsg(signUpError.message)
      setSubmitting(false)
      return
    }

    if (!accessToken) {
      setErrorMsg("Could not create session. Please try again.")
      setSubmitting(false)
      return
    }

    await activate(accessToken, trimmedName)
    setSubmitting(false)
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

        {mode === "claim_form" && (
          <>
            <div>
              <p className="text-white/50 text-sm mb-1">You&rsquo;ve been invited to claim</p>
              <p className="text-white font-black text-2xl">{clubName}</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-semibold text-white/50 mb-1.5">Your name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  autoFocus
                  className="w-full bg-white/8 border border-white/15 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/60 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/50 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full bg-white/8 border border-white/15 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/60 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/50 mb-1.5">Create a password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                  className="w-full bg-white/8 border border-white/15 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/60 transition"
                />
              </div>
              <button
                type="submit"
                disabled={!name.trim() || !email.trim() || password.length < 6 || submitting}
                className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl hover:bg-[#d4ff45] transition disabled:opacity-40"
              >
                {submitting ? "Submitting…" : "Claim my club"}
              </button>
            </form>
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
                {" "}We&rsquo;ll email you once it&rsquo;s approved — usually within 24 hours.
              </p>
            </div>
            <a
              href="/explore"
              className="block w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl hover:bg-[#d4ff45] transition text-center"
            >
              Browse RunKlub
            </a>
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
