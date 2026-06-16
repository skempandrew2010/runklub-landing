"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowRight, Check, MapPin } from "lucide-react"

type ClubInfo = {
  id: string
  name: string
  city: string | null
  instagram_handle: string | null
}

export default function ClaimTokenPage() {
  const { token } = useParams<{ token: string }>()

  const [club, setClub] = useState<ClubInfo | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "invalid" | "used">("loading")

  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  // Look up the club by token
  useEffect(() => {
    if (!token) { setLoadState("invalid"); return }
    fetch(`/api/claim-lookup/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error === "used") { setLoadState("used"); return }
        if (!data.club) { setLoadState("invalid"); return }
        setClub(data.club)
        setLoadState("ready")
      })
      .catch(() => setLoadState("invalid"))
  }, [token])

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
  const canSubmit = contactName.trim() && contactEmail.trim() && emailValid && !submitting

  const handleSubmit = async () => {
    if (!canSubmit || !club) return
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch(`/api/claim-lookup/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_name:  contactName.trim(),
          contact_email: contactEmail.trim(),
          message:       message.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
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
      {/* Header */}
      <header className="px-6 py-5 border-b border-white/8 shrink-0">
        <Link href="/explore" className="text-xl font-black tracking-tight">
          <span className="text-white">Run</span><span className="text-[#c5f135]">Klub</span>
        </Link>
      </header>

      <div className="flex-1 flex flex-col items-center px-5 py-10">
        <div className="w-full max-w-md">

          {/* Loading */}
          {loadState === "loading" && (
            <div className="flex flex-col items-center gap-3 pt-10">
              <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
              <p className="text-white/40 text-sm">Loading your club…</p>
            </div>
          )}

          {/* Invalid token */}
          {loadState === "invalid" && (
            <div className="text-center space-y-4 pt-6">
              <p className="text-4xl">🔗</p>
              <h2 className="text-xl font-black text-white">Link not found</h2>
              <p className="text-white/40 text-sm leading-relaxed">
                This invite link is invalid or has expired. Reach out to us if you think this is a mistake.
              </p>
              <Link href="/explore" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#c5f135] text-[#1a2110] font-black text-sm rounded-full hover:bg-[#d4ff45] transition">
                Explore RunKlub <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {/* Already claimed */}
          {loadState === "used" && (
            <div className="text-center space-y-4 pt-6">
              <p className="text-4xl">✅</p>
              <h2 className="text-xl font-black text-white">Already claimed</h2>
              <p className="text-white/40 text-sm leading-relaxed">
                This club has already been claimed. If that wasn&apos;t you, contact us.
              </p>
              <Link href="/explore" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#c5f135] text-[#1a2110] font-black text-sm rounded-full hover:bg-[#d4ff45] transition">
                Explore RunKlub <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {/* Success */}
          {loadState === "ready" && done && (
            <div className="text-center space-y-5 animate-[fadeUp_0.4s_ease-out_forwards]">
              <div className="w-16 h-16 rounded-3xl bg-[#c5f135]/10 border border-[#c5f135]/30 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-[#c5f135]" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white mb-2">Claim submitted!</h2>
                <p className="text-white/50 text-sm leading-relaxed max-w-xs mx-auto">
                  We&apos;ll review and be in touch within 24 hours to get you set up on RunKlub.
                </p>
              </div>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#c5f135] text-[#1a2110] font-black text-sm rounded-full hover:bg-[#d4ff45] transition"
              >
                Explore RunKlub <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {/* Form */}
          {loadState === "ready" && !done && club && (
            <div className="animate-[fadeUp_0.35s_ease-out_forwards]">

              {/* Club card */}
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5 mb-8">
                <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">Your club</p>
                <h1 className="text-2xl font-black text-white leading-tight">{club.name}</h1>
                {club.city && (
                  <p className="text-sm text-white/40 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" />{club.city}
                  </p>
                )}
              </div>

              <div className="mb-6">
                <h2 className="text-xl font-black text-white mb-2">Claim your club</h2>
                <p className="text-sm text-white/40 leading-relaxed">
                  Confirm your details and we&apos;ll set you up as the director so you can post runs and manage your page.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Your Name <span className="text-red-400/70">*</span></label>
                  <input
                    type="text"
                    placeholder="First and last name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className={inputClass}
                    autoFocus
                  />
                </div>

                <div>
                  <label className={labelClass}>Your Email <span className="text-red-400/70">*</span></label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className={inputClass}
                  />
                  {contactEmail && !emailValid && (
                    <p className="text-red-400/70 text-xs mt-1.5 px-1">Enter a valid email address.</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Anything we should know? <span className="text-white/25 font-normal">(optional)</span></label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="e.g. I'm the founder, our website is…"
                    rows={3}
                    className={inputClass + " resize-none"}
                  />
                </div>

                {error && <p className="text-red-400 text-sm px-1">{error}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#d4ff45] transition disabled:opacity-40 mt-2"
                >
                  {submitting
                    ? "Submitting…"
                    : <><span>Claim {club.name}</span><ArrowRight className="w-4 h-4" /></>
                  }
                </button>

                <p className="text-center text-xs text-white/25 pt-1">
                  Already have an account?{" "}
                  <Link href="/login" className="text-white/40 hover:text-white/60 transition underline underline-offset-2">
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
    </div>
  )
}
