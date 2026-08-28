"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { fetchClubModelData, updateRow } from "@/lib/clubModel/api"
import { useClubModelAccess } from "@/lib/clubModel/access"
import { supabase } from "@/lib/supabase"
import type { ClubModelData } from "@/lib/clubModel/types"
import { formatPaceRange } from "@/lib/clubModel/pace"
import { resolveMemberContext } from "@/lib/clubModel/resolveMemberContext"
import { resolveClubWeekSchedule } from "@/lib/clubModel/resolveWeekSchedule"
import { matchLocationForPaceGroup } from "@/lib/clubModel/matching"
import { currentWeekMonday, formatWeekRange } from "@/lib/clubModel/week"
import { Select } from "@/components/Select"

export default function MemberDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    }>
      <MemberDashboardContent />
    </Suspense>
  )
}

function MemberDashboardContent() {
  const ready = useClubModelAccess("tester")
  const searchParams = useSearchParams()
  const [data, setData] = useState<ClubModelData | null>(null)
  const [memberId, setMemberId] = useState(searchParams.get("memberId") ?? "")
  const [savingRegion, setSavingRegion] = useState(false)

  const load = async () => {
    const [d, { data: { user } }] = await Promise.all([fetchClubModelData(), supabase.auth.getUser()])
    setData(d)
    setMemberId((prev) => {
      if (prev) return prev
      const sorted = d.members.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
      const own = user ? sorted.find((m) => m.user_id === user.id) : null
      return own ? own.id : (sorted[0]?.id ?? "")
    })
  }

  useEffect(() => {
    if (!ready) return
    load()
  }, [ready])

  if (!ready || !data) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  const members = data.members.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
  const member = members.find((m) => m.id === memberId) ?? null
  const ctx = member ? resolveMemberContext(member, data) : null
  const weekSchedule = member
    ? resolveClubWeekSchedule(data).filter((s) => s.region.id === member.preferred_region_id)
    : []

  const teammates = member && ctx?.paceGroup
    ? data.members.filter((m) => m.id !== member.id && m.pace_group_id === ctx.paceGroup!.id && m.status === "active")
    : []

  const changeRegion = async (newRegionId: string) => {
    if (!member || !newRegionId) return
    setSavingRegion(true)
    const match = ctx?.paceGroup
      ? matchLocationForPaceGroup(ctx.paceGroup.id, newRegionId, data)
      : { location: null, coach: null }
    await updateRow("members", { id: member.id }, {
      preferred_region_id: newRegionId,
      location_id: match.location?.id ?? null,
      coach_id: match.coach?.id ?? null,
    })
    await load()
    setSavingRegion(false)
  }

  return (
    <div className="min-h-screen bg-[#1a2110] py-10 px-6">
      <div className="max-w-xl mx-auto">
        <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">Member view</p>
        <h1 className="text-2xl font-black text-white mb-4">Your dashboard</h1>

        <Select
          className="w-full bg-[#1e2d12] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-sm text-white mb-6 focus:outline-none focus:border-[#c5f135]/50"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
        >
          {members.length === 0 && <option value="">No members yet</option>}
          {members.map((m) => <option key={m.id} value={m.id}>{m.name} - {m.email}</option>)}
        </Select>

        {member && ctx && (
          <div className="space-y-4">
            <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-lg font-black text-white">{member.name}</p>
                <p className="text-xs text-white/60">{member.email}</p>
              </div>
              {member.status === "active" && <span className="text-xs font-black text-[#c5f135] uppercase">Active</span>}
              {member.status === "pending" && <span className="text-xs font-black text-white/60 uppercase">Pending approval</span>}
              {member.status === "rejected" && <span className="text-xs font-black text-red-400 uppercase">Rejected</span>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
                <p className="text-xs font-bold text-white/60 uppercase mb-0.5">Pace group</p>
                {ctx.paceGroup ? (
                  <>
                    <p className="text-sm font-black text-white">{ctx.paceGroup.name}</p>
                    <p className="text-xs text-white/60">{formatPaceRange(ctx.paceGroup.pace_min, ctx.paceGroup.pace_max)}</p>
                  </>
                ) : <p className="text-sm text-white/50">Not matched</p>}
              </div>
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
                <p className="text-xs font-bold text-white/60 uppercase mb-1">Your region</p>
                <Select
                  className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-lg px-2 py-1.5 text-sm font-black text-white focus:outline-none focus:border-[#c5f135]/50 disabled:opacity-50"
                  value={member.preferred_region_id ?? ""}
                  disabled={savingRegion}
                  onChange={(e) => changeRegion(e.target.value)}
                >
                  {!member.preferred_region_id && <option value="">No region chosen</option>}
                  {data.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </div>
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4 sm:col-span-2">
                <p className="text-xs font-bold text-white/60 uppercase mb-0.5">Coach</p>
                {ctx.coach ? (
                  <>
                    <p className="text-sm font-black text-white">{ctx.coach.name}</p>
                    <p className="text-xs text-white/60">{ctx.coach.email}</p>
                  </>
                ) : <p className="text-sm text-white/50">No coach assigned</p>}
              </div>
            </div>

            <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
              <p className="text-xs font-bold text-white/60 uppercase tracking-widest">
                This week&rsquo;s schedule{ctx.region ? ` in ${ctx.region.name}` : ""}
              </p>
              <p className="text-[10px] text-white/50 mb-2">{formatWeekRange(currentWeekMonday())}</p>
              {weekSchedule.length === 0 && <p className="text-sm text-white/50">Nothing scheduled this week.</p>}
              <div className="space-y-2">
                {weekSchedule.map((s) => {
                  const isInPerson = s.workout?.isInPerson ?? true
                  const isOwn = ctx?.paceGroup?.id === s.paceGroup.id
                  const href = `/admin/club-model/run?memberId=${member.id}&day=${encodeURIComponent(s.dayOfWeek)}&paceGroupId=${s.paceGroup.id}&regionId=${s.region.id}`

                  return (
                    <Link
                      key={`${s.dayOfWeek}-${s.paceGroup.id}`}
                      href={href}
                      className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 transition hover:brightness-110"
                      style={isInPerson
                        ? { backgroundColor: "rgba(197,241,53,0.12)", borderColor: "rgba(197,241,53,0.35)" }
                        : { backgroundColor: "#1a2110", borderColor: "#2e3d1a" }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {s.dayOfWeek}{s.time ? ` · ${s.time}` : ""} - {s.paceGroup.name}
                        </p>
                        {isOwn && <span className="text-[9px] font-black text-white/60 uppercase tracking-wide">Your group</span>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[10px] font-black uppercase tracking-wide ${isInPerson ? "text-[#c5f135]" : "text-white/50"}`}>
                          {isInPerson ? "In person" : "On your own"}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-white/50" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>

            <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
              <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">
                Teammates {teammates.length > 0 && `(${teammates.length})`}
              </p>
              {teammates.length === 0 ? (
                <p className="text-sm text-white/50">No other active members in your pace group yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {teammates.map((t) => (
                    <p key={t.id} className="text-sm text-white/70">{t.name}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Link
                href={`/admin/club-model/preview-email/${member.id}`}
                className="flex-1 text-center bg-[#c5f135] text-[#1a2110] font-black rounded-full py-2.5 hover:bg-[#d4fb4d] transition"
              >
                View welcome email →
              </Link>
              <Link
                href="/admin/club-model/member-view"
                className="px-4 rounded-full border border-[#2e3d1a] text-sm font-bold text-white/50 hover:text-white transition flex items-center"
              >
                Check run visibility
              </Link>
            </div>
          </div>
        )}

        <Link href="/admin/club-model/manager" className="block text-center text-xs text-white/50 hover:text-white/70 mt-6">
          ← Back to manager dashboard
        </Link>
      </div>
    </div>
  )
}
