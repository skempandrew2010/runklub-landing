"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { fetchClubModelData } from "@/lib/clubModel/api"
import { useClubModelAccess } from "@/lib/clubModel/access"
import type { ClubModelData, Member } from "@/lib/clubModel/types"
import { formatPaceRange } from "@/lib/clubModel/pace"
import { resolveScheduledWorkout } from "@/lib/clubModel/resolveWorkout"
import { currentWeekMonday } from "@/lib/clubModel/week"

export default function CoachViewPage() {
  const ready = useClubModelAccess("tester")
  const [data, setData] = useState<ClubModelData | null>(null)
  const [coachId, setCoachId] = useState("")

  useEffect(() => {
    if (!ready) return
    fetchClubModelData().then((d) => {
      setData(d)
      const sorted = d.coaches.slice().sort((a, b) => a.name.localeCompare(b.name))
      if (sorted[0]) setCoachId(sorted[0].id)
    })
  }, [ready])

  if (!ready || !data) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  const coaches = data.coaches.slice().sort((a, b) => a.name.localeCompare(b.name))
  const coach = coaches.find((c) => c.id === coachId) ?? null

  const assignedLocationIds = new Set(data.location_coaches.filter((lc) => lc.coach_id === coachId).map((lc) => lc.location_id))
  const assignedLocations = data.locations.filter((l) => assignedLocationIds.has(l.id))
  const assignedRegionIds = new Set(assignedLocations.map((l) => l.region_id))
  const assignedRegions = data.regions.filter((r) => assignedRegionIds.has(r.id))

  const roster = data.members.filter((m) => m.coach_id === coachId)
  const activeRoster = roster.filter((m) => m.status === "active")
  const pendingRoster = roster.filter((m) => m.status === "pending")

  const thisWeek = currentWeekMonday()
  const sessionsThisWeek = assignedRegions.flatMap((region) => {
    const regionDays = data.region_days.filter((rd) => rd.region_id === region.id && rd.meets)
    return regionDays.flatMap((rd) => {
      const slots = data.region_day_times.filter((t) => t.region_day_id === rd.id && t.location_id && assignedLocationIds.has(t.location_id))
      if (slots.length === 0) return []
      const scheduleIds = new Set(
        data.training_schedule_regions.filter((sr) => sr.region_id === region.id).map((sr) => sr.training_schedule_id)
      )
      const schedulesToday = data.training_schedules.filter((s) => scheduleIds.has(s.id) && s.day_of_week === rd.day_of_week)
      return schedulesToday.flatMap((s) => {
        const group = data.pace_groups.find((g) => g.id === s.pace_group_id)
        const sw = data.scheduled_workouts.find((w) => w.training_schedule_id === s.id && w.week_of === thisWeek)
        const resolved = sw ? resolveScheduledWorkout(sw, data) : null
        return slots.map((slot) => ({ region, day: rd.day_of_week, time: slot.time, group, resolved }))
      })
    })
  })

  const MemberRow = ({ m }: { m: Member }) => {
    const region = data.regions.find((r) => r.id === m.preferred_region_id)
    const group = data.pace_groups.find((g) => g.id === m.pace_group_id)
    return (
      <div className="bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
        <p className="text-sm font-bold text-white">{m.name}</p>
        <p className="text-xs text-white/60">{m.email}</p>
        <p className="text-xs text-white/50 mt-0.5">
          {region?.name ?? "—"} · {group ? `${group.name} (${formatPaceRange(group.pace_min, group.pace_max)})` : "—"}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] py-10 px-6">
      <div className="max-w-xl mx-auto">
        <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">Coach view</p>
        <h1 className="text-2xl font-black text-white mb-4">Your dashboard</h1>

        <select
          className="w-full bg-[#1e2d12] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-sm text-white mb-6 focus:outline-none focus:border-[#c5f135]/50"
          value={coachId}
          onChange={(e) => setCoachId(e.target.value)}
        >
          {coaches.length === 0 && <option value="">No coaches yet</option>}
          {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {coach && (
          <div className="space-y-4">
            <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
              <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-1">You</p>
              <p className="text-lg font-black text-white">{coach.name}</p>
              <p className="text-xs text-white/60">{[coach.email, coach.phone].filter(Boolean).join(" · ")}</p>
              <p className="text-xs text-white/50 mt-1">
                {assignedLocations.length > 0
                  ? assignedLocations.map((l) => l.name).join(", ")
                  : "No locations assigned yet"}
              </p>
            </div>

            <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
              <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">This week&rsquo;s sessions</p>
              {sessionsThisWeek.length === 0 && <p className="text-sm text-white/50">Nothing scheduled at your location(s) this week.</p>}
              <div className="space-y-1.5">
                {sessionsThisWeek.map((s, i) => (
                  <div key={i} className="bg-[#1a2110] border border-[#2e3d1a] rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-white">
                        {s.day} {s.time ?? ""} — {s.region.name} — {s.group?.name ?? "Unknown group"}
                      </p>
                      {s.resolved && (
                        <span className={`text-[9px] font-black uppercase tracking-wide shrink-0 ${s.resolved.isInPerson ? "text-[#c5f135]/70" : "text-white/50"}`}>
                          {s.resolved.isInPerson ? "In person" : "On your own"}
                        </span>
                      )}
                    </div>
                    {s.resolved ? (
                      <p className="text-xs text-white/60">
                        {s.resolved.workoutType.name}
                        {s.resolved.details ? ` — ${s.resolved.details}` : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-white/50">No workout set for this week yet</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
              <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">
                Your runners {activeRoster.length > 0 && `(${activeRoster.length})`}
              </p>
              <div className="space-y-2">
                {activeRoster.length === 0 && <p className="text-sm text-white/50">No active members assigned to you yet.</p>}
                {activeRoster.map((m) => <MemberRow key={m.id} m={m} />)}
              </div>
            </div>

            {pendingRoster.length > 0 && (
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
                <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Pending approval ({pendingRoster.length})</p>
                <div className="space-y-2">
                  {pendingRoster.map((m) => <MemberRow key={m.id} m={m} />)}
                </div>
              </div>
            )}
          </div>
        )}

        <Link href="/admin/club-model/manager" className="block text-center text-xs text-white/50 hover:text-white/70 mt-6">
          ← Back to manager dashboard
        </Link>
      </div>
    </div>
  )
}
