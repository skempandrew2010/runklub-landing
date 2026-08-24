"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import Link from "next/link"
import { Zap, Crown } from "lucide-react"
import { supabase } from "@/lib/supabase"
import FadeIn from "@/components/FadeIn"
import type { ClubPin } from "@/components/mapview"
import { PASSPORT_LAUNCHED } from "@/lib/passportConfig"

const MapView = dynamic(() => import("@/components/mapview"), { ssr: false })

type PassportTier = { tier: number; name: string; monthly_price_cents: number; yearly_price_cents: number; credits_per_month: number }
type PassportSub = { tier: number; billing_interval: string; current_period_end: string | null }

// Standalone intro page for members buying Passport credits, same big
// centered pitch treatment as /director/passport and /director/plans.
// Checkout is instant/self-serve via the same /api/passport/checkout route
// the compact Profile page picker already uses.
export default function PassportCreditsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [tiers, setTiers] = useState<PassportTier[]>([])
  const [sub, setSub] = useState<PassportSub | null>(null)
  const [creditBalance, setCreditBalance] = useState(0)
  const [interval, setInterval] = useState<"monthly" | "yearly">("yearly")
  const [subscribingTier, setSubscribingTier] = useState<number | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [buyQuantity, setBuyQuantity] = useState("1")
  const [buyingCredits, setBuyingCredits] = useState(false)
  const [passportClubs, setPassportClubs] = useState<ClubPin[]>([])

  useEffect(() => {
    if (!PASSPORT_LAUNCHED) router.replace("/passport")
  }, [router])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const [{ data: tiersData }, subResult, { data: clubsData }] = await Promise.all([
        supabase.from("passport_tiers").select("tier, name, monthly_price_cents, yearly_price_cents, credits_per_month").order("tier"),
        user
          ? supabase.from("passport_subscriptions").select("tier, billing_interval, current_period_end").eq("user_id", user.id).eq("status", "active").maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("clubs").select("id, name, latitude, longitude, image_url, tier").eq("passport_program_enrolled", true).eq("is_public", true).not("latitude", "is", null).not("longitude", "is", null),
      ])
      setTiers(tiersData ?? [])
      setSub(subResult.data ?? null)
      setPassportClubs((clubsData ?? []).map((c) => ({ id: c.id, name: c.name, lat: c.latitude!, lng: c.longitude!, image_url: c.image_url, tier: c.tier })))

      if (user && subResult.data) {
        const { data: batches } = await supabase
          .from("passport_credit_batches")
          .select("credits_remaining, expires_at")
          .eq("user_id", user.id)
          .eq("status", "active")
          .gt("credits_remaining", 0)
        const now = new Date()
        const balance = (batches ?? [])
          .filter((b) => new Date(b.expires_at) > now)
          .reduce((sum, b) => sum + b.credits_remaining, 0)
        setCreditBalance(balance)
      }

      setLoading(false)
    }
    load()
  }, [])

  const subscribeToTier = async (tier: number) => {
    setSubscribingTier(tier)
    if (!userId) { router.push("/login"); return }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }
      const res = await fetch("/api/passport/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ tier, interval }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error ?? "Could not start checkout")
        setSubscribingTier(null)
      }
    } catch {
      alert("Could not start checkout. Try again.")
      setSubscribingTier(null)
    }
  }

  const buyExtraCredits = async () => {
    const qty = parseInt(buyQuantity, 10)
    if (!Number.isInteger(qty) || qty < 1) return
    setBuyingCredits(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }
      const res = await fetch("/api/passport/buy-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ credits: qty }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error ?? "Could not start checkout")
        setBuyingCredits(false)
      }
    } catch {
      alert("Could not start checkout. Try again.")
      setBuyingCredits(false)
    }
  }

  const managePassportBilling = async () => {
    setOpeningPortal(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push("/login"); return }
    const res = await fetch("/api/stripe/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ returnPath: "/passport/credits" }),
    })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      alert(data.error ?? "Could not open billing portal")
      setOpeningPortal(false)
    }
  }

  if (loading || !PASSPORT_LAUNCHED) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-10">

        {/* Find Passport klubs near you — uses your location to center the
            map (handled inside MapView); pins are klubs enrolled in the
            payout program, tap one to see the klub. */}
        <FadeIn className="mb-12">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-black text-white">Find Passport Klubs Near You</h2>
            <Link href="/explore?passport=1" className="text-xs font-bold text-[#c5f135] hover:text-[#d4fb4d] transition shrink-0">
              Full map search →
            </Link>
          </div>
          <div className="rounded-2xl overflow-hidden border border-[#2e3d1a]" style={{ height: 360 }}>
            <MapView city="" runs={[]} clubs={passportClubs} />
          </div>
        </FadeIn>

        {/* Hero pitch — same scale/animation as /director/passport and /director/plans */}
        <FadeIn className="text-center mb-12">
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-3">RunKlub Passport</p>
          <h1 className="text-5xl sm:text-6xl font-black leading-tight tracking-tight text-white mb-5">
            One pass, every klub.
          </h1>
          <p className="text-white/50 text-base sm:text-lg leading-relaxed max-w-xl mx-auto mb-4">
            Passport is a monthly credit subscription. Spend your credits checking into any participating klub&apos;s runs, even ones you don&apos;t belong to. It&apos;s perfect for travel, exploring new crews, or just mixing up your training.
          </p>
          <p className="text-white/50 text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
            Credits land in your account every month and stay usable for 45 days. Cancel anytime, no contract.
          </p>
        </FadeIn>

        {sub ? (
          <FadeIn className="text-center">
            <div className="inline-flex flex-col items-center gap-4 bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl px-8 py-8 max-w-sm mx-auto">
              <div className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/30">
                <Crown className="w-4 h-4 text-[#c5f135]" />
                <span className="text-sm font-black text-[#c5f135]">
                  {tiers.find((t) => t.tier === sub.tier)?.name ?? `Tier ${sub.tier}`} · {sub.billing_interval === "yearly" ? "Yearly" : "Monthly"}
                </span>
              </div>
              <p className="text-2xl font-black text-white">{creditBalance} <span className="text-sm font-bold text-white/40">credits available</span></p>

              {creditBalance === 0 && (
                <div className="w-full pt-4 border-t border-[#2e3d1a]">
                  <p className="text-xs text-white/50 mb-3">Out of credits for this cycle? Buy more anytime at $6.00/credit — no cap.</p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <input
                      type="number"
                      min="1"
                      value={buyQuantity}
                      onChange={(e) => setBuyQuantity(e.target.value)}
                      className="w-16 bg-[#1a2110] border border-[#2e3d1a] rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-[#c5f135]/50"
                    />
                    <span className="text-xs text-white/40">
                      credits · ${((Number.isFinite(parseInt(buyQuantity, 10)) ? parseInt(buyQuantity, 10) : 0) * 6).toFixed(2)}
                    </span>
                    <button
                      onClick={buyExtraCredits}
                      disabled={buyingCredits}
                      className="px-4 py-1.5 rounded-full bg-[#c5f135] text-[#1a2110] text-xs font-black hover:bg-[#d4fb4d] transition disabled:opacity-50"
                    >
                      {buyingCredits ? "…" : "Buy Credits"}
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={managePassportBilling}
                disabled={openingPortal}
                className="text-sm font-bold text-white/40 hover:text-white/70 transition disabled:opacity-40"
              >
                {openingPortal ? "…" : "Manage billing"}
              </button>
            </div>
          </FadeIn>
        ) : (
          <>
            <FadeIn className="flex justify-center mb-8">
              <div className="inline-flex bg-[#1e2d12] border border-[#2e3d1a] rounded-full p-1">
                {(["monthly", "yearly"] as const).map((iv) => (
                  <button
                    key={iv}
                    onClick={() => setInterval(iv)}
                    className={`relative px-4 py-2 rounded-full text-xs font-bold transition capitalize ${
                      interval === iv ? "bg-[#c5f135] text-[#1a2110]" : "text-white/50 hover:text-white"
                    }`}
                  >
                    {iv}
                    {iv === "yearly" && (
                      <span className={`absolute -top-2.5 -right-2 text-[8px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                        interval === "yearly" ? "bg-white text-[#1a2110]" : "bg-[#c5f135] text-[#1a2110]"
                      }`}>
                        SAVE 10%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {tiers.map((t, i) => {
                const effectiveMonthly = t.yearly_price_cents / 12
                const badge = t.tier === 2 ? "POPULAR" : t.tier === 4 ? "BEST FOR TRAVEL" : null
                const highlighted = badge !== null
                return (
                  <FadeIn key={t.tier} delay={i * 80}>
                    <div className={`rounded-2xl p-8 flex flex-col items-center h-full text-center ${highlighted ? "bg-[#1a2d0a] border border-[#c5f135]/35" : "bg-[#1e2d12] border border-[#2e3d1a]"}`}>
                      <div className={`text-[9px] font-black px-2 py-0.5 rounded-full whitespace-nowrap mb-3 ${badge ? "bg-[#c5f135] text-[#1a2110]" : "invisible"}`}>{badge ?? "placeholder"}</div>
                      <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${highlighted ? "text-[#c5f135]/70" : "text-white/30"}`}>{t.name}</p>
                      {interval === "yearly" ? (
                        <>
                          <p className="text-sm text-white/30 line-through">${(t.monthly_price_cents / 100).toFixed(2)}/mo</p>
                          <p className="text-4xl font-black text-white">${(effectiveMonthly / 100).toFixed(2)}</p>
                          <p className="text-sm text-white/30 mb-5">/mo, billed ${(t.yearly_price_cents / 100).toFixed(0)}/yr</p>
                        </>
                      ) : (
                        <>
                          <p className="text-4xl font-black text-white">${(t.monthly_price_cents / 100).toFixed(0)}</p>
                          <p className="text-sm text-white/30 mb-5">per month</p>
                        </>
                      )}
                      <p className="text-base text-white/55 flex-1 flex items-center justify-center gap-1.5">
                        <Zap className="w-4 h-4 text-[#c5f135]" />
                        {t.credits_per_month} credits every month
                      </p>
                      <button
                        onClick={() => subscribeToTier(t.tier)}
                        disabled={subscribingTier === t.tier}
                        className="mt-6 w-full py-3.5 rounded-full bg-[#c5f135] text-[#1a2110] text-sm font-black hover:bg-[#d4fb4d] transition disabled:opacity-50"
                      >
                        {subscribingTier === t.tier ? "Redirecting…" : `Buy ${t.credits_per_month} Credits`}
                      </button>
                    </div>
                  </FadeIn>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
