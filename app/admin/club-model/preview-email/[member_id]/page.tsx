"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { fetchClubModelData } from "@/lib/clubModel/api"
import { useClubModelAccess } from "@/lib/clubModel/access"
import type { ClubModelData, Member } from "@/lib/clubModel/types"
import { formatPaceRange } from "@/lib/clubModel/pace"
import { resolveMemberContext, type MemberContext } from "@/lib/clubModel/resolveMemberContext"
import { resolveClubWeekSchedule } from "@/lib/clubModel/resolveWeekSchedule"
import { googleMapsUrl } from "@/lib/clubModel/maps"
import { currentWeekMonday, formatWeekRange } from "@/lib/clubModel/week"

type Resolved = MemberContext & { member: Member }

export default function PreviewEmailPage() {
  const ready = useClubModelAccess("tester")
  const params = useParams<{ member_id: string }>()
  const [data, setData] = useState<ClubModelData | null>(null)
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!ready) return
    fetchClubModelData().then((d) => {
      const member = d.members.find((m) => m.id === params.member_id)
      if (!member) { setNotFound(true); return }

      setData(d)
      setResolved({ member, ...resolveMemberContext(member, d) })
    })
  }, [ready, params.member_id])

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#F0EDE8] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-black/20 border-t-black rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#F0EDE8] flex items-center justify-center px-6">
        <p className="text-[#0D0D0D] font-bold">No member found with that id.</p>
      </div>
    )
  }

  if (!resolved || !data) {
    return <div className="min-h-screen bg-[#F0EDE8]" />
  }

  const { member: m, paceGroup: pg, region, coach: cch } = resolved
  const weekSchedule = resolveClubWeekSchedule(data).filter((s) => s.region.id === m.preferred_region_id)

  return (
    <div className="min-h-screen bg-[#F0EDE8] py-10 px-4">
      <div className="max-w-lg mx-auto rounded-2xl overflow-hidden shadow-xl" style={{ fontFamily: "Arial, sans-serif" }}>
        {/* Header */}
        <div className="bg-[#0D0D0D] px-8 py-6">
          <span
            className="text-2xl text-white tracking-tight"
            style={{ fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}
          >
            Run<span style={{ color: "#C8F23C" }}>Klub</span>
          </span>
        </div>

        {/* Body */}
        <div className="bg-[#F0EDE8] px-8 py-8">
          <h1
            className="text-3xl text-[#0D0D0D] leading-tight mb-3"
            style={{ fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}
          >
            You&rsquo;re in, {m.name.split(" ")[0]}.
          </h1>
          <p className="text-sm text-[#0D0D0D]/70 mb-8 leading-relaxed">
            Here&rsquo;s everything you need for your first run — your pace group, your crew, and this
            week&rsquo;s schedule.
          </p>

          <div className="space-y-3 mb-8">
            <div className="bg-white rounded-xl p-4 border border-black/5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0D0D0D]/60 mb-1">Pace group</p>
              <p className="text-lg text-[#0D0D0D]" style={{ fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}>
                {pg ? pg.name : "Not yet matched"}
              </p>
              {pg && <p className="text-sm text-[#0D0D0D]/60">{formatPaceRange(pg.pace_min, pg.pace_max)}</p>}
            </div>

            <div className="bg-white rounded-xl p-4 border border-black/5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0D0D0D]/60 mb-1">Where you&rsquo;ll run</p>
              {region ? (
                <p className="text-lg text-[#0D0D0D]" style={{ fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}>
                  {region.name}
                </p>
              ) : <p className="text-sm text-[#0D0D0D]/60">No region chosen yet</p>}
            </div>

            <div className="bg-white rounded-xl p-4 border border-black/5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0D0D0D]/60 mb-1">Your coach</p>
              {cch ? (
                <>
                  <p className="text-lg text-[#0D0D0D]" style={{ fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}>
                    {cch.name}
                  </p>
                  <p className="text-sm text-[#0D0D0D]/60">{[cch.email, cch.phone].filter(Boolean).join(" · ")}</p>
                </>
              ) : <p className="text-sm text-[#0D0D0D]/60">No coach assigned yet</p>}
            </div>

          </div>

          <div className="mb-8">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#0D0D0D]/60 mb-0.5">This week&rsquo;s schedule</p>
            <p className="text-[11px] text-[#0D0D0D]/60 mb-2">{formatWeekRange(currentWeekMonday())}</p>
            <div className="space-y-2">
              {weekSchedule.length === 0 ? (
                <div className="bg-white rounded-xl p-4 border border-black/5">
                  <p className="text-sm text-[#0D0D0D]/60">Nothing scheduled this week.</p>
                </div>
              ) : (
                weekSchedule.map((s, i) => {
                  const isInPerson = s.workout?.isInPerson ?? true
                  return (
                    <div
                      key={i}
                      className="rounded-xl p-4 border"
                      style={{
                        backgroundColor: isInPerson ? "rgba(200,242,60,0.25)" : "#ffffff",
                        borderColor: isInPerson ? "rgba(200,242,60,0.6)" : "rgba(0,0,0,0.05)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-[#0D0D0D]" style={{ fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}>
                          {s.dayOfWeek}{s.time ? ` · ${s.time}` : ""} — {s.paceGroup.name}
                        </p>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#0D0D0D]/60 shrink-0">
                          {isInPerson ? "In person" : "On your own"}
                        </span>
                      </div>
                      {isInPerson && (
                        s.location ? (
                          <a
                            href={googleMapsUrl(s.location)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-[#0D0D0D]/70 hover:underline"
                          >
                            {s.location.name}{s.location.address ? ` — ${s.location.address}` : ""}
                          </a>
                        ) : (
                          <p className="text-sm text-[#0D0D0D]/60">No location set</p>
                        )
                      )}
                      {s.workout ? (
                        <p className="text-sm text-[#0D0D0D]/70 mt-1">
                          {s.workout.workoutType.name}{s.workout.details ? ` — ${s.workout.details}` : ""}
                        </p>
                      ) : (
                        <p className="text-sm text-[#0D0D0D]/60 mt-1">No workout set for this week yet</p>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <a
            href="#"
            className="block text-center rounded-full py-3 text-sm"
            style={{ backgroundColor: "#0D0D0D", color: "#F0EDE8", fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}
          >
            See you out there →
          </a>
        </div>

        {/* Footer */}
        <div className="bg-[#0D0D0D] px-8 py-4">
          <p className="text-[11px] text-white/50">RunKlub — Find people you actually want to run with.</p>
        </div>
      </div>
    </div>
  )
}
