"use client"

import { useState } from "react"
import { Crown, Check } from "lucide-react"
import { supabase } from "@/lib/supabase"
import FadeIn from "@/components/FadeIn"

// Passport isn't open yet -- there are no Passport-enrolled klubs for
// credits to actually redeem at. Shown in place of the real feature until
// there's real supply to match the demand; self-hosted so it doesn't depend
// on any external waitlist tool being set up.
export default function PassportWaitlist() {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")

  const join = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setSubmitting(true)
    setError("")
    const { data: { user } } = await supabase.auth.getUser()
    const { error: insertError } = await supabase
      .from("passport_waitlist")
      .insert({ email: trimmed, user_id: user?.id ?? null })
    if (insertError && !insertError.message.includes("duplicate")) {
      setError("Couldn't join the waitlist. Try again.")
      setSubmitting(false)
      return
    }
    setSubmitted(true)
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-6">
      <FadeIn className="text-center max-w-md">
        <div className="w-14 h-14 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/30 flex items-center justify-center mx-auto mb-5">
          <Crown className="w-6 h-6 text-[#c5f135]" />
        </div>
        <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-3">RunKlub Passport</p>
        <h1 className="text-3xl sm:text-4xl font-black leading-tight text-white mb-4">
          Coming soon.
        </h1>
        <p className="text-white/50 text-base leading-relaxed mb-8">
          We&apos;re lining up klubs to join the Passport network before opening credits up for purchase. Leave your email and we&apos;ll let you know the moment it&apos;s ready.
        </p>

        {submitted ? (
          <div className="flex items-center justify-center gap-2 text-[#c5f135] font-bold text-sm">
            <Check className="w-4 h-4" /> You&apos;re on the list.
          </div>
        ) : (
          <form onSubmit={join} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 bg-[#1e2d12] border border-[#2e3d1a] rounded-full px-5 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/50"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 bg-[#c5f135] text-[#1a2110] font-black rounded-full text-sm hover:bg-[#d4fb4d] transition disabled:opacity-50 shrink-0"
            >
              {submitting ? "…" : "Join Waitlist"}
            </button>
          </form>
        )}
        {error && <p className="text-red-300 text-xs mt-3">{error}</p>}
      </FadeIn>
    </div>
  )
}
