"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Card, SectionTitle, Input, TextArea, Button } from "./ui"
import { type WorkoutSegment, formatWorkoutSegment, parseWorkoutStructure, PACE_OPTIONS, UNIT_OPTIONS } from "@/lib/workouts"

type WorkoutEntry = { id: string; title: string; description: string | null; structure: WorkoutSegment[] }

const EMPTY_SEGMENT: WorkoutSegment = { reps: "", distance_time: "", unit: "", pace: "" }

export default function WorkoutsTab({ clubId }: { clubId: string }) {
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<{ title: string; description: string; segments: WorkoutSegment[] }>({
    title: "",
    description: "",
    segments: [],
  })

  const load = async () => {
    const { data } = await supabase
      .from("runs")
      .select("id, title, description, structure")
      .eq("club_id", clubId)
      .eq("kind", "workout")
      .order("title")
    setWorkouts(
      ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        structure: parseWorkoutStructure(r.structure),
      }))
    )
    setLoading(false)
  }

  useEffect(() => { load() }, [clubId])

  const addSegment = () => setDraft((d) => ({ ...d, segments: [...d.segments, { ...EMPTY_SEGMENT }] }))
  const updateSegment = (i: number, field: keyof WorkoutSegment, value: string) =>
    setDraft((d) => ({ ...d, segments: d.segments.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)) }))
  const removeSegment = (i: number) => setDraft((d) => ({ ...d, segments: d.segments.filter((_, idx) => idx !== i) }))

  const addWorkout = async () => {
    if (!draft.title.trim()) return
    const segments = draft.segments.filter((s) => s.reps || s.distance_time || s.unit || s.pace)
    await supabase.from("runs").insert({
      club_id: clubId,
      title: draft.title.trim(),
      description: draft.description || null,
      structure: segments.length > 0 ? segments : null,
      kind: "workout",
    })
    setDraft({ title: "", description: "", segments: [] })
    load()
  }

  const deleteWorkout = async (id: string) => {
    await supabase.from("runs").delete().eq("id", id)
    load()
  }

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle>Add a workout type</SectionTitle>
        <div className="space-y-3">
          <Input placeholder="Name, e.g. Tempo" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <TextArea
            placeholder="Free-flowing description (optional) — context, coaching notes, anything not captured by the structure below"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            rows={2}
          />

          <div>
            <p className="text-xs font-semibold text-white/50 mb-2">
              Structured segments <span className="text-white/25 font-normal">(optional — reps × distance/time @ pace)</span>
            </p>
            {draft.segments.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {draft.segments.map((seg, i) => {
                  const segField = "bg-[#1a2110] border border-[#2e3d1a] rounded-lg text-white text-xs placeholder-white/30 focus:outline-none focus:border-[#c5f135]/50 transition px-1 py-1.5 min-w-0 flex-1 basis-0"
                  return (
                    <div key={i} className="flex items-center gap-1">
                      <input placeholder="Reps" value={seg.reps} onChange={(e) => updateSegment(i, "reps", e.target.value)}
                        className={`${segField} text-center`} />
                      <span className="text-white/40 text-xs font-black shrink-0">×</span>
                      <input placeholder="800" value={seg.distance_time} onChange={(e) => updateSegment(i, "distance_time", e.target.value)}
                        className={`${segField} text-center`} />
                      <select value={seg.unit} onChange={(e) => updateSegment(i, "unit", e.target.value)}
                        className={segField}>
                        <option value="">unit</option>
                        {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <span className="text-white/40 text-xs font-black shrink-0">@</span>
                      <select value={seg.pace} onChange={(e) => updateSegment(i, "pace", e.target.value)}
                        className={segField}>
                        <option value="">pace</option>
                        {PACE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button type="button" onClick={() => removeSegment(i)} className="text-white/30 hover:text-red-400 transition p-1 shrink-0" aria-label="Remove segment">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <Button type="button" variant="ghost" onClick={addSegment}>+ Add segment</Button>
          </div>

          <Button onClick={addWorkout}>Add workout type</Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>Workout library</SectionTitle>
        <div className="space-y-2">
          {workouts.length === 0 && <p className="text-sm text-white/50">No workout types yet.</p>}
          {workouts.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">{w.title}</p>
                {w.structure.length > 0 && (
                  <p className="text-xs text-[#c5f135]/70 mt-0.5">{w.structure.map(formatWorkoutSegment).join(" · ")}</p>
                )}
                {w.description && <p className="text-xs text-white/60 mt-0.5">{w.description}</p>}
              </div>
              <Button variant="danger" onClick={() => deleteWorkout(w.id)}>Delete</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
