"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { fetchClubModelData, fetchJoinData, lookupInvite, insertRow, acceptInvite } from "@/lib/clubModel/api"
import { useClubModelAccess } from "@/lib/clubModel/access"
import { supabase } from "@/lib/supabase"
import type { Region, Location, Coach, PaceGroup, WorkoutType } from "@/lib/clubModel/types"
import { formatPaceRange } from "@/lib/clubModel/pace"
import { matchLocationForPaceGroup } from "@/lib/clubModel/matching"
import { currentWeekMonday } from "@/lib/clubModel/week"
import { Select } from "@/components/Select"
import { resolveScheduledWorkout } from "@/lib/clubModel/resolveWorkout"
import { googleMapsUrl } from "@/lib/clubModel/maps"
import { CLUB_ID } from "@/lib/clubModel/constants"

type MatchResult = {
  memberId: string
  paceGroup: PaceGroup
  location: Location | null
  time: string | null
  coach: Coach | null
  workouts: { workoutType: WorkoutType; details: string | null; weekOf: string; isInPerson: boolean }[]
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    }>
      <JoinContent />
    </Suspense>
  )
}

function JoinContent() {
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get("invite")

  // Only used when there's no invite token - an invitee isn't logged in at
  // all, so the normal admin/manager/tester gate doesn't apply to them.
  const testerReady = useClubModelAccess("tester", !!inviteToken)
  const [inviteState, setInviteState] = useState<"checking" | "valid" | "invalid">(inviteToken ? "checking" : "valid")
  const [inviteError, setInviteError] = useState("")

  const ready = inviteToken ? inviteState !== "checking" : testerReady

  const [regions, setRegions] = useState<Region[]>([])
  const [paceGroups, setPaceGroups] = useState<PaceGroup[]>([])
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [paceGroupId, setPaceGroupId] = useState("")
  const [regionId, setRegionId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<MatchResult | null>(null)

  useEffect(() => {
    if (inviteToken) {
      lookupInvite(inviteToken)
        .then((invite) => {
          setInviteState("valid")
          setEmail(invite.email)
          if (invite.name) setName(invite.name)
        })
        .catch((err) => {
          setInviteState("invalid")
          setInviteError(err instanceof Error ? err.message : "This invite link is no longer valid.")
        })
      return
    }
    if (!testerReady) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email)
    })
  }, [inviteToken, testerReady])

  useEffect(() => {
    if (!ready || inviteState === "invalid") return
    const load = inviteToken ? fetchJoinData(inviteToken) : fetchClubModelData()
    load.then((data) => {
      const sortedRegions = data.regions.slice().sort((a, b) => a.name.localeCompare(b.name))
      setRegions(sortedRegions)
      if (sortedRegions[0]) setRegionId(sortedRegions[0].id)

      const sortedPaceGroups = data.pace_groups.slice().sort((a, b) => a.pace_min - b.pace_min)
      setPaceGroups(sortedPaceGroups)
      if (sortedPaceGroups[0]) setPaceGroupId(sortedPaceGroups[0].id)
    })
  }, [ready, inviteState, inviteToken])

  const submit = async () => {
    setError("")
    if (!name.trim() || !email.trim() || !paceGroupId || !regionId) {
      setError("Fill in every field.")
      return
    }
    setSubmitting(true)
    try {
      const data = inviteToken ? await fetchJoinData(inviteToken) : await fetchClubModelData()

      const matchedGroup = data.pace_groups.find((g) => g.id === paceGroupId)
      if (!matchedGroup) throw new Error("No pace groups configured yet - add one in the manager dashboard.")
      const paceValue = (matchedGroup.pace_min + matchedGroup.pace_max) / 2

      // A pace group can train on multiple days; only the day(s) whose
      // training schedule includes the member's chosen region are relevant.
      const groupSchedules = data.training_schedules.filter((s) => s.pace_group_id === matchedGroup.id)
      const applicableScheduleIds = new Set(
        data.training_schedule_regions.filter((sr) => sr.region_id === regionId).map((sr) => sr.training_schedule_id)
      )
      const applicableSchedules = groupSchedules.filter((s) => applicableScheduleIds.has(s.id))

      const { location: matchedLocation, coach: matchedCoach, time: matchedTime } = matchLocationForPaceGroup(matchedGroup.id, regionId, data)

      const thisWeek = currentWeekMonday()
      const workouts: MatchResult["workouts"] = data.scheduled_workouts
        .filter((w) => applicableSchedules.some((s) => s.id === w.training_schedule_id) && w.week_of === thisWeek)
        .map((w) => {
          const resolved = resolveScheduledWorkout(w, data)
          return resolved ? { workoutType: resolved.workoutType, details: resolved.details, weekOf: w.week_of, isInPerson: resolved.isInPerson } : null
        })
        .filter((w): w is MatchResult["workouts"][number] => w !== null)

      let memberId: string

      if (inviteToken) {
        const member = await acceptInvite({
          token: inviteToken,
          name: name.trim(),
          email: email.trim(),
          self_reported_pace: paceValue,
          preferred_region_id: regionId,
          pace_group_id: matchedGroup.id,
          location_id: matchedLocation?.id ?? null,
          coach_id: matchedCoach?.id ?? null,
        })
        memberId = member.id
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        const member = await insertRow("members", {
          club_id: CLUB_ID,
          name: name.trim(),
          email: email.trim(),
          self_reported_pace: paceValue,
          preferred_region_id: regionId,
          pace_group_id: matchedGroup.id,
          location_id: matchedLocation?.id ?? null,
          coach_id: matchedCoach?.id ?? null,
          user_id: user?.id ?? null,
        })
        memberId = member[0].id
      }

      setResult({
        memberId,
        paceGroup: matchedGroup,
        location: matchedLocation,
        time: matchedTime,
        coach: matchedCoach,
        workouts,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    }
    setSubmitting(false)
  }

  if (inviteToken && inviteState === "invalid") {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-6">
        <p className="text-white font-bold text-center">{inviteError}</p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] py-10 px-6">
      <div className="max-w-xl mx-auto">
        <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">
          {inviteToken ? "You're invited" : "Admin prototype"}
        </p>
        <h1 className="text-2xl font-black text-white mb-1">Join the klub</h1>
        <p className="text-sm text-white/60 mb-6">
          {inviteToken ? "Pick your pace group and branch to get matched." : "Simulates a prospective member signing up and getting matched."}
        </p>

        {!result ? (
          <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-white/60 block mb-1">Name</label>
              <input
                className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c5f135]/50"
                value={name} onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-white/60 block mb-1">Email</label>
              <input
                type="email"
                className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c5f135]/50"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-white/60 block mb-2">Pace group</label>
              {paceGroups.length === 0 ? (
                <p className="text-xs text-white/30 italic">No pace groups configured yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {paceGroups.map((pg) => {
                    const active = paceGroupId === pg.id
                    return (
                      <button key={pg.id} type="button" onClick={() => setPaceGroupId(pg.id)}
                        className={`flex flex-col items-start px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                          active
                            ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]"
                            : "bg-[#1a2110] text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"
                        }`}>
                        <span>{pg.name}</span>
                        <span className={`text-[10px] font-normal mt-0.5 ${active ? "text-[#1a2110]/60" : "text-white/30"}`}>
                          {formatPaceRange(pg.pace_min, pg.pace_max)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-white/60 block mb-1">Preferred region</label>
              <Select
                className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c5f135]/50"
                value={regionId} onChange={(e) => setRegionId(e.target.value)}
              >
                {regions.length === 0 && <option value="">No regions configured</option>}
                {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              onClick={submit}
              disabled={submitting}
              className="w-full bg-[#c5f135] text-[#1a2110] font-black rounded-full py-2.5 hover:bg-[#d4fb4d] disabled:opacity-40 transition"
            >
              {submitting ? "Matching…" : "Join & match me"}
            </button>

            {!inviteToken && (
              <Link href="/admin/club-model/manager" className="block text-center text-xs text-white/50 hover:text-white/70">
                ← Back to manager dashboard
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-6 space-y-4">
            <div>
              <p className="text-xs font-bold text-[#c5f135] uppercase tracking-widest mb-1">Matched - pending approval</p>
              <h2 className="text-lg font-black text-white">Welcome, {name.trim()}</h2>
              <p className="text-xs text-white/60 mt-1">
                A manager needs to approve you before you can see this klub&rsquo;s runs.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[#1a2110] border border-[#2e3d1a] rounded-xl p-3">
                <p className="text-xs font-bold text-white/60 uppercase mb-0.5">Pace group</p>
                <p className="text-sm font-black text-white">{result.paceGroup.name}</p>
                <p className="text-xs text-white/60">{formatPaceRange(result.paceGroup.pace_min, result.paceGroup.pace_max)}</p>
              </div>
              <div className="bg-[#1a2110] border border-[#2e3d1a] rounded-xl p-3">
                <p className="text-xs font-bold text-white/60 uppercase mb-0.5">Location</p>
                {result.location ? (
                  <>
                    <a
                      href={googleMapsUrl(result.location)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-black text-white hover:text-[#c5f135] transition"
                    >
                      {result.location.name}
                    </a>
                    {result.time && <p className="text-xs text-white/60">{result.time}</p>}
                  </>
                ) : <p className="text-sm text-white/50">No location matched for that region/day yet</p>}
              </div>
              <div className="bg-[#1a2110] border border-[#2e3d1a] rounded-xl p-3">
                <p className="text-xs font-bold text-white/60 uppercase mb-0.5">Coach</p>
                {result.coach ? (
                  <>
                    <p className="text-sm font-black text-white">{result.coach.name}</p>
                    <p className="text-xs text-white/60">{result.coach.email}</p>
                  </>
                ) : <p className="text-sm text-white/50">No coach assigned to that location yet</p>}
              </div>
              <div className="bg-[#1a2110] border border-[#2e3d1a] rounded-xl p-3">
                <p className="text-xs font-bold text-white/60 uppercase mb-0.5">This week&rsquo;s workout</p>
                {result.workouts.length > 0 ? result.workouts.map((w, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <p className="text-sm font-black text-white">{w.workoutType.name}</p>
                    <span className={`text-[9px] font-black uppercase tracking-wide ${w.isInPerson ? "text-[#c5f135]/70" : "text-white/50"}`}>
                      {w.isInPerson ? "In person" : "On your own"}
                    </span>
                  </div>
                )) : <p className="text-sm text-white/50">Nothing scheduled this week</p>}
              </div>
            </div>

            {inviteToken ? (
              <p className="text-center text-xs text-white/50">You&rsquo;re all set - see you out there.</p>
            ) : (
              <>
                <div className="flex gap-2 pt-2">
                  <Link
                    href={`/admin/club-model/preview-email/${result.memberId}`}
                    className="flex-1 text-center bg-[#c5f135] text-[#1a2110] font-black rounded-full py-2.5 hover:bg-[#d4fb4d] transition"
                  >
                    View welcome email →
                  </Link>
                  <button
                    onClick={() => { setResult(null); setName(""); setEmail("") }}
                    className="px-4 rounded-full border border-[#2e3d1a] text-sm font-bold text-white/50 hover:text-white transition"
                  >
                    Simulate another
                  </button>
                </div>
                <Link
                  href="/admin/club-model/member-view"
                  className="block text-center text-xs text-white/50 hover:text-white/70"
                >
                  Check whether I can see this klub&rsquo;s runs yet →
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
