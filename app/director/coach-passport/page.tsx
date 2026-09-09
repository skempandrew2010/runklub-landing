"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { formatRunTime } from "@/lib/timezone"
import { Stamp, CalendarCheck } from "lucide-react"

type Attendee = { userId: string; displayName: string; avatarUrl: string | null; redeemedAt: string }
type PassportRun = {
  id: string
  title: string
  date: string
  time: string
  timezone: string | null
  distance: string | null
  meeting_point: string | null
  members_only: boolean
  attendees: Attendee[]
}
type PassportRunsData = { clubName: string; runs: PassportRun[] }

function formatDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow"
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

// A coach's read-only view of which of their upcoming runs are Passport
// events (see passport_designated_runs) and who's redeemed a check-in
// against each one — the whole point being to recognize Passport runners
// at the run and greet them, not just see attendance numbers after the fact.
// Sibling to /director/passport (the director's own enrollment/offer
// management page) the same way CoachDashboard's Members tab is a scoped-
// down sibling of the director's own Members tab - a coach never creates or
// edits offers here, only sees who's coming.
export default function CoachPassportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    }>
      <CoachPassportPageInner />
    </Suspense>
  )
}

function CoachPassportPageInner() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [data, setData] = useState<PassportRunsData | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      let clubId = searchParams.get("club_id") ?? undefined
      if (!clubId) {
        const { data: coachRows } = await supabase.from("coaches").select("club_id").eq("user_id", user.id).eq("status", "active").order("accepted_at", { ascending: false }).limit(1)
        clubId = coachRows?.[0]?.club_id
      }
      if (!clubId) { setLoading(false); return }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }

      const res = await fetch(`/api/coach/passport-runs?club_id=${clubId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Something went wrong."); setLoading(false); return }
      setData(json)
      setLoading(false)
    }
    load()
  }, [searchParams])

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

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">{data.clubName}</p>
        <h1 className="text-xl font-black text-white flex items-center gap-2 mb-1">
          <Stamp className="w-5 h-5 text-[#c5f135]" />
          Passport
        </h1>
        <p className="text-sm text-white/40 mb-6">Runs in your scope your director's marked as Passport events, and who's checked in to redeem</p>

        {data.runs.length === 0 ? (
          <div className="bg-[#1e2d12] rounded-2xl p-8 text-center border border-[#2e3d1a]">
            <Stamp className="w-8 h-8 text-white/15 mx-auto mb-2" />
            <p className="text-white/40 text-sm">No Passport-designated runs in your scope yet.</p>
            <p className="text-white/25 text-xs mt-1">Your director picks which runs count for Passport from the offer settings.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.runs.map((run) => (
              <div key={run.id} className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl overflow-hidden">
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-white truncate">{run.title}</p>
                    {run.members_only && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 border border-white/10 shrink-0">MEMBERS</span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">
                    {formatDay(run.date)} · {formatRunTime(run)}
                    {run.distance && ` · ${run.distance}`}
                  </p>
                </div>
                <div className="px-4 pb-4 border-t border-[#2e3d1a] pt-3">
                  {run.attendees.length === 0 ? (
                    <p className="text-xs text-white/30 flex items-center gap-1.5">
                      <CalendarCheck className="w-3.5 h-3.5 text-white/20" />
                      No Passport check-ins yet for this run.
                    </p>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">
                        {run.attendees.length} Passport runner{run.attendees.length === 1 ? "" : "s"} coming
                      </p>
                      <div className="space-y-2">
                        {run.attendees.map((a) => (
                          <div key={a.userId} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full shrink-0 bg-[#2e3d1a] overflow-hidden flex items-center justify-center">
                              {a.avatarUrl
                                ? <img src={a.avatarUrl} alt="" className="w-full h-full object-cover" />
                                : <span className="text-[10px] font-black text-[#c5f135]">{initialsOf(a.displayName)}</span>
                              }
                            </div>
                            <p className="text-sm font-bold text-white truncate">{a.displayName}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
