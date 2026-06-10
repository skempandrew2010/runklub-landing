"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import Footer from "@/components/Footer"

const REFERRAL_OPTIONS = [
  "BolderBOULDER",
  "Email outreach",
  "Instagram",
  "Word of mouth",
  "Other",
]

export default function ClaimPage() {
  const [clubName, setClubName] = useState("")
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [city, setCity] = useState("")
  const [instagram, setInstagram] = useState("")
  const [website, setWebsite] = useState("")
  const [referralSource, setReferralSource] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
  const canSubmit =
    clubName.trim() && contactName.trim() && contactEmail.trim() &&
    emailValid && city.trim() && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          club_name:       clubName,
          contact_name:    contactName,
          contact_email:   contactEmail,
          city,
          instagram,
          website,
          referral_source: referralSource,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? "Something went wrong. Please try again.")
        setSubmitting(false)
        return
      }
      setDone(true)
    } catch {
      setError("Network error. Please try again.")
      setSubmitting(false)
    }
  }

  const inputClass =
    "w-full bg-white/8 border border-white/15 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/60 transition text-base"
  const labelClass = "block text-xs font-semibold text-white/50 mb-1.5"

  return (
    <div
      className="min-h-screen bg-[#111a0a] flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* ── Minimal header ── */}
      <header className="px-6 py-5 border-b border-white/8 flex items-center justify-between shrink-0">
        <Link href="/explore" className="text-xl font-black tracking-tight">
          <span className="text-white">Run</span><span className="text-[#c5f135]">Klub</span>
        </Link>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col items-center px-5 py-10">
        <div className="w-full max-w-md">

          {done ? (
            /* ── Success ── */
            <div className="text-center space-y-5 animate-[fadeUp_0.4s_ease-out_forwards]">
              <div className="w-16 h-16 rounded-3xl bg-[#c5f135]/10 border border-[#c5f135]/30 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-[#c5f135]" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white mb-2">You&apos;re on the list</h2>
                <p className="text-white/50 text-sm leading-relaxed max-w-xs mx-auto">
                  We&apos;ll be in touch within 24 hours to verify your club and get you set up on RunKlub.
                </p>
              </div>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#c5f135] text-[#1a2110] font-black text-sm rounded-full hover:bg-[#d4ff45] transition"
              >
                Explore RunKlub <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            /* ── Form ── */
            <div className="animate-[fadeUp_0.35s_ease-out_forwards]">
              <div className="mb-8">
                <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-2">
                  For directors
                </p>
                <h1 className="text-3xl font-black text-white leading-tight mb-3">
                  Claim your run club
                </h1>
                <p className="text-sm text-white/40 leading-relaxed">
                  Get your club on the map, post runs, and connect with members — all in one place.
                </p>
              </div>

              <div className="space-y-4">

                {/* Club Name */}
                <div>
                  <label className={labelClass}>
                    Club Name <span className="text-red-400/70">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Boulder Trail Runners"
                    value={clubName}
                    onChange={(e) => setClubName(e.target.value)}
                    className={inputClass}
                    autoFocus
                  />
                </div>

                {/* Your Name */}
                <div>
                  <label className={labelClass}>
                    Your Name <span className="text-red-400/70">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="First and last name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className={inputClass}
                  />
                </div>

                {/* Email */}
                <div>
                  <label className={labelClass}>
                    Your Email <span className="text-red-400/70">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className={inputClass}
                  />
                  {contactEmail && !emailValid && (
                    <p className="text-red-400/70 text-xs mt-1.5 px-1">
                      Enter a valid email address.
                    </p>
                  )}
                </div>

                {/* City */}
                <div>
                  <label className={labelClass}>
                    City <span className="text-red-400/70">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Boulder, CO"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={inputClass}
                  />
                </div>

                {/* Instagram */}
                <div>
                  <label className={labelClass}>
                    Instagram Handle{" "}
                    <span className="text-white/25 font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none select-none">
                      @
                    </span>
                    <input
                      type="text"
                      placeholder="yourclub"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value.replace(/^@/, ""))}
                      className={inputClass + " pl-9"}
                    />
                  </div>
                </div>

                {/* Website */}
                <div>
                  <label className={labelClass}>
                    Website{" "}
                    <span className="text-white/25 font-normal">(optional)</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://yourclub.com"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className={inputClass}
                  />
                </div>

                {/* Referral */}
                <div>
                  <label className={labelClass}>
                    How did you hear about RunKlub?{" "}
                    <span className="text-white/25 font-normal">(optional)</span>
                  </label>
                  <select
                    value={referralSource}
                    onChange={(e) => setReferralSource(e.target.value)}
                    className={inputClass + " appearance-none cursor-pointer"}
                  >
                    <option value="" className="bg-[#1a2110]">Select one…</option>
                    {REFERRAL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="bg-[#1a2110]">
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {error && (
                  <p className="text-red-400 text-sm px-1">{error}</p>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#d4ff45] transition disabled:opacity-40 mt-2"
                >
                  {submitting
                    ? "Submitting…"
                    : <><span>Submit Claim</span><ArrowRight className="w-4 h-4" /></>
                  }
                </button>

                <p className="text-center text-xs text-white/25 leading-relaxed pt-1">
                  Already have an account?{" "}
                  <Link
                    href="/login"
                    className="text-white/40 hover:text-white/60 transition underline underline-offset-2"
                  >
                    Log in
                  </Link>
                </p>

              </div>
            </div>
          )}

        </div>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <Footer />
    </div>
  )
}
