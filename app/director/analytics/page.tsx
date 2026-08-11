"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Users, CalendarCheck, MapPin, Crown, DollarSign, Info } from "lucide-react"
import { supabase } from "@/lib/supabase"

type ClubOption = { id: string; name: string }

type AnalyticsData = {
  memberCount: number
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
  premium: {
    subscriberCount: number
    subscribers: { userId: string; displayName: string; startedAt: string }[]
    referralSubscriberCount: number
    monthlyRevenueCents: number
    isPlaceholder: boolean
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

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      if (prof?.role !== "manager") { router.replace("/"); return }
      const { data: myClubs } = await supabase.from("clubs").select("id, name").eq("user_id", user.id).order("name")
      setClubs(myClubs ?? [])
      setSelectedClubId(myClubs?.[0]?.id ?? null)
      setLoading(false)
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

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <Link href="/director" className="inline-flex items-center gap-1.5 text-white/40 hover:text-white text-sm font-semibold mb-6 transition">
          <ArrowLeft className="w-4 h-4" /> Director dashboard
        </Link>

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
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-xl px-3 py-3 text-center">
                <p className="text-xl font-black text-white">{data.memberCount}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Members</p>
              </div>
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-xl px-3 py-3 text-center">
                <p className="text-xl font-black text-white">{data.premium.subscriberCount}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Premium Members</p>
              </div>
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-xl px-3 py-3 text-center">
                <p className="text-xl font-black text-white">${(data.premium.monthlyRevenueCents / 100).toFixed(2)}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Premium /mo</p>
              </div>
            </div>

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

            <Card title="Passport Premium" icon={<Crown className="w-3.5 h-3.5 text-[#c5f135]" />}>
              {data.premium.isPlaceholder && (
                <div className="flex items-start gap-2 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 mb-3">
                  <Info className="w-3.5 h-3.5 text-white/30 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-white/40 leading-relaxed">
                    Passport Premium hasn&apos;t launched yet — no real subscriptions or money exist. These numbers use a placeholder 20% referral rate and will populate once it goes live.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                  <p className="text-lg font-black text-white">{data.premium.subscriberCount}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Your members subscribed</p>
                </div>
                <div className="bg-[#1a2110] rounded-xl px-3 py-3 text-center">
                  <p className="text-lg font-black text-[#c5f135]">${(data.premium.monthlyRevenueCents / 100).toFixed(2)}<span className="text-xs text-white/40">/mo</span></p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Referral revenue</p>
                </div>
              </div>
              {data.premium.subscribers.length > 0 && (
                <div className="space-y-1.5">
                  {data.premium.subscribers.map((s) => (
                    <div key={s.userId} className="flex items-center gap-2 text-xs">
                      <DollarSign className="w-3 h-3 text-[#c5f135]/60 shrink-0" />
                      <span className="text-white/70">{s.displayName}</span>
                      <span className="text-white/30">since {new Date(s.startedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
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
