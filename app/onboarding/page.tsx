"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { MapPin, ArrowRight, Check, ChevronRight, Trophy, Users } from "lucide-react"
import { track } from "@vercel/analytics"

// ─── Types ───────────────────────────────────────────────────────────────────
type Loc = { lat: number; lng: number }
type Role = "manager" | "member"
type Step = 0 | 1 | 2 | 3 | 4  // 0=location, 1=role, 2=profile, 3=strava, 4=finish

const TOTAL_STEPS = 5

// ─── Pace options ─────────────────────────────────────────────────────────────
const PACE_OPTIONS = [
  { key: "easy",     label: "Easy",     sub: "10+ min / mi", emoji: "🐢" },
  { key: "moderate", label: "Moderate", sub: "8–10 min / mi", emoji: "🏃" },
  { key: "fast",     label: "Fast",     sub: "7–8 min / mi",  emoji: "⚡" },
  { key: "race",     label: "Race",     sub: "< 7 min / mi",  emoji: "🔥" },
]

const RUN_TYPES = [
  { key: "road",  label: "Road",  emoji: "🏙️" },
  { key: "trail", label: "Trail", emoji: "🌲" },
  { key: "both",  label: "Both",  emoji: "🗺️" },
]

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ step }: { step: Step }) {
  return (
    <div className="flex gap-1.5 mb-8">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all duration-400 ${
            i <= step ? "bg-[#c5f135]" : "bg-white/10"
          }`}
        />
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(0)
  const [userId, setUserId] = useState<string | null>(null)

  // Step 0 — location
  const [location, setLocation] = useState<Loc | null>(null)
  const [cityInput, setCityInput] = useState("")
  const [showCityInput, setShowCityInput] = useState(false)
  const [locLoading, setLocLoading] = useState(false)

  // Step 1 — role
  const [role, setRole] = useState<Role | null>(null)

  // Step 2 — quick profile
  const [pace, setPace] = useState<string | null>(null)
  const [runType, setRunType] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return }
      setUserId(user.id)

      // Resume with whatever this account already has instead of wiping it —
      // returning users who never finished onboarding get routed back here on
      // every login, so treat existing values as the starting point, not a
      // blank slate that a stray "Continue" click could downgrade to member.
      const { data: prof } = await supabase.from("profiles")
        .select("role, pace_range, run_type, onboarding_complete")
        .eq("id", user.id)
        .single()

      if (prof?.onboarding_complete) {
        router.replace(prof.role === "manager" ? "/director" : "/today")
        return
      }

      if (prof?.role === "manager" || prof?.role === "member") setRole(prof.role)
      if (prof?.pace_range) setPace(prof.pace_range)
      if (prof?.run_type) setRunType(prof.run_type)
    })
  }, [router])

  // Track each step as users reach it — shows funnel drop-off
  const STEP_NAMES = ["location", "role", "profile", "strava", "finish"]
  useEffect(() => {
    track("onboarding_step", { step, name: STEP_NAMES[step] })
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 0 helpers ──
  const requestLocation = () => {
    setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ lat: coords.latitude, lng: coords.longitude })
        setLocLoading(false)
        advance()
      },
      () => { setLocLoading(false); setShowCityInput(true) }
    )
  }

  const submitCity = async () => {
    if (!cityInput.trim()) return
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cityInput)}.json?limit=1&access_token=${token}`)
      const json = await res.json()
      const feat = json.features?.[0]
      if (feat) setLocation({ lat: feat.center[1], lng: feat.center[0] })
    } catch {}
    advance()
  }

  // ── Save profile + finish ──
  const saveAndFinish = async () => {
    if (!userId) return
    track("onboarding_completed", { role: role ?? "member", pace: pace ?? "none", run_type: runType ?? "none" })
    await supabase.from("profiles").update({
      pace_range: pace,
      run_type: runType,
      role: role ?? "member",
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    }).eq("id", userId)
    router.push(role === "manager" ? "/director" : "/today")
  }

  // ── Advance step ──
  const advance = () => setStep((s) => Math.min(s + 1, 4) as Step)
  const back = () => setStep((s) => Math.max(0, s - 1) as Step)

  // ── Step 2: save profile then advance ──
  const saveProfile = async () => {
    if (!userId || !pace || !runType) return
    await supabase.from("profiles").update({ pace_range: pace, run_type: runType }).eq("id", userId)
    advance()
  }

  return (
    <div className="fixed inset-0 bg-[#111a0a] flex flex-col px-6 py-10 overflow-y-auto">
      <div className="w-full max-w-sm mx-auto flex flex-col min-h-full">

        {/* Back + skip row */}
        <div className="flex items-center justify-between mb-6">
          {step > 0 ? (
            <button onClick={back} className="text-white/40 hover:text-white text-sm transition flex items-center gap-1">
              ← Back
            </button>
          ) : <div />}
          {step === 3 && (
            <button onClick={advance} className="text-white/40 hover:text-white text-sm transition">
              Skip →
            </button>
          )}
        </div>

        <ProgressBar step={step} />

        {/* ═══════════════════════════════════════════════════════════════
            STEP 0 — Allow Location
        ═══════════════════════════════════════════════════════════════ */}
        {step === 0 && (
          <div className="flex flex-col flex-1 animate-[fadeUp_0.4s_ease-out]">
            <div className="mb-8">
              <div className="w-16 h-16 rounded-2xl bg-[#1e3a12] flex items-center justify-center mb-5">
                <MapPin className="w-8 h-8 text-[#c5f135]" />
              </div>
              <h1 className="text-3xl font-black text-white mb-2">Find klubs near you</h1>
              <p className="text-white/50 text-base leading-relaxed">
                We'll show you run klubs in your area. Your location is never shared.
              </p>
            </div>

            {!showCityInput ? (
              <div className="space-y-3 mt-auto">
                <button
                  onClick={requestLocation}
                  disabled={locLoading}
                  className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#d4ff45] transition disabled:opacity-60"
                >
                  {locLoading ? (
                    <><div className="w-4 h-4 border-2 border-[#1a2110]/40 border-t-[#1a2110] rounded-full animate-spin" /> Locating…</>
                  ) : (
                    <><MapPin className="w-4 h-4" /> Allow Location</>
                  )}
                </button>
                <button onClick={() => setShowCityInput(true)} className="w-full border border-white/10 text-white/50 font-semibold py-4 rounded-2xl hover:border-white/25 hover:text-white/80 transition text-sm">
                  Enter city manually
                </button>
              </div>
            ) : (
              <div className="space-y-3 mt-auto">
                <p className="text-white/60 text-sm mb-2">Enter your city</p>
                <input
                  autoFocus
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitCity()}
                  placeholder="e.g. Boulder, CO"
                  className="w-full bg-white/8 border border-white/15 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/60 transition text-base"
                />
                <button onClick={submitCity} disabled={!cityInput.trim()} className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#d4ff45] transition disabled:opacity-40">
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            STEP 1 — Role Selection
        ═══════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="flex flex-col flex-1 animate-[fadeUp_0.4s_ease-out]">
            <div className="mb-8">
              <h1 className="text-3xl font-black text-white mb-2">How are you joining?</h1>
              <p className="text-white/50 text-base leading-relaxed">
                This helps us tailor your experience.
              </p>
            </div>

            <div className="space-y-3 flex-1">
              <button
                onClick={() => setRole("manager")}
                className={`w-full rounded-2xl border p-5 text-left transition-all ${
                  role === "manager"
                    ? "bg-[#c5f135]/10 border-[#c5f135] shadow-[0_0_0_1px_#c5f135]"
                    : "bg-[#1e2d12] border-[#2e3d1a] hover:border-white/25"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    role === "manager" ? "bg-[#c5f135]/20" : "bg-[#2e3d1a]"
                  }`}>
                    <Trophy className={`w-6 h-6 ${role === "manager" ? "text-[#c5f135]" : "text-white/40"}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-black text-white">I'm a Director of a klub</p>
                    <p className="text-sm text-white/50 mt-1 leading-relaxed">
                      I run or direct a run klub and want to manage members, schedule runs, and grow my community.
                    </p>
                  </div>
                  {role === "manager" && <Check className="w-5 h-5 text-[#c5f135] shrink-0 mt-0.5" />}
                </div>
              </button>

              <button
                onClick={() => setRole("member")}
                className={`w-full rounded-2xl border p-5 text-left transition-all ${
                  role === "member"
                    ? "bg-[#c5f135]/10 border-[#c5f135] shadow-[0_0_0_1px_#c5f135]"
                    : "bg-[#1e2d12] border-[#2e3d1a] hover:border-white/25"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    role === "member" ? "bg-[#c5f135]/20" : "bg-[#2e3d1a]"
                  }`}>
                    <Users className={`w-6 h-6 ${role === "member" ? "text-[#c5f135]" : "text-white/40"}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-black text-white">I'm a Runner looking for a klub</p>
                    <p className="text-sm text-white/50 mt-1 leading-relaxed">
                      I want to find run klubs near me, join group runs, and connect with other runners.
                    </p>
                  </div>
                  {role === "member" && <Check className="w-5 h-5 text-[#c5f135] shrink-0 mt-0.5" />}
                </div>
              </button>
            </div>

            <button
              onClick={advance}
              disabled={!role}
              className="mt-6 w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#d4ff45] transition disabled:opacity-30"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            STEP 2 — Quick Profile
        ═══════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="flex flex-col flex-1 animate-[fadeUp_0.4s_ease-out]">
            <div className="mb-6">
              <h1 className="text-3xl font-black text-white mb-2">Quick profile</h1>
              <p className="text-white/50">Tap to set your running style — 2 taps max.</p>
            </div>

            <div className="space-y-5 flex-1">
              <div>
                <p className="text-xs font-bold text-white/40 tracking-widest uppercase mb-3">Pace</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {PACE_OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      onClick={() => setPace(o.key)}
                      className={`rounded-2xl p-4 text-left border transition-all ${
                        pace === o.key
                          ? "bg-[#c5f135]/10 border-[#c5f135] shadow-[0_0_0_1px_#c5f135]"
                          : "bg-[#1e2d12] border-[#2e3d1a] hover:border-white/20"
                      }`}
                    >
                      <span className="text-2xl">{o.emoji}</span>
                      <p className="text-sm font-bold text-white mt-2">{o.label}</p>
                      <p className="text-xs text-white/40 mt-0.5">{o.sub}</p>
                      {pace === o.key && <Check className="w-4 h-4 text-[#c5f135] mt-2" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-white/40 tracking-widest uppercase mb-3">Surface</p>
                <div className="grid grid-cols-3 gap-2.5">
                  {RUN_TYPES.map((o) => (
                    <button
                      key={o.key}
                      onClick={() => setRunType(o.key)}
                      className={`rounded-2xl py-4 flex flex-col items-center border transition-all ${
                        runType === o.key
                          ? "bg-[#c5f135]/10 border-[#c5f135]"
                          : "bg-[#1e2d12] border-[#2e3d1a] hover:border-white/20"
                      }`}
                    >
                      <span className="text-2xl">{o.emoji}</span>
                      <p className="text-xs font-bold text-white mt-2">{o.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={saveProfile}
              disabled={!pace || !runType}
              className="mt-6 w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#d4ff45] transition disabled:opacity-30"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            STEP 3 — Connect Strava
        ═══════════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="flex flex-col flex-1 animate-[fadeUp_0.4s_ease-out]">
            <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 text-4xl"
                style={{ background: "linear-gradient(135deg, #FC4C02, #e63e00)" }}>
                <span className="font-black text-white text-2xl">S</span>
              </div>
              <h1 className="text-3xl font-black text-white mb-3">Connect Strava</h1>
              <p className="text-white/50 text-base leading-relaxed mb-2">
                Sync your runs, track miles, and share achievements with your klub.
              </p>
              <p className="text-white/25 text-sm">Optional — you can always connect later.</p>
            </div>

            <div className="space-y-3 mt-6">
              <button
                disabled
                className="w-full font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 transition opacity-40 cursor-not-allowed text-white"
                style={{ background: "linear-gradient(135deg, #FC4C02, #e63e00)" }}
              >
                Connect Strava
                <span className="text-xs font-normal opacity-60">(coming soon)</span>
              </button>
              <button onClick={advance} className="w-full border border-white/10 text-white/50 font-semibold py-4 rounded-2xl hover:border-white/25 hover:text-white/80 transition flex items-center justify-center gap-2">
                Skip for now <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            STEP 4 — All set
        ═══════════════════════════════════════════════════════════════ */}
        {step === 4 && (
          <div className="flex flex-col flex-1 animate-[fadeUp_0.4s_ease-out]">
            <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
              <div className="w-20 h-20 rounded-2xl bg-[#c5f135]/10 flex items-center justify-center mb-6">
                <span className="text-4xl">🏃</span>
              </div>
              <h1 className="text-3xl font-black text-white mb-3">You're all set!</h1>
              <p className="text-white/50 text-base leading-relaxed">
                {role === "manager"
                  ? "Head to your Director page to create your klub and schedule your first run."
                  : "Explore klubs near you, follow your favorites, and show up to your first run."}
              </p>
            </div>

            <button
              onClick={saveAndFinish}
              className="mt-6 w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#d4ff45] transition"
            >
              {role === "manager" ? "Go to Director" : "Explore Klubs"} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
