"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { CalendarCheck, Users, TrendingUp } from "lucide-react"

type CoachAnalyticsData = {
  clubName: string
  paceGroups: { id: string; name: string }[]
  analytics: {
    rosterSize: number
    retention: { active: number; atRisk: number; churned: number }
    showUp: { totalRsvps: number; totalCheckins: number; rate: number | null }
  }
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

/**
 * The scoped "Analytics" tab for a Coach — reuses /api/coach/dashboard (same
 * data CoachDashboard's Attendance card shows) but as its own destination,
 * mirroring the director's separate Analytics tab. No revenue/payment data,
 * no at-risk/churned breakdown — just roster size, active count, and show-up
 * rate for whichever klub they coach.
 */
export default function CoachAnalyticsView({ userId, clubId }: { userId: string; clubId?: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [data, setData] = useState<CoachAnalyticsData | null>(null)

  useEffect(() => {
    const load = async () => {
      let targetClubId = clubId
      if (!targetClubId) {
        const { data: coachRows } = await supabase.from("coaches").select("club_id").eq("user_id", userId).eq("status", "active").order("accepted_at", { ascending: false }).limit(1)
        targetClubId = coachRows?.[0]?.club_id
      }
      if (!targetClubId) { setLoading(false); return }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }

      const res = await fetch(`/api/coach/dashboard?club_id=${targetClubId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Something went wrong."); setLoading(false); return }
      setData(json)
      setLoading(false)
    }
    load()
  }, [userId, clubId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-6 text-center">
        <p className="text-white/40 text-sm">{error || "You're not coaching anywhere yet."}</p>
      </div>
    )
  }

  const { retention, showUp } = data.analytics

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">{data.clubName}</p>
            <h1 className="text-xl font-black text-white">Analytics</h1>
          </div>
        </div>

        <div className="space-y-4">
          <Card title="Your Roster" icon={<Users className="w-3.5 h-3.5 text-[#c5f135]" />}>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-xl font-black text-white">{data.analytics.rosterSize}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Total in scope</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-black text-[#c5f135]">{retention.active}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Active (≤30d)</p>
              </div>
            </div>
          </Card>

          <Card title="Show-Up Rate" icon={<CalendarCheck className="w-3.5 h-3.5 text-[#c5f135]" />}>
            <p className="text-xs text-white/35 mb-3 -mt-1">Runs in the last 30 days, your pace group(s) only</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-lg font-black text-white">{showUp.totalRsvps}</p>
                <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">RSVPs</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-white">{showUp.totalCheckins}</p>
                <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Check-ins</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-[#c5f135]">{showUp.rate !== null ? `${Math.round(showUp.rate * 100)}%` : "—"}</p>
                <p className="text-[9px] text-white/40 uppercase tracking-widest mt-0.5">Rate</p>
              </div>
            </div>
          </Card>

          {data.paceGroups.length > 0 && (
            <Card title="Pace Groups" icon={<TrendingUp className="w-3.5 h-3.5 text-[#c5f135]" />}>
              <div className="flex flex-wrap gap-2">
                {data.paceGroups.map((pg) => (
                  <span key={pg.id} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#1a2110] border border-[#2e3d1a] text-white/70">
                    {pg.name}
                  </span>
                ))}
              </div>
            </Card>
          )}

          <p className="text-xs text-white/25 text-center px-2">
            Membership payments and klub revenue aren&apos;t shown here — that&apos;s director-only.
          </p>
        </div>
      </div>
    </div>
  )
}
