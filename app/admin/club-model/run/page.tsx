"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { MapPin } from "lucide-react"
import { fetchClubModelData, upsertRow } from "@/lib/clubModel/api"
import { useClubModelAccess } from "@/lib/clubModel/access"
import type { ClubModelData } from "@/lib/clubModel/types"
import { resolveClubWeekSchedule } from "@/lib/clubModel/resolveWeekSchedule"
import { googleMapsUrl } from "@/lib/clubModel/maps"
import { currentWeekMonday, formatWeekRange } from "@/lib/clubModel/week"

export default function RunPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    }>
      <RunContent />
    </Suspense>
  )
}

function RunContent() {
  const ready = useClubModelAccess("tester")
  const searchParams = useSearchParams()
  const memberId = searchParams.get("memberId") ?? ""
  const day = searchParams.get("day") ?? ""
  const paceGroupId = searchParams.get("paceGroupId") ?? ""
  const regionId = searchParams.get("regionId") ?? ""

  const [data, setData] = useState<ClubModelData | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const d = await fetchClubModelData()
    setData(d)
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

  const member = data.members.find((m) => m.id === memberId) ?? null
  const entry = resolveClubWeekSchedule(data).find(
    (s) => s.dayOfWeek === day && s.paceGroup.id === paceGroupId && s.region.id === regionId
  )

  const backHref = memberId ? `/admin/club-model/member-dashboard?memberId=${memberId}` : "/admin/club-model/member-dashboard"

  if (!entry) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-white/50 text-sm">This run couldn&rsquo;t be found.</p>
        <Link href={backHref} className="text-xs font-bold text-[#c5f135] hover:text-[#d4fb4d]">← Back to your dashboard</Link>
      </div>
    )
  }

  const isInPerson = entry.workout?.isInPerson ?? true
  const isOwn = member?.pace_group_id === entry.paceGroup.id
  const rsvp = entry.scheduledWorkoutId && member
    ? data.run_rsvps.find((r) => r.member_id === member.id && r.scheduled_workout_id === entry.scheduledWorkoutId)
    : undefined

  const setRsvp = async (going: boolean) => {
    if (!member || !entry.scheduledWorkoutId) return
    setSaving(true)
    await upsertRow(
      "run_rsvps",
      { member_id: member.id, scheduled_workout_id: entry.scheduledWorkoutId, going },
      "member_id,scheduled_workout_id"
    )
    await load()
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-[#1a2110] py-10 px-6">
      <div className="max-w-xl mx-auto">
        <Link href={backHref} className="block text-xs font-bold text-white/50 hover:text-white/70 mb-4">
          ← Back to your dashboard
        </Link>

        <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">
          {entry.dayOfWeek}{entry.time ? ` · ${entry.time}` : ""}
        </p>
        <h1 className="text-2xl font-black text-white mb-1">{entry.paceGroup.name}</h1>
        <p className="text-xs text-white/50 mb-4">{formatWeekRange(currentWeekMonday())}</p>
        <div className="flex items-center gap-2 mb-6">
          <span className={`text-xs font-black uppercase tracking-wide ${isInPerson ? "text-[#c5f135]" : "text-white/50"}`}>
            {isInPerson ? "In person" : "On your own"}
          </span>
          {isOwn && <span className="text-xs font-black text-white/60 uppercase tracking-wide">· Your group</span>}
        </div>

        <div className="space-y-4">
          {isInPerson && (
            <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
              <p className="text-xs font-bold text-white/60 uppercase mb-1">Location</p>
              {entry.location ? (
                <a
                  href={googleMapsUrl(entry.location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm font-black text-[#c5f135] hover:text-[#d4fb4d] transition"
                >
                  <MapPin className="w-4 h-4 shrink-0" />
                  {entry.location.name}
                </a>
              ) : <p className="text-sm text-white/50">No location set</p>}
              {entry.location?.address && <p className="text-xs text-white/60 mt-0.5">{entry.location.address}</p>}
            </div>
          )}

          <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
            <p className="text-xs font-bold text-white/60 uppercase mb-1">Workout</p>
            {entry.workout ? (
              <>
                <p className="text-sm font-black text-white">{entry.workout.workoutType.name}</p>
                {entry.workout.details && <p className="text-sm text-white/60 mt-1">{entry.workout.details}</p>}
              </>
            ) : <p className="text-sm text-white/50">No workout set for this week yet</p>}
          </div>

          {isOwn && isInPerson && entry.scheduledWorkoutId && member && (
            <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
              <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Are you going?</p>
              <div className="flex gap-2">
                <button
                  disabled={saving}
                  onClick={() => setRsvp(true)}
                  className={`px-4 py-2 rounded-full text-sm font-black transition disabled:opacity-40 ${
                    rsvp?.going === true
                      ? "bg-[#c5f135] text-[#1a2110]"
                      : "bg-[#1a2110] border border-[#2e3d1a] text-white/50 hover:text-white"
                  }`}
                >
                  I&rsquo;m going
                </button>
                <button
                  disabled={saving}
                  onClick={() => setRsvp(false)}
                  className={`px-4 py-2 rounded-full text-sm font-black transition disabled:opacity-40 ${
                    rsvp?.going === false
                      ? "bg-red-400 text-[#1a2110]"
                      : "bg-[#1a2110] border border-[#2e3d1a] text-white/50 hover:text-white"
                  }`}
                >
                  Not going
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
