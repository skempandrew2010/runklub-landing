"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CalendarCheck, MapPin, PartyPopper, TrendingDown, Mail, Users } from "lucide-react"
import { supabase } from "@/lib/supabase"

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

// Analytics for a klub the director owns, embedded as a tab in the club
// management dashboard (app/director/page.tsx). Split out of the old
// standalone /director/analytics route, which still exists for the
// coach-viewing-someone-else's-klub case (CoachAnalyticsView) — that role
// has no equivalent "club management" dashboard of its own to embed into.
export default function AnalyticsTab({ clubId }: { clubId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!clubId) return
    const load = async () => {
      setLoading(true)
      setError("")
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/director/analytics?club_id=${clubId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Something went wrong."); setData(null) }
      else setData(json)
      setLoading(false)
    }
    load()
  }, [clubId])

  if (error) return <p className="text-red-400 text-sm">{error}</p>

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
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

    </div>
  )
}
