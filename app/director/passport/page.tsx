"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Crown, CreditCard, DollarSign, Plus, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Card, SectionTitle, Button, Input, TextArea } from "@/app/admin/club-model/manager/ui"
import FadeIn from "@/components/FadeIn"
import { Select } from "@/components/Select"

type ClubOption = {
  id: string
  name: string
  stripe_connect_account_id: string | null
  stripe_connect_payouts_enabled: boolean
  passport_program_enrolled: boolean
  passport_default_credit_value: number
  passport_default_checkin_limit: number | null
  passport_monthly_checkin_limit_per_user: number | null
  passport_monthly_checkin_limit_total: number | null
}

type PassportStats = {
  checkinCount: number
  totalPayoutCents: number
  recentCheckins: { checkinId: string; displayName: string; creditsSpent: number; payoutCents: number; checkedInAt: string }[]
}

type Offer = {
  id: string
  offer_type: string
  title: string
  description: string | null
  credit_cost: number
  is_active: boolean
  requires_physical_checkin: boolean
  redemption_limit_per_runner: number | null
  total_redemption_cap: number | null
}

const OFFER_TYPES: { value: string; label: string }[] = [
  { value: "standard_session", label: "Standard session check-in" },
  { value: "race_kickback", label: "Race entry kickback" },
  { value: "special_session", label: "One-off special session" },
  { value: "gear_discount", label: "Gear discount" },
  { value: "other", label: "Other" },
]

const emptyOfferDraft = {
  offer_type: "special_session",
  title: "",
  description: "",
  credit_cost: "3",
  requires_physical_checkin: true,
  redemption_limit_per_runner: "",
  total_redemption_cap: "",
}

const CREDIT_VALUES = [1, 2, 3, 4, 5, 6] as const
function payoutForCreditValue(value: number) { return 300 + value * 50 }

// Standalone top-level page (own nav tab, sibling to /director) rather than
// a tab inside the club management dashboard (app/director/page.tsx) --
// deliberately separate so enrolling in the Passport payout program never
// implies or requires touching club management tools, and vice versa.
// Owner-only: unlike /director/analytics, there's no coach-facing branch
// here since Passport enrollment is a billing decision for the klub owner.
export default function DirectorPassportPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [clubs, setClubs] = useState<ClubOption[]>([])
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [monthlyLimit, setMonthlyLimit] = useState("")
  const [monthlyLimitTotal, setMonthlyLimitTotal] = useState("")
  const [defaultCheckinLimit, setDefaultCheckinLimit] = useState("")
  const [savingEnrollment, setSavingEnrollment] = useState(false)
  const [savingCreditValue, setSavingCreditValue] = useState<number | null>(null)
  const [savingMonthlyLimit, setSavingMonthlyLimit] = useState(false)
  const [savingMonthlyLimitTotal, setSavingMonthlyLimitTotal] = useState(false)
  const [savingDefaultCheckinLimit, setSavingDefaultCheckinLimit] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [stats, setStats] = useState<PassportStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [offers, setOffers] = useState<Offer[]>([])
  const [offersLoading, setOffersLoading] = useState(false)
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [offerDraft, setOfferDraft] = useState(emptyOfferDraft)
  const [savingOffer, setSavingOffer] = useState(false)
  const [offerError, setOfferError] = useState<string | null>(null)
  const [togglingOfferId, setTogglingOfferId] = useState<string | null>(null)
  const [deletingOfferId, setDeletingOfferId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }
      const { data: myClubs } = await supabase
        .from("clubs")
        .select("id, name, stripe_connect_account_id, stripe_connect_payouts_enabled, passport_program_enrolled, passport_default_credit_value, passport_default_checkin_limit, passport_monthly_checkin_limit_per_user, passport_monthly_checkin_limit_total")
        .eq("user_id", user.id)
        .order("name")

      if (!myClubs || myClubs.length === 0) { router.replace("/director"); return }
      setClubs(myClubs as ClubOption[])
      setSelectedClubId(myClubs[0].id)
      setLoading(false)
    }
    load()
  }, [router])

  useEffect(() => {
    const club = clubs.find((c) => c.id === selectedClubId)
    setMonthlyLimit(club?.passport_monthly_checkin_limit_per_user != null ? String(club.passport_monthly_checkin_limit_per_user) : "")
    setMonthlyLimitTotal(club?.passport_monthly_checkin_limit_total != null ? String(club.passport_monthly_checkin_limit_total) : "")
    setDefaultCheckinLimit(club?.passport_default_checkin_limit != null ? String(club.passport_default_checkin_limit) : "")
  }, [selectedClubId, clubs])

  useEffect(() => {
    const club = clubs.find((c) => c.id === selectedClubId)
    if (!club?.passport_program_enrolled) { setStats(null); return }
    const loadStats = async () => {
      setStatsLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setStatsLoading(false); return }
      const res = await fetch(`/api/director/analytics?club_id=${selectedClubId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (res.ok) setStats(json.passportCheckins ?? null)
      setStatsLoading(false)
    }
    loadStats()
  }, [selectedClubId, clubs])

  const loadOffers = async () => {
    if (!selectedClubId) return
    setOffersLoading(true)
    // Directors see their own inactive/draft offers too (passport_offers_select_club_owner),
    // not just the publicly-active ones - order newest first.
    const { data } = await supabase
      .from("passport_offers")
      .select("id, offer_type, title, description, credit_cost, is_active, requires_physical_checkin, redemption_limit_per_runner, total_redemption_cap")
      .eq("club_id", selectedClubId)
      .order("created_at", { ascending: false })
    setOffers((data as Offer[]) ?? [])
    setOffersLoading(false)
  }

  useEffect(() => {
    const club = clubs.find((c) => c.id === selectedClubId)
    if (!club?.passport_program_enrolled) { setOffers([]); return }
    loadOffers()
    setShowOfferForm(false)
    setOfferDraft(emptyOfferDraft)
    setOfferError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClubId, clubs])

  const createOffer = async () => {
    if (!selectedClubId) return
    setOfferError(null)
    const creditCost = parseInt(offerDraft.credit_cost, 10)
    if (!offerDraft.title.trim() || !Number.isFinite(creditCost) || creditCost < 1) {
      setOfferError("Give the offer a title and a credit cost of at least 1.")
      return
    }
    const perRunnerTrimmed = offerDraft.redemption_limit_per_runner.trim()
    const totalTrimmed = offerDraft.total_redemption_cap.trim()
    const perRunner = perRunnerTrimmed === "" ? null : parseInt(perRunnerTrimmed, 10)
    const total = totalTrimmed === "" ? null : parseInt(totalTrimmed, 10)
    if ((perRunner !== null && (!Number.isFinite(perRunner) || perRunner < 1)) || (total !== null && (!Number.isFinite(total) || total < 1))) {
      setOfferError("Redemption caps must be blank or a whole number of at least 1.")
      return
    }

    setSavingOffer(true)
    const { error } = await supabase.from("passport_offers").insert({
      club_id: selectedClubId,
      offer_type: offerDraft.offer_type,
      title: offerDraft.title.trim(),
      description: offerDraft.description.trim() || null,
      credit_cost: creditCost,
      requires_physical_checkin: offerDraft.requires_physical_checkin,
      redemption_limit_per_runner: perRunner,
      total_redemption_cap: total,
    })
    setSavingOffer(false)
    if (error) {
      // The one-active-standard_session-per-klub unique index is the most
      // likely real-world hit here.
      setOfferError(error.message.includes("passport_offers_one_active_standard_session")
        ? "This klub already has an active standard session offer - deactivate it first."
        : error.message)
      return
    }
    setShowOfferForm(false)
    setOfferDraft(emptyOfferDraft)
    loadOffers()
  }

  const toggleOfferActive = async (offer: Offer) => {
    setTogglingOfferId(offer.id)
    const { error } = await supabase.from("passport_offers").update({ is_active: !offer.is_active }).eq("id", offer.id)
    if (!error) setOffers((prev) => prev.map((o) => o.id === offer.id ? { ...o, is_active: !o.is_active } : o))
    setTogglingOfferId(null)
  }

  const deleteOffer = async (offerId: string) => {
    setDeletingOfferId(offerId)
    const { error } = await supabase.from("passport_offers").delete().eq("id", offerId)
    if (!error) setOffers((prev) => prev.filter((o) => o.id !== offerId))
    setDeletingOfferId(null)
  }

  const selectedClub = clubs.find((c) => c.id === selectedClubId)

  const setEnrolled = async (enroll: boolean) => {
    if (!selectedClubId) return
    setSavingEnrollment(true)
    const { error } = await supabase.from("clubs").update({ passport_program_enrolled: enroll }).eq("id", selectedClubId)
    if (!error) {
      setClubs((prev) => prev.map((c) => c.id === selectedClubId ? { ...c, passport_program_enrolled: enroll } : c))
    }
    setSavingEnrollment(false)
  }

  const saveDefaultCreditValue = async (value: number) => {
    if (!selectedClubId) return
    setSavingCreditValue(value)
    const { error } = await supabase.from("clubs").update({ passport_default_credit_value: value }).eq("id", selectedClubId)
    if (!error) {
      setClubs((prev) => prev.map((c) => c.id === selectedClubId ? { ...c, passport_default_credit_value: value } : c))
    }
    setSavingCreditValue(null)
  }

  const saveMonthlyLimit = async () => {
    if (!selectedClubId) return
    const trimmed = monthlyLimit.trim()
    const value = trimmed === "" ? null : parseInt(trimmed, 10)
    if (value !== null && (!Number.isFinite(value) || value < 1)) return
    setSavingMonthlyLimit(true)
    const { error } = await supabase.from("clubs").update({ passport_monthly_checkin_limit_per_user: value }).eq("id", selectedClubId)
    if (!error) {
      setClubs((prev) => prev.map((c) => c.id === selectedClubId ? { ...c, passport_monthly_checkin_limit_per_user: value } : c))
    }
    setSavingMonthlyLimit(false)
  }

  const saveMonthlyLimitTotal = async () => {
    if (!selectedClubId) return
    const trimmed = monthlyLimitTotal.trim()
    const value = trimmed === "" ? null : parseInt(trimmed, 10)
    if (value !== null && (!Number.isFinite(value) || value < 1)) return
    setSavingMonthlyLimitTotal(true)
    const { error } = await supabase.from("clubs").update({ passport_monthly_checkin_limit_total: value }).eq("id", selectedClubId)
    if (!error) {
      setClubs((prev) => prev.map((c) => c.id === selectedClubId ? { ...c, passport_monthly_checkin_limit_total: value } : c))
    }
    setSavingMonthlyLimitTotal(false)
  }

  const saveDefaultCheckinLimit = async () => {
    if (!selectedClubId) return
    const trimmed = defaultCheckinLimit.trim()
    const value = trimmed === "" ? null : parseInt(trimmed, 10)
    if (value !== null && (!Number.isFinite(value) || value < 1)) return
    setSavingDefaultCheckinLimit(true)
    const { error } = await supabase.from("clubs").update({ passport_default_checkin_limit: value }).eq("id", selectedClubId)
    if (!error) {
      setClubs((prev) => prev.map((c) => c.id === selectedClubId ? { ...c, passport_default_checkin_limit: value } : c))
    }
    setSavingDefaultCheckinLimit(false)
  }

  const startStripeConnect = async () => {
    if (!selectedClubId) return
    setConnecting(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setConnecting(false); return }
    const res = await fetch("/api/director/connect/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ clubId: selectedClubId }),
    })
    const json = await res.json()
    if (res.ok && json.url) {
      window.location.href = json.url
    } else {
      alert(json.error ?? "Couldn't start Stripe onboarding.")
      setConnecting(false)
    }
  }

  if (loading || !selectedClub) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 sm:px-6 py-10">

        {clubs.length > 1 && (
          <div className="flex justify-end mb-4">
            <Select
              value={selectedClubId ?? ""}
              onChange={(e) => setSelectedClubId(e.target.value)}
              className="bg-[#1e2d12] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c5f135]/50"
            >
              {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        )}

        {/* Hero pitch - same scale/animation as the home page's Passport sections */}
        <FadeIn className="text-center">
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-3">Passport Payout Program</p>
          <h1 className="text-3xl sm:text-4xl font-black leading-tight text-white mb-5">
            Get paid every time<br />a runner checks in.
          </h1>
          {!selectedClub.passport_program_enrolled && (
            <>
              <p className="text-white/50 text-base sm:text-lg leading-relaxed max-w-xl mx-auto mb-4">
                RunKlub Passport is a monthly credit subscription runners buy directly from RunKlub. It&apos;s built specifically for paid training klubs: once you&apos;re enrolled, any Passport subscriber can check into <span className="text-white font-semibold">{selectedClub.name}</span>&apos;s runs even if they&apos;ve never joined as a paying member. You get paid automatically for every check-in.
              </p>
              <p className="text-white/50 text-base sm:text-lg leading-relaxed max-w-xl mx-auto mb-8">
                It&apos;s completely separate from your klub&apos;s own membership tools and dues. Enrolling here changes nothing about how you run your klub day-to-day, and you can leave anytime. No contract, no effect on your existing members.
              </p>
            </>
          )}

          {selectedClub.passport_program_enrolled ? (
            <div className="flex flex-wrap items-center justify-center gap-4">
              <div className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/30">
                <Crown className="w-4 h-4 text-[#c5f135]" />
                <span className="text-sm font-black text-[#c5f135]">You&apos;re enrolled</span>
              </div>
              <button
                onClick={() => setEnrolled(false)}
                disabled={savingEnrollment}
                className="text-sm font-bold text-white/40 hover:text-white/70 transition disabled:opacity-40"
              >
                {savingEnrollment ? "…" : "Leave program"}
              </button>
            </div>
          ) : (
            <div>
              <a
                href="https://calendly.com/runklubinfo/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-8 py-4 bg-[#c5f135] text-[#1a2110] font-black rounded-full text-lg hover:bg-[#d4fb4d] transition"
              >
                Book a Discovery Call
              </a>
              <p className="text-white/30 text-xs mt-3">We vet every klub on a quick call before enrolling them in the payout program.</p>
            </div>
          )}
        </FadeIn>

        {selectedClub.passport_program_enrolled && (
          <div className="space-y-6 mt-12 pt-10 border-t border-[#2e3d1a]">
            <FadeIn>
              <Card>
                <SectionTitle>Payout Destination</SectionTitle>
                {!selectedClub.stripe_connect_account_id ? (
                  <>
                    <p className="text-xs text-white/80 mb-3">Connect a Stripe account so we can pay you for Passport check-ins. This can be the same account you&apos;d use for klub membership payments, or a fresh one if you don&apos;t charge your own members.</p>
                    <Button onClick={startStripeConnect} disabled={connecting}>
                      {connecting ? "…" : "Connect with Stripe"}
                    </Button>
                  </>
                ) : !selectedClub.stripe_connect_payouts_enabled ? (
                  <>
                    <p className="text-xs text-white/80 mb-3">Stripe onboarding isn&apos;t finished yet, so payouts can&apos;t go out until it is.</p>
                    <Button onClick={startStripeConnect} disabled={connecting}>
                      {connecting ? "…" : "Continue Stripe setup"}
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[#1a2110] border border-[#2e3d1a]">
                    <CreditCard className="w-4 h-4 text-[#c5f135] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">Stripe Connected</p>
                      <p className="text-xs text-white/80 mt-0.5">Payouts land here automatically after each check-in.</p>
                    </div>
                  </div>
                )}
              </Card>
            </FadeIn>

            <FadeIn delay={80}>
              <Card>
                <SectionTitle>Default Session Credit Value</SectionTitle>
                <p className="text-xs text-white/80 mb-3">
                  Seeds the credit cost the first time your klub enrolls - after that, the actual price a runner pays to check into a run lives on your Standard Session offer below, which you can edit any time. Higher values earn you a bigger payout, in $0.50 steps from $3.50 (1 credit) to $6.00 (6 credits).
                </p>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {CREDIT_VALUES.map((v) => (
                    <button
                      key={v}
                      onClick={() => saveDefaultCreditValue(v)}
                      disabled={savingCreditValue !== null}
                      className={`w-10 h-10 rounded-xl text-sm font-black transition disabled:opacity-50 ${
                        selectedClub.passport_default_credit_value === v
                          ? "bg-[#c5f135] text-[#1a2110]"
                          : "bg-[#1a2110] text-white/60 border border-[#2e3d1a] hover:border-[#c5f135]/40"
                      }`}
                    >
                      {savingCreditValue === v ? "…" : v}
                    </button>
                  ))}
                </div>
                <span className="inline-block text-xs font-black px-2.5 py-1 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30">
                  {selectedClub.passport_default_credit_value} credit{selectedClub.passport_default_credit_value === 1 ? "" : "s"} · ${(payoutForCreditValue(selectedClub.passport_default_credit_value) / 100).toFixed(2)} payout
                </span>
              </Card>
            </FadeIn>

            <FadeIn delay={120}>
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <SectionTitle>Offers</SectionTitle>
                  {!showOfferForm && (
                    <Button variant="ghost" onClick={() => setShowOfferForm(true)}>
                      <span className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add offer</span>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-white/80 mb-3">
                  What Passport subscribers can redeem credits for at your klub - a run check-in, a race-entry kickback, a one-off session, gear discounts, whatever you want to offer. Every redemption pays out the same way: $3.50 at 1 credit up to $6.00 at 6+, based on the offer&apos;s credit cost.
                </p>

                {showOfferForm && (
                  <div className="bg-[#1a2110] border border-[#2e3d1a] rounded-xl p-3 mb-3 space-y-2.5">
                    <Select
                      value={offerDraft.offer_type}
                      onChange={(e) => setOfferDraft((d) => ({ ...d, offer_type: e.target.value }))}
                    >
                      {OFFER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>
                    <Input
                      placeholder="Title (e.g. Sunday Long Run)"
                      value={offerDraft.title}
                      onChange={(e) => setOfferDraft((d) => ({ ...d, title: e.target.value }))}
                    />
                    <TextArea
                      placeholder="Description (optional)"
                      rows={2}
                      value={offerDraft.description}
                      onChange={(e) => setOfferDraft((d) => ({ ...d, description: e.target.value }))}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        type="number" min="1" step="1"
                        value={offerDraft.credit_cost}
                        onChange={(e) => setOfferDraft((d) => ({ ...d, credit_cost: e.target.value }))}
                        className="max-w-[100px]"
                      />
                      <span className="text-xs text-white/50">credits</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        type="number" min="1" step="1"
                        placeholder="Unlimited"
                        value={offerDraft.redemption_limit_per_runner}
                        onChange={(e) => setOfferDraft((d) => ({ ...d, redemption_limit_per_runner: e.target.value }))}
                        className="max-w-[110px]"
                      />
                      <span className="text-xs text-white/50">redemptions per runner, ever</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        type="number" min="1" step="1"
                        placeholder="Unlimited"
                        value={offerDraft.total_redemption_cap}
                        onChange={(e) => setOfferDraft((d) => ({ ...d, total_redemption_cap: e.target.value }))}
                        className="max-w-[110px]"
                      />
                      <span className="text-xs text-white/50">total redemptions across everyone</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOfferDraft((d) => ({ ...d, requires_physical_checkin: !d.requires_physical_checkin }))}
                      className="flex items-center gap-2 text-xs text-white/70"
                    >
                      <span className={`w-4 h-4 rounded flex items-center justify-center border ${offerDraft.requires_physical_checkin ? "bg-[#c5f135] border-[#c5f135] text-[#1a2110]" : "border-white/30"}`}>
                        {offerDraft.requires_physical_checkin ? "✓" : ""}
                      </span>
                      Requires being physically at the klub to redeem (GPS check-in)
                    </button>
                    {offerError && <p className="text-xs text-red-400">{offerError}</p>}
                    <div className="flex items-center gap-2 pt-1">
                      <Button onClick={createOffer} disabled={savingOffer}>{savingOffer ? "…" : "Create offer"}</Button>
                      <Button variant="ghost" onClick={() => { setShowOfferForm(false); setOfferError(null) }}>Cancel</Button>
                    </div>
                  </div>
                )}

                {offersLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
                  </div>
                ) : offers.length === 0 ? (
                  <p className="text-xs text-white/40">No offers yet.</p>
                ) : (
                  <div className="space-y-2">
                    {offers.map((offer) => (
                      <div key={offer.id} className="flex items-center gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-white truncate">{offer.title}</p>
                            {!offer.is_active && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white/10 text-white/40">INACTIVE</span>
                            )}
                          </div>
                          <p className="text-xs text-white/40 mt-0.5">
                            {OFFER_TYPES.find((t) => t.value === offer.offer_type)?.label ?? offer.offer_type} · {offer.credit_cost} credit{offer.credit_cost === 1 ? "" : "s"}
                            {!offer.requires_physical_checkin && " · no check-in required"}
                          </p>
                        </div>
                        <button
                          onClick={() => toggleOfferActive(offer)}
                          disabled={togglingOfferId === offer.id}
                          className="text-xs font-bold text-white/40 hover:text-white/70 transition shrink-0 disabled:opacity-40"
                        >
                          {togglingOfferId === offer.id ? "…" : offer.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => deleteOffer(offer.id)}
                          disabled={deletingOfferId === offer.id}
                          className="text-white/30 hover:text-red-400 transition shrink-0 disabled:opacity-40"
                          aria-label="Delete offer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </FadeIn>

            <FadeIn delay={160}>
              <Card>
                <SectionTitle>Check-in Limits</SectionTitle>
                <p className="text-xs text-white/80 mb-3">
                  Cap how many times any single Passport subscriber can check in at your klub each month. Leave it blank for unlimited.
                </p>
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={monthlyLimit}
                    onChange={(e) => setMonthlyLimit(e.target.value)}
                    placeholder="Unlimited"
                    className="max-w-[140px]"
                  />
                  <span className="text-xs text-white/50">check-ins per runner per month</span>
                  <Button onClick={saveMonthlyLimit} disabled={savingMonthlyLimit}>{savingMonthlyLimit ? "…" : "Save"}</Button>
                </div>

                <p className="text-xs text-white/80 mb-3">
                  Cap the total number of Passport check-ins your klub will accept across every runner, all month. Leave it blank for unlimited.
                </p>
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={monthlyLimitTotal}
                    onChange={(e) => setMonthlyLimitTotal(e.target.value)}
                    placeholder="Unlimited"
                    className="max-w-[140px]"
                  />
                  <span className="text-xs text-white/50">total check-ins per month</span>
                  <Button onClick={saveMonthlyLimitTotal} disabled={savingMonthlyLimitTotal}>{savingMonthlyLimitTotal ? "…" : "Save"}</Button>
                </div>

                <p className="text-xs text-white/80 mb-3">
                  Default cap on how many Passport runners are allowed into any single run, unless you set a different limit on that specific run when you create or edit it. Once a cap is hit, that run just shows as full to Passport runners - no waitlist. Leave it blank for unlimited.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={defaultCheckinLimit}
                    onChange={(e) => setDefaultCheckinLimit(e.target.value)}
                    placeholder="Unlimited"
                    className="max-w-[140px]"
                  />
                  <span className="text-xs text-white/50">Passport check-ins per run, by default</span>
                  <Button onClick={saveDefaultCheckinLimit} disabled={savingDefaultCheckinLimit}>{savingDefaultCheckinLimit ? "…" : "Save"}</Button>
                </div>
              </Card>
            </FadeIn>

            <FadeIn delay={240}>
              <Card>
                <SectionTitle>Passport Check-ins</SectionTitle>
                <p className="text-xs text-white/80 mb-3">Runners from other klubs redeeming Passport credits at your klub.</p>
                {statsLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="w-5 h-5 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                        <p className="text-lg font-black text-white">{stats?.checkinCount ?? 0}</p>
                        <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Check-ins</p>
                      </div>
                      <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                        <p className="text-lg font-black text-[#c5f135]">${((stats?.totalPayoutCents ?? 0) / 100).toFixed(2)}</p>
                        <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Payouts earned</p>
                      </div>
                    </div>
                    {stats && stats.recentCheckins.length > 0 && (
                      <div className="space-y-1.5">
                        {stats.recentCheckins.map((c) => (
                          <div key={c.checkinId} className="flex items-center gap-2 text-xs">
                            <DollarSign className="w-3 h-3 text-[#c5f135]/60 shrink-0" />
                            <span className="text-white/70">{c.displayName}</span>
                            <span className="text-white/30">
                              {c.creditsSpent} credits · ${(c.payoutCents / 100).toFixed(2)} · {new Date(c.checkedInAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Card>
            </FadeIn>
          </div>
        )}
      </div>
    </div>
  )
}
