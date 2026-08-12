"use client"

import { useEffect, useState } from "react"
import { Calendar, ChevronLeft, ChevronRight, X, Lock } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { mondayOf } from "@/utils/dates"
import { type WorkoutSegment, formatWorkoutSegment, parseWorkoutStructure, WORKOUT_DRAG_MIME } from "@/lib/workouts"

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
// day_of_week is stored 0=Sun..6=Sat, but the calendar reads Monday-first.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const WEEKS_AHEAD = 20

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function fmtShort(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

type WorkoutOption = { id: string; name: string; description: string | null; structure: WorkoutSegment[] }
type ScheduleRow = { day_of_week: number; workout_type_id: string | null; notes: string | null }
type RunMarker = { hasRun: boolean; inPerson: boolean }
type PaceGroup = { id: string; name: string }

export default function WeeklyScheduleTab({ clubId, paceGroupIds, readOnly }: { clubId: string; paceGroupIds?: string[]; readOnly?: boolean }) {
  const thisMonday = mondayOf()
  const weekOptions = Array.from({ length: WEEKS_AHEAD }, (_, i) => addDays(thisMonday, i * 7))

  const [paceGroups, setPaceGroups] = useState<PaceGroup[]>([])
  const [paceGroupsLoading, setPaceGroupsLoading] = useState(true)
  const [selectedPaceGroupId, setSelectedPaceGroupId] = useState<string | null>(null)
  const [selectedWeek, setSelectedWeek] = useState(thisMonday)
  const [workouts, setWorkouts] = useState<WorkoutOption[]>([])
  const [workoutsLoading, setWorkoutsLoading] = useState(true)
  const [schedule, setSchedule] = useState<Record<number, ScheduleRow>>({})
  const [runsByDay, setRunsByDay] = useState<Record<number, RunMarker>>({})
  const [loading, setLoading] = useState(true)
  const [savingDay, setSavingDay] = useState<number | null>(null)
  const [dragOverDay, setDragOverDay] = useState<number | null>(null)
  const [pickerDay, setPickerDay] = useState<number | null>(null)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewSchedule, setOverviewSchedule] = useState<Record<string, Record<number, string | null>>>({})

  useEffect(() => {
    let query = supabase.from("pace_groups").select("id, name").eq("club_id", clubId).order("pace_min")
    if (paceGroupIds) query = query.in("id", paceGroupIds.length > 0 ? paceGroupIds : ["00000000-0000-0000-0000-000000000000"])
    query.then(({ data }) => {
        const groups = (data ?? []) as PaceGroup[]
        setPaceGroups(groups)
        setSelectedPaceGroupId((prev) => prev ?? groups[0]?.id ?? null)
        setPaceGroupsLoading(false)
      })
    supabase.from("runs").select("id, title, description, structure").eq("club_id", clubId).eq("kind", "workout").order("title")
      .then(({ data }) => {
        setWorkouts(((data ?? []) as any[]).map((r) => ({ id: r.id, name: r.title, description: r.description, structure: parseWorkoutStructure(r.structure) })))
        setWorkoutsLoading(false)
      })
  }, [clubId, paceGroupIds?.join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedPaceGroupId) return
    const load = async () => {
      setLoading(true)
      const weekEnd = addDays(selectedWeek, 6)
      const [sched, runs] = await Promise.all([
        supabase.from("club_weekly_schedule").select("day_of_week, workout_type_id, notes")
          .eq("pace_group_id", selectedPaceGroupId).eq("week_of", selectedWeek),
        supabase.from("runs").select("date, is_in_person, pace_group_ids").eq("club_id", clubId).eq("kind", "run")
          .gte("date", selectedWeek).lte("date", weekEnd),
      ])
      const byDay: Record<number, ScheduleRow> = {}
      for (const row of (sched.data ?? []) as ScheduleRow[]) byDay[row.day_of_week] = row
      setSchedule(byDay)
      const byDayRuns: Record<number, RunMarker> = {}
      for (const r of (runs.data ?? []) as { date: string; is_in_person: boolean; pace_group_ids: string[] | null }[]) {
        if (r.pace_group_ids && r.pace_group_ids.length > 0 && !r.pace_group_ids.includes(selectedPaceGroupId)) continue
        const day = new Date(`${r.date}T00:00:00`).getDay()
        const prev = byDayRuns[day] ?? { hasRun: false, inPerson: false }
        byDayRuns[day] = { hasRun: true, inPerson: prev.inPerson || !!r.is_in_person }
      }
      setRunsByDay(byDayRuns)
      setLoading(false)
    }
    load()
  }, [clubId, selectedPaceGroupId, selectedWeek])

  const rowFor = (day: number): ScheduleRow => schedule[day] ?? { day_of_week: day, workout_type_id: null, notes: null }

  const saveDay = async (day: number, patch: Partial<ScheduleRow>) => {
    if (!selectedPaceGroupId) return
    const next = { ...rowFor(day), ...patch }
    setSchedule((prev) => ({ ...prev, [day]: next }))
    setSavingDay(day)
    await supabase.from("club_weekly_schedule").upsert(
      { club_id: clubId, pace_group_id: selectedPaceGroupId, day_of_week: day, week_of: selectedWeek, workout_type_id: next.workout_type_id, notes: next.notes },
      { onConflict: "pace_group_id,day_of_week,week_of" }
    )
    setSavingDay(null)
  }

  const openOverview = async () => {
    if (!selectedPaceGroupId) return
    setOverviewOpen(true)
    setOverviewLoading(true)
    const { data } = await supabase
      .from("club_weekly_schedule")
      .select("day_of_week, week_of, workout_type_id")
      .eq("pace_group_id", selectedPaceGroupId)
      .gte("week_of", thisMonday)
      .lte("week_of", weekOptions[weekOptions.length - 1])
    const byWeek: Record<string, Record<number, string | null>> = {}
    for (const row of (data ?? []) as { day_of_week: number; week_of: string; workout_type_id: string | null }[]) {
      if (!byWeek[row.week_of]) byWeek[row.week_of] = {}
      byWeek[row.week_of][row.day_of_week] = row.workout_type_id
    }
    setOverviewSchedule(byWeek)
    setOverviewLoading(false)
  }

  const jumpToWeek = (monday: string) => {
    setSelectedWeek(monday)
    setOverviewOpen(false)
  }

  const weekIndex = weekOptions.indexOf(selectedWeek)

  if (paceGroupsLoading || workoutsLoading) return <p className="text-white/60 text-sm">Loading…</p>

  if (paceGroups.length === 0) {
    return <p className="text-sm text-white/50">Add pace groups in Setup first, then come back here to build a schedule for each.</p>
  }

  if (workouts.length === 0) {
    return <p className="text-sm text-white/50">Add workouts to your Workout Library first, then come back here to place them on the calendar.</p>
  }

  return (
    <div>
      {readOnly && (
        <div className="flex items-center gap-1.5 mb-3 text-[10px] font-bold text-white/30 uppercase tracking-widest">
          <Lock className="w-2.5 h-2.5" /> Read-only — your director edits this
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {paceGroups.map((pg) => (
          <button
            key={pg.id}
            type="button"
            onClick={() => setSelectedPaceGroupId(pg.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              selectedPaceGroupId === pg.id
                ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]"
                : "bg-[#1a2110] text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"
            }`}
          >
            {pg.name}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          type="button"
          onClick={() => weekIndex > 0 && setSelectedWeek(weekOptions[weekIndex - 1])}
          disabled={weekIndex <= 0}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-[#2e3d1a] hover:text-white transition disabled:opacity-20 disabled:hover:bg-transparent shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="flex-1 min-w-0 text-center text-xs font-bold text-white truncate">
          {weekIndex === 0 ? "This week" : `Week ${weekIndex + 1}`} · {fmtShort(selectedWeek)}–{fmtShort(addDays(selectedWeek, 6))}
        </p>
        <button
          type="button"
          onClick={() => weekIndex < weekOptions.length - 1 && setSelectedWeek(weekOptions[weekIndex + 1])}
          disabled={weekIndex >= weekOptions.length - 1}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-[#2e3d1a] hover:text-white transition disabled:opacity-20 disabled:hover:bg-transparent shrink-0"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={openOverview}
          aria-label={`View ${WEEKS_AHEAD}-week calendar`}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-[#2e3d1a] hover:text-[#c5f135] transition shrink-0"
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <p className="text-white/60 text-sm">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-2">
          {DAY_ORDER.map((day, i) => {
            const label = DAY_LABELS[day]
            const dateStr = addDays(selectedWeek, i)
            const row = rowFor(day)
            const selected = workouts.find((w) => w.id === row.workout_type_id) ?? null
            const runInfo = runsByDay[day]
            return (
              <div
                key={day}
                onClick={readOnly ? undefined : () => setPickerDay(day)}
                onDragOver={readOnly ? undefined : (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragOverDay(day) }}
                onDragLeave={readOnly ? undefined : () => setDragOverDay((d) => (d === day ? null : d))}
                onDrop={readOnly ? undefined : (e) => {
                  e.preventDefault()
                  setDragOverDay(null)
                  const workoutId = e.dataTransfer.getData(WORKOUT_DRAG_MIME)
                  if (workoutId) saveDay(day, { workout_type_id: workoutId })
                }}
                className={`bg-[#1a2110] border rounded-xl p-3 flex flex-col gap-2 lg:min-w-0 transition-colors ${readOnly ? "" : "cursor-pointer"} ${
                  dragOverDay === day
                    ? "border-[#c5f135] bg-[#c5f135]/5"
                    : runInfo?.inPerson
                      ? "border-yellow-400 bg-yellow-400/5"
                      : runInfo?.hasRun
                        ? "border-white/25"
                        : "border-[#2e3d1a]"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-white/70">{label} <span className="text-white/70 font-semibold">{fmtShort(dateStr)}</span></p>
                  {runInfo?.hasRun && (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${
                      runInfo.inPerson ? "bg-yellow-400 text-[#1a2110]" : "bg-white/10 text-white/50"
                    }`}>
                      RUN
                    </span>
                  )}
                </div>

                {selected ? (
                  <div className="bg-[#1e2d12] border border-[#c5f135]/25 rounded-lg px-2 py-2 space-y-1">
                    <p className="text-xs font-bold text-[#c5f135]">{selected.name}</p>
                    {selected.structure.length > 0 && (
                      <ul className="space-y-0.5">
                        {selected.structure.map((seg, i) => (
                          <li key={i} className="text-[11px] text-[#c5f135]/70 font-semibold">{formatWorkoutSegment(seg)}</li>
                        ))}
                      </ul>
                    )}
                    {selected.description && <p className="text-[11px] text-white/50 leading-relaxed">{selected.description}</p>}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); saveDay(day, { workout_type_id: null }) }}
                        disabled={savingDay === day}
                        className="text-[10px] font-bold text-white/30 hover:text-red-400 transition disabled:opacity-50"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="border border-dashed border-[#2e3d1a] rounded-lg px-2 py-3 text-center">
                    <p className="text-[11px] text-white/25">{readOnly ? "Rest day" : "Rest day — click or drag a workout here"}</p>
                  </div>
                )}

                {readOnly ? (
                  row.notes && (
                    <p className="w-full min-w-0 text-white/40 text-xs px-2 py-1.5 leading-relaxed">{row.notes}</p>
                  )
                ) : (
                  <input
                    value={row.notes ?? ""}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setSchedule((prev) => ({ ...prev, [day]: { ...rowFor(day), notes: e.target.value } }))}
                    onBlur={(e) => saveDay(day, { notes: e.target.value || null })}
                    placeholder="Notes (optional)"
                    className="w-full min-w-0 bg-[#1e2d12] border border-[#2e3d1a] rounded-lg text-white text-xs px-2 py-1.5 placeholder-white/25 focus:outline-none focus:border-[#c5f135]/50 transition"
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {!readOnly && pickerDay !== null && (
        <div
          onClick={() => setPickerDay(null)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm max-h-[75vh] flex flex-col bg-[#1e2d12] border border-[#2e3d1a] rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 animate-[fadeUp_0.25s_ease-out_forwards]"
          >
            <div className="flex items-center justify-between mb-4 shrink-0">
              <p className="text-sm font-black text-white">{DAY_LABELS[pickerDay]} — pick a workout</p>
              <button onClick={() => setPickerDay(null)} className="text-white/30 hover:text-white/60 transition p-1" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto">
              <button
                onClick={() => { saveDay(pickerDay, { workout_type_id: null }); setPickerDay(null) }}
                className="w-full text-left px-3 py-2.5 rounded-xl border border-dashed border-[#2e3d1a] text-white/50 text-xs font-semibold hover:border-white/20 transition"
              >
                Rest day (no workout)
              </button>
              {workouts.map((w) => (
                <button
                  key={w.id}
                  onClick={() => { saveDay(pickerDay, { workout_type_id: w.id }); setPickerDay(null) }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition ${
                    rowFor(pickerDay).workout_type_id === w.id
                      ? "bg-[#c5f135]/10 border-[#c5f135]/40"
                      : "bg-[#1a2110] border-[#2e3d1a] hover:border-[#c5f135]/40"
                  }`}
                >
                  <p className="text-xs font-bold text-white">{w.name}</p>
                  {w.structure.length > 0 && (
                    <p className="text-[11px] text-[#c5f135]/70 mt-0.5">{w.structure.map(formatWorkoutSegment).join(" · ")}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {overviewOpen && (
        <div
          onClick={() => setOverviewOpen(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-3xl max-h-[85vh] flex flex-col bg-[#1e2d12] border border-[#2e3d1a] rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 animate-[fadeUp_0.25s_ease-out_forwards]"
          >
            <div className="flex items-center justify-between mb-4 shrink-0">
              <p className="text-sm font-black text-white">
                {WEEKS_AHEAD}-Week Training Schedule <span className="text-[#c5f135]">· {paceGroups.find((pg) => pg.id === selectedPaceGroupId)?.name}</span>
              </p>
              <button onClick={() => setOverviewOpen(false)} className="text-white/30 hover:text-white/60 transition p-1" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            {overviewLoading ? (
              <p className="text-white/60 text-sm">Loading…</p>
            ) : (
              <div className="overflow-y-auto space-y-2">
                {weekOptions.map((monday, wi) => {
                  const weekData = overviewSchedule[monday] ?? {}
                  const isCurrent = monday === selectedWeek
                  return (
                    <button
                      key={monday}
                      onClick={() => jumpToWeek(monday)}
                      className={`w-full text-left rounded-xl border px-3 py-2.5 transition ${
                        isCurrent ? "bg-[#c5f135]/10 border-[#c5f135]/40" : "bg-[#1a2110] border-[#2e3d1a] hover:border-[#c5f135]/30"
                      }`}
                    >
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">
                        {wi === 0 ? "This week" : `Week ${wi + 1}`} · {fmtShort(monday)}–{fmtShort(addDays(monday, 6))}
                      </p>
                      <div className="grid grid-cols-7 gap-1">
                        {DAY_ORDER.map((day) => {
                          const workoutId = weekData[day]
                          const w = workoutId ? workouts.find((wt) => wt.id === workoutId) : null
                          return (
                            <div key={day} className="min-w-0">
                              <p className="text-[8px] font-bold text-white/25 uppercase text-center">{DAY_LABELS[day]}</p>
                              <p className={`text-[10px] font-semibold text-center truncate ${w ? "text-[#c5f135]" : "text-white/20"}`}>
                                {w ? w.name : "—"}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
