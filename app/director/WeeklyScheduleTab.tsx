"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { type WorkoutSegment, formatWorkoutSegment, parseWorkoutStructure } from "@/lib/workouts"

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

type WorkoutOption = { id: string; name: string; description: string | null; structure: WorkoutSegment[] }
type ScheduleRow = { day_of_week: number; workout_type_id: string | null; notes: string | null }

export default function WeeklyScheduleTab({ clubId }: { clubId: string }) {
  const [workouts, setWorkouts] = useState<WorkoutOption[]>([])
  const [schedule, setSchedule] = useState<Record<number, ScheduleRow>>({})
  const [loading, setLoading] = useState(true)
  const [savingDay, setSavingDay] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      const [wt, sched] = await Promise.all([
        supabase.from("runs").select("id, title, description, structure").eq("club_id", clubId).eq("kind", "workout").order("title"),
        supabase.from("club_weekly_schedule").select("day_of_week, workout_type_id, notes").eq("club_id", clubId),
      ])
      setWorkouts(((wt.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.title, description: r.description, structure: parseWorkoutStructure(r.structure) })))
      const byDay: Record<number, ScheduleRow> = {}
      for (const row of (sched.data ?? []) as ScheduleRow[]) byDay[row.day_of_week] = row
      setSchedule(byDay)
      setLoading(false)
    }
    load()
  }, [clubId])

  const rowFor = (day: number): ScheduleRow => schedule[day] ?? { day_of_week: day, workout_type_id: null, notes: null }

  const saveDay = async (day: number, patch: Partial<ScheduleRow>) => {
    const next = { ...rowFor(day), ...patch }
    setSchedule((prev) => ({ ...prev, [day]: next }))
    setSavingDay(day)
    await supabase.from("club_weekly_schedule").upsert(
      { club_id: clubId, day_of_week: day, workout_type_id: next.workout_type_id, notes: next.notes },
      { onConflict: "club_id,day_of_week" }
    )
    setSavingDay(null)
  }

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  if (workouts.length === 0) {
    return <p className="text-sm text-white/50">Add workouts to your Workout Library first, then come back here to place them on the calendar.</p>
  }

  return (
    <div className="space-y-2">
      {DAY_LABELS.map((label, day) => {
        const row = rowFor(day)
        const selected = workouts.find((w) => w.id === row.workout_type_id) ?? null
        return (
          <div key={day} className="bg-[#1a2110] border border-[#2e3d1a] rounded-xl p-3">
            <div className="flex items-center gap-2">
              <p className="w-20 shrink-0 text-xs font-bold text-white/70">{label}</p>
              <select
                value={row.workout_type_id ?? ""}
                onChange={(e) => saveDay(day, { workout_type_id: e.target.value || null })}
                disabled={savingDay === day}
                className="flex-1 min-w-0 bg-[#1e2d12] border border-[#2e3d1a] rounded-lg text-white text-xs px-2 py-2 focus:outline-none focus:border-[#c5f135]/50 transition disabled:opacity-50"
              >
                <option value="">Rest day</option>
                {workouts.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>

            {selected && (
              <div className="mt-2 ml-[88px] space-y-1">
                {selected.structure.length > 0 && (
                  <ul className="space-y-0.5">
                    {selected.structure.map((seg, i) => (
                      <li key={i} className="text-[11px] text-[#c5f135]/70 font-semibold">{formatWorkoutSegment(seg)}</li>
                    ))}
                  </ul>
                )}
                {selected.description && <p className="text-[11px] text-white/50 leading-relaxed">{selected.description}</p>}
              </div>
            )}

            <input
              value={row.notes ?? ""}
              onChange={(e) => setSchedule((prev) => ({ ...prev, [day]: { ...rowFor(day), notes: e.target.value } }))}
              onBlur={(e) => saveDay(day, { notes: e.target.value || null })}
              placeholder="Notes for this day (optional)"
              className="mt-2 ml-[88px] w-[calc(100%-88px)] bg-[#1e2d12] border border-[#2e3d1a] rounded-lg text-white text-xs px-2 py-1.5 placeholder-white/25 focus:outline-none focus:border-[#c5f135]/50 transition"
            />
          </div>
        )
      })}
    </div>
  )
}
