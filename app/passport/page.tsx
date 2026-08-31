"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MapPin, Calendar, Home, ChevronDown, ChevronRight, Check, Gift } from "lucide-react"
import { supabase } from "@/lib/supabase"
import PassportWaitlist from "@/components/PassportWaitlist"
import ModalPortal from "@/components/ModalPortal"
import { hasPassportAccess } from "@/lib/passportConfig"
import { US_STATES, US_STATE_GRID_ROWS } from "@/lib/usStates"

type VisitedClub = {
  club_id: string
  club_name: string
  club_image_url: string | null
  total_redemptions: number
  last_visit_at: string
  total_credits_spent: number
}

type PartnerClub = { id: string; name: string; image_url: string | null; city: string | null }

type StateBadge = { state: string; redemption_count: number; first_earned_at: string }

type Offer = {
  id: string
  club_id: string
  offer_type: string
  title: string
  description: string | null
  credit_cost: number
  redemption_limit_per_runner: number | null
  total_redemption_cap: number | null
  total_redemption_count: number
}

const OFFER_TYPE_LABELS: Record<string, string> = {
  standard_session: "Session check-in",
  race_kickback: "Race entry kickback",
  special_session: "Special session",
  gear_discount: "Gear discount",
  other: "Offer",
}

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

function ClubAvatar({ name, imageUrl, className = "w-11 h-11" }: { name: string; imageUrl: string | null; className?: string }) {
  return (
    <div className={`${className} rounded-full overflow-hidden shrink-0 bg-[#2e3d1a] flex items-center justify-center`}>
      {imageUrl ? <img src={imageUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-black text-[#c5f135]">{initialsOf(name)}</span>}
    </div>
  )
}

export default function PassportPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  const [creditBalance, setCreditBalance] = useState(0)
  const [renewalDate, setRenewalDate] = useState<string | null>(null)
  const [homeClubName, setHomeClubName] = useState<string | null>(null)

  const [visitedClubs, setVisitedClubs] = useState<VisitedClub[]>([])
  const [stateBadges, setStateBadges] = useState<Record<string, StateBadge>>({})
  const [partnerClubs, setPartnerClubs] = useState<PartnerClub[]>([])
  const [offersByClub, setOffersByClub] = useState<Record<string, Offer[]>>({})
  const [expandedClubId, setExpandedClubId] = useState<string | null>(null)

  const [redeemTarget, setRedeemTarget] = useState<{ offer: Offer; club: PartnerClub } | null>(null)
  const [externalReference, setExternalReference] = useState("")
  const [redeeming, setRedeeming] = useState(false)
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { router.push("/login"); return }
      if (!hasPassportAccess(user.email)) { setLoading(false); return }
      setHasAccess(true)
      setUserId(user.id)
      setSessionToken(session.access_token)

      const { data: sub } = await supabase
        .from("passport_subscriptions")
        .select("current_period_end")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle()
      if (!sub) { router.replace("/passport/credits"); return }
      setRenewalDate(sub.current_period_end)

      const [{ data: batches }, { data: profile }, { data: history }, { data: clubs }, { data: badges }] = await Promise.all([
        supabase.from("passport_credit_batches").select("credits_remaining, expires_at").eq("user_id", user.id).eq("status", "active").gt("credits_remaining", 0),
        supabase.from("profiles").select("home_club_id, clubs:home_club_id(name)").eq("id", user.id).maybeSingle(),
        supabase.from("runner_club_history").select("*").eq("user_id", user.id).order("last_visit_at", { ascending: false }),
        supabase.from("clubs").select("id, name, image_url, city").eq("passport_program_enrolled", true).order("name"),
        supabase.from("passport_runner_state_badges").select("state, redemption_count, first_earned_at").eq("user_id", user.id),
      ])

      const now = new Date()
      setCreditBalance((batches ?? []).filter((b) => new Date(b.expires_at) > now).reduce((sum, b) => sum + b.credits_remaining, 0))
      setHomeClubName((profile?.clubs as unknown as { name: string } | null)?.name ?? null)
      setVisitedClubs((history as VisitedClub[]) ?? [])
      setStateBadges(Object.fromEntries(((badges as StateBadge[]) ?? []).map((b) => [b.state, b])))

      const clubRows = (clubs as PartnerClub[]) ?? []
      setPartnerClubs(clubRows)

      if (clubRows.length > 0) {
        const { data: offers } = await supabase
          .from("club_active_offers")
          .select("id, club_id, offer_type, title, description, credit_cost, redemption_limit_per_runner, total_redemption_cap, total_redemption_count")
          .in("club_id", clubRows.map((c) => c.id))
        const grouped: Record<string, Offer[]> = {}
        for (const offer of (offers as Offer[]) ?? []) {
          (grouped[offer.club_id] ??= []).push(offer)
        }
        setOffersByClub(grouped)
      }

      setLoading(false)
    }
    load()
  }, [router])

  const openRedeem = (offer: Offer, club: PartnerClub) => {
    setRedeemError(null)
    setRedeemSuccess(null)
    setExternalReference("")
    setRedeemTarget({ offer, club })
  }

  const confirmRedeem = async () => {
    if (!redeemTarget || !sessionToken) return
    const { offer } = redeemTarget
    setRedeeming(true)
    setRedeemError(null)
    try {
      const res = await fetch("/api/passport/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({
          offer_id: offer.id,
          external_reference: externalReference.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setRedeemError(json.error ?? "Could not redeem this offer."); return }

      setCreditBalance((prev) => prev - json.creditsSpent)
      setRedeemSuccess(`Redeemed at ${json.clubName}!`)
      setTimeout(() => setRedeemTarget(null), 1400)
    } catch {
      setRedeemError("Could not redeem this offer. Try again.")
    } finally {
      setRedeeming(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (!hasAccess) return <PassportWaitlist />

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">

        {/* ── STATUS HEADER ── */}
        <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Passport</p>
          <p className="text-3xl font-black text-white leading-none">{creditBalance} <span className="text-base font-bold text-white/40">credit{creditBalance === 1 ? "" : "s"}</span></p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-[#2e3d1a]">
            {renewalDate && (
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                <Calendar className="w-3.5 h-3.5 text-[#c5f135]/70" />
                Renews {new Date(renewalDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            {homeClubName && (
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                <Home className="w-3.5 h-3.5 text-[#c5f135]/70" />
                {homeClubName}
              </span>
            )}
            <Link href="/passport/credits" className="text-xs font-bold text-[#c5f135] hover:underline ml-auto">
              Buy more credits
            </Link>
          </div>
        </div>

        {/* ── CLUBS YOU'VE VISITED ── */}
        {visitedClubs.length > 0 && (
          <div>
            <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest px-1 mb-2">Clubs You&apos;ve Visited</h2>
            <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
              {visitedClubs.map((v) => (
                <Link key={v.club_id} href={`/clubs/${v.club_id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#2e3d1a]/40 transition">
                  <ClubAvatar name={v.club_name} imageUrl={v.club_image_url} className="w-10 h-10" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{v.club_name}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {v.total_redemptions} visit{v.total_redemptions === 1 ? "" : "s"} · {v.total_credits_spent} credits spent · last {new Date(v.last_visit_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── DISCOVER PARTNER CLUBS ── */}
        <div>
          <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest px-1 mb-2">Discover Partner Clubs</h2>
          {partnerClubs.length === 0 ? (
            <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-8 text-center">
              <p className="text-white/40 text-sm">No partner klubs yet - check back soon.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {partnerClubs.map((club) => {
                const expanded = expandedClubId === club.id
                const offers = offersByClub[club.id] ?? []
                return (
                  <div key={club.id} className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setExpandedClubId(expanded ? null : club.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                    >
                      <ClubAvatar name={club.name} imageUrl={club.image_url} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{club.name}</p>
                        {club.city && (
                          <p className="text-xs text-white/40 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3 shrink-0" />{club.city}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-white/30 shrink-0">{offers.length} offer{offers.length === 1 ? "" : "s"}</span>
                      <ChevronDown className={`w-4 h-4 text-white/30 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                    {expanded && (
                      <div className="border-t border-[#2e3d1a] px-4 py-3 space-y-2">
                        {offers.length === 0 ? (
                          <p className="text-xs text-white/30 py-2">No active offers right now.</p>
                        ) : (
                          offers.map((offer) => {
                            const capped = offer.total_redemption_cap != null && offer.total_redemption_count >= offer.total_redemption_cap
                            const isStandardSession = offer.offer_type === "standard_session"
                            return (
                              <button
                                key={offer.id}
                                onClick={() => {
                                  if (isStandardSession) router.push(`/clubs/${club.id}`)
                                  else if (!capped) openRedeem(offer, club)
                                }}
                                disabled={!isStandardSession && capped}
                                className="w-full flex items-center gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-left hover:border-[#c5f135]/30 transition disabled:opacity-40"
                              >
                                <div className="w-8 h-8 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0">
                                  <Gift className="w-3.5 h-3.5 text-[#c5f135]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-white truncate">{offer.title}</p>
                                  <p className="text-xs text-white/40 mt-0.5 truncate">
                                    {isStandardSession
                                      ? "RSVP to one of their runs to redeem"
                                      : OFFER_TYPE_LABELS[offer.offer_type] ?? offer.offer_type}
                                    {!isStandardSession && offer.description && ` · ${offer.description}`}
                                  </p>
                                </div>
                                <span className="text-xs font-black text-[#c5f135] shrink-0">
                                  {isStandardSession ? `${offer.credit_cost} cr` : capped ? "Full" : `${offer.credit_cost} cr`}
                                </span>
                              </button>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── STATE BADGES ── */}
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest">State Badges</h2>
            <span className="text-xs font-bold text-[#c5f135]">{Object.keys(stateBadges).length}/{US_STATES.length}</span>
          </div>
          <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
            <p className="text-xs text-white/40 mb-3">
              Earn a state&apos;s badge by redeeming credits at a partner klub there.
            </p>
            <div className="overflow-x-auto rk-scroll -mx-1 px-1">
              <div
                className="grid grid-flow-col gap-2 w-max"
                style={{ gridTemplateRows: `repeat(${US_STATE_GRID_ROWS}, minmax(0, 1fr))` }}
              >
                {US_STATES.map((s) => {
                  const earned = stateBadges[s.code]
                  return (
                    <div
                      key={s.code}
                      title={earned ? `${s.name} - ${earned.redemption_count} check-in${earned.redemption_count === 1 ? "" : "s"}` : `${s.name} - not yet earned`}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-black transition shrink-0 ${
                        earned
                          ? "bg-[#c5f135]/15 border border-[#c5f135]/40 text-[#c5f135]"
                          : "bg-[#1a2110] border border-[#2e3d1a] text-white/20"
                      }`}
                    >
                      {s.code}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── REDEMPTION CONFIRM SHEET ── */}
      {redeemTarget && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => !redeeming && setRedeemTarget(null)}
          >
            <div
              className="w-full sm:max-w-sm bg-[#1e2d12] border border-[#2e3d1a] rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 animate-[fadeUp_0.25s_ease-out_forwards]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <ClubAvatar name={redeemTarget.club.name} imageUrl={redeemTarget.club.image_url} />
                <div className="min-w-0">
                  <p className="text-sm font-black text-white truncate">{redeemTarget.offer.title}</p>
                  <p className="text-xs text-white/40 truncate">{redeemTarget.club.name}</p>
                </div>
              </div>

              {redeemTarget.offer.description && (
                <p className="text-sm text-white/60 leading-relaxed mb-4">{redeemTarget.offer.description}</p>
              )}

              <div className="mb-4">
                <label className="text-xs font-bold text-white/50 block mb-1.5">Confirmation code (optional)</label>
                <input
                  value={externalReference}
                  onChange={(e) => setExternalReference(e.target.value)}
                  placeholder="e.g. race registration number"
                  className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#c5f135]/50 transition"
                />
              </div>

              <div className="flex items-center justify-between mb-4 px-1">
                <span className="text-xs text-white/50">Credit cost</span>
                <span className="text-sm font-black text-[#c5f135]">{redeemTarget.offer.credit_cost} credit{redeemTarget.offer.credit_cost === 1 ? "" : "s"}</span>
              </div>

              {redeemError && <p className="text-xs text-red-400 mb-3">{redeemError}</p>}
              {redeemSuccess && (
                <p className="flex items-center gap-1.5 text-sm font-bold text-[#c5f135] mb-3">
                  <Check className="w-4 h-4" /> {redeemSuccess}
                </p>
              )}

              {!redeemSuccess && (
                creditBalance < redeemTarget.offer.credit_cost ? (
                  <Link
                    href="/passport/credits"
                    className="block w-full text-center py-3 rounded-2xl text-sm font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition"
                  >
                    Not enough credits - buy more
                  </Link>
                ) : (
                  <button
                    onClick={confirmRedeem}
                    disabled={redeeming}
                    className="w-full py-3 rounded-2xl text-sm font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition disabled:opacity-50"
                  >
                    {redeeming ? "…" : `Redeem for ${redeemTarget.offer.credit_cost} credit${redeemTarget.offer.credit_cost === 1 ? "" : "s"}`}
                  </button>
                )
              )}
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
