"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarCheck, MapPin, Crown, DollarSign, PartyPopper, TrendingDown, Mail, Users } from "lucide-react"
import { supabase } from "@/lib/supabase"
import CoachAnalyticsView from "@/components/CoachAnalyticsView"
import KlubContextPicker from "@/components/KlubContextPicker"

type ClubOption = { id: string; name: string }

type AnalyticsData = {
  memberCount: number
  audience: { followerCount: number; paidMemberCount: number }
  membershipRevenue: {
    totalCents: number
    plans: { id: string; name: string; priceCents: number; billingInterval: string }[]
    members: { userId: string; displayName: string; avatarUrl: string | null; joinedAt: string; priceCents: number | null; billingInterval: string; planName: string | null }[]
  }
  recentWorkouts: {
    checkinId: string
    userId: string
    displayName: string
    avatarUrl: string | null
    runId: string
    runTitle: string
    runDate: string | null
    checkedInAt: string
  }[]
  crossClubCheckins: {
    userId: string
    displayName: string
    otherClubId: string
    otherClubName: string
    checkinCount: number
    firstCheckinAt: string
  }[]
  passportCheckins: {
    checkinCount: number
    totalPayoutCents: number
    recentCheckins: { checkinId: string; userId: string; displayName: string; creditsSpent: number; payoutCents: number; checkedInAt: string }[]
  }
  rsvpVsCheckin: {
    totalRsvps: number
    totalCheckins: number
    rate: number | null
    recentRuns: { runId: string; title: string; date: string; rsvpCount: number; checkinCount: number }[]
  }
  retention: { active: number; atRisk: number; churned: number }
  emailEngagement: {
    totalSent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    complained: number
    openRate: number | null
    clickRate: number | null
  }
}

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-xs font-bold text-white uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function DirectorAnalyticsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [clubs, setClubs] = useState<ClubOption[]>([])
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState("")
  const [mode, setMode] = useState<"director" | "coach" | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [hasDirectorClub, setHasDirectorClub] = useState(false)
  const [isCoachReal, setIsCoachReal] = useState(false)
  const [directorClubName, setDirectorClubName] = useState<string | null>(null)
  const [coachClubName, setCoachClubName] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }
      setUserId(user.id)
      const [{ data: prof }, { data: myClubs }, { data: coachRows }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).single(),
        supabase.from("clubs").select("id, name").eq("user_id", user.id).order("name"),
        supabase.from("coaches").select("club_id, accepted_at, clubs(id, name)").eq("user_id", user.id).eq("status", "active").order("accepted_at", { ascending: false }),
      ])

      const ownedClubs = myClubs ?? []
      const coachClubs = ((coachRows ?? []) as any[]).filter((r) => r.clubs)
      const ownsClub = ownedClubs.length > 0
      const coachEligible = coachClubs.length > 0
      setHasDirectorClub(ownsClub)
      setIsCoachReal(coachEligible)
      setDirectorClubName(ownedClubs[0]?.name ?? null)
      setCoachClubName(coachClubs[0]?.clubs?.name ?? null)
      setClubs(ownedClubs)

      // Someone who's both a director and an invited coach elsewhere needs
      // to pick which klub they mean, same as the /director tab — leave
      // `mode` unset so the picker renders. Single-role accounts (including
      // a manager profile with no klub of their own yet) skip straight to
      // their one option.
      if (ownsClub && coachEligible) {
        setLoading(false)
        return
      }

      if (coachEligible) {
        setMode("coach")
        setLoading(false)
        return
      }

      if (ownsClub || prof?.role === "manager") {
        setMode("director")
        setSelectedClubId(ownedClubs[0]?.id ?? null)
        setLoading(false)
        return
      }

      router.replace("/")
    }
    load()
  }, [router])

  useEffect(() => {
    if (!selectedClubId) return
    const load = async () => {
      setDataLoading(true)
      setError("")
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/director/analytics?club_id=${selectedClubId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Something went wrong."); setData(null) }
      else setData(json)
      setDataLoading(false)
    }
    load()
  }, [selectedClubId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  const dualRole = hasDirectorClub && isCoachReal

  if (dualRole && mode === null) {
    return (
      <KlubContextPicker
        eyebrow="Analytics"
        title="Whose analytics do you want to see?"
        hasDirectorClub={hasDirectorClub}
        directorClubName={directorClubName}
        coachClubName={coachClubName}
        onPick={(context) => {
          if (context === "coach") { setMode("coach"); return }
          setSelectedClubId((prev) => prev ?? clubs[0]?.id ?? null)
          setMode("director")
        }}
      />
    )
  }

  const switchLink = dualRole && (
    <button
      onClick={() => setMode(null)}
      className="fixed top-[calc(var(--safe-top)+8px)] right-3 z-50 px-3 py-1.5 rounded-full bg-[#1e2d12] border border-[#2e3d1a] text-[10px] font-bold text-white/50 hover:text-[#c5f135] hover:border-[#c5f135]/40 transition"
    >
      Switch klub
    </button>
  )

  if (mode === "coach") {
    return (
      <>
        {switchLink}
        <CoachAnalyticsView userId={userId!} />
      </>
    )
  }

  if (clubs.length === 0) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <p className="text-white font-bold text-lg mb-1">No klubs yet</p>
          <p className="text-white/40 text-sm">Create your first run klub to see analytics here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      {switchLink}
      <div className="max-w-2xl mx-auto px-5 py-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="text-xl font-black text-white">Analytics</h1>
          {clubs.length > 1 && (
            <select
              value={selectedClubId ?? ""}
              onChange={(e) => setSelectedClubId(e.target.value)}
              className="bg-[#1e2d12] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c5f135]/50"
            >
              {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {dataLoading || !data ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-xl px-3 py-3 text-center">
                <p className="text-xl font-black text-white">{data.audience.followerCount}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Followers</p>
              </div>
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-xl px-3 py-3 text-center">
                <p className="text-xl font-black text-[#c5f135]">{data.audience.paidMemberCount}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Paid Members</p>
              </div>
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-xl px-3 py-3 text-center">
                <p className="text-xl font-black text-[#c5f135]">${(data.membershipRevenue.totalCents / 100).toFixed(2)}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Membership /mo</p>
              </div>
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-xl px-3 py-3 text-center">
                <p className="text-xl font-black text-white">${(data.passportCheckins.totalPayoutCents / 100).toFixed(2)}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Passport Payouts</p>
              </div>
            </div>

            <Card title="Membership Revenue by Member" icon={<Users className="w-3.5 h-3.5 text-[#c5f135]" />}>
              <p className="text-xs text-white/35 mb-3 -mt-1">
                {data.membershipRevenue.plans.length > 0
                  ? data.membershipRevenue.plans.map((p) => `${p.name} $${(p.priceCents / 100).toFixed(2)}${p.billingInterval === "yearly" ? "/yr" : p.billingInterval === "seasonal" ? " one-time" : "/mo"}`).join(" · ")
                  : "No membership plans set"}
              </p>
              {data.membershipRevenue.members.length === 0 ? (
                <p className="text-sm text-white/50">No paying members yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.membershipRevenue.members.map((m) => (
                    <div key={m.userId} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#2e3d1a] overflow-hidden flex items-center justify-center shrink-0">
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-black text-[#c5f135]">{initialsOf(m.displayName)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">{m.displayName}</p>
                        <p className="text-xs text-white/40 truncate">
                          Member since {new Date(m.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {m.planName && ` · ${m.planName}`}
                        </p>
                      </div>
                      <span className="text-xs font-black text-[#c5f135] shrink-0">
                        {m.priceCents ? `$${(m.priceCents / 100).toFixed(2)}${m.billingInterval === "yearly" ? "/yr" : m.billingInterval === "seasonal" ? " one-time" : "/mo"}` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Recent Workout Attendance" icon={<CalendarCheck className="w-3.5 h-3.5 text-[#c5f135]" />}>
              {data.recentWorkouts.length === 0 ? (
                <p className="text-sm text-white/50">No check-ins yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.recentWorkouts.map((w) => (
                    <div key={w.checkinId} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#2e3d1a] overflow-hidden flex items-center justify-center shrink-0">
                        {w.avatarUrl ? (
                          <img src={w.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-black text-[#c5f135]">{initialsOf(w.displayName)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">{w.displayName}</p>
                        <p className="text-xs text-white/40 truncate">
                          {w.runTitle}{w.runDate ? ` · ${new Date(w.runDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                        </p>
                      </div>
                      <Link href={`/runs/${w.runId}`} className="text-[10px] font-bold text-white/30 hover:text-[#c5f135] transition shrink-0">
                        View
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Check-Ins At Other Klubs" icon={<MapPin className="w-3.5 h-3.5 text-[#c5f135]" />}>
              <p className="text-xs text-white/35 mb-3 -mt-1">Where your members check in when they travel</p>
              {data.crossClubCheckins.length === 0 ? (
                <p className="text-sm text-white/50">No cross-klub activity yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.crossClubCheckins.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{c.displayName}</p>
                        <p className="text-xs text-white/40 truncate">{c.otherClubName}</p>
                      </div>
                      <span className="text-xs font-black text-[#c5f135] shrink-0">{c.checkinCount}×</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="RSVP vs. Check-In Rate" icon={<PartyPopper className="w-3.5 h-3.5 text-[#c5f135]" />}>
              <p className="text-xs text-white/35 mb-3 -mt-1">Runs in the last 30 days — how many who RSVPed actually showed up</p>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                  <p className="text-lg font-black text-white">{data.rsvpVsCheckin.totalRsvps}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">RSVPs</p>
                </div>
                <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                  <p className="text-lg font-black text-white">{data.rsvpVsCheckin.totalCheckins}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Check-ins</p>
                </div>
                <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                  <p className="text-lg font-black text-[#c5f135]">
                    {data.rsvpVsCheckin.rate !== null ? `${Math.round(data.rsvpVsCheckin.rate * 100)}%` : "—"}
                  </p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Show-up rate</p>
                </div>
              </div>
              {data.rsvpVsCheckin.recentRuns.length > 0 && (
                <div className="space-y-1.5">
                  {data.rsvpVsCheckin.recentRuns.map((r) => (
                    <div key={r.runId} className="flex items-center justify-between gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{r.title}</p>
                        <p className="text-xs text-white/40">{new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                      </div>
                      <span className="text-xs font-black text-white/60 shrink-0">{r.checkinCount} / {r.rsvpCount}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Member Retention" icon={<TrendingDown className="w-3.5 h-3.5 text-[#c5f135]" />}>
              <p className="text-xs text-white/35 mb-3 -mt-1">Based on each member&apos;s most recent check-in — or, if they haven&apos;t checked in yet, how long ago they signed up</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                  <p className="text-lg font-black text-[#c5f135]">{data.retention.active}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Active (≤30d)</p>
                </div>
                <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                  <p className="text-lg font-black text-yellow-400">{data.retention.atRisk}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">At risk (31-60d)</p>
                </div>
                <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                  <p className="text-lg font-black text-red-400">{data.retention.churned}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Churned (&gt;60d)</p>
                </div>
              </div>
            </Card>

            <Card title="Email Engagement" icon={<Mail className="w-3.5 h-3.5 text-[#c5f135]" />}>
              {data.emailEngagement.totalSent === 0 ? (
                <p className="text-sm text-white/50">No emails sent yet. Send a training schedule to start tracking engagement.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                      <p className="text-lg font-black text-white">{data.emailEngagement.totalSent}</p>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Sent</p>
                    </div>
                    <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                      <p className="text-lg font-black text-[#c5f135]">
                        {data.emailEngagement.openRate !== null ? `${Math.round(data.emailEngagement.openRate * 100)}%` : "—"}
                      </p>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Open rate</p>
                    </div>
                    <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                      <p className="text-lg font-black text-[#c5f135]">
                        {data.emailEngagement.clickRate !== null ? `${Math.round(data.emailEngagement.clickRate * 100)}%` : "—"}
                      </p>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Click rate</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
                    <span>{data.emailEngagement.delivered} delivered</span>
                    <span>{data.emailEngagement.bounced} bounced</span>
                    <span>{data.emailEngagement.complained} complained</span>
                  </div>
                </>
              )}
            </Card>

            <Card title="Passport Check-ins" icon={<Crown className="w-3.5 h-3.5 text-[#c5f135]" />}>
              <p className="text-xs text-white/35 mb-3 -mt-1">Runners from other klubs redeeming Passport credits at your klub</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                  <p className="text-lg font-black text-white">{data.passportCheckins.checkinCount}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Check-ins</p>
                </div>
                <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                  <p className="text-lg font-black text-[#c5f135]">${(data.passportCheckins.totalPayoutCents / 100).toFixed(2)}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Payouts earned</p>
                </div>
              </div>
              {data.passportCheckins.recentCheckins.length > 0 && (
                <div className="space-y-1.5">
                  {data.passportCheckins.recentCheckins.map((c) => (
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
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
