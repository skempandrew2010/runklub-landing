"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Card, SectionTitle, Input, TextArea, Button } from "./ui"

type WorkoutEntry = { id: string; title: string; description: string | null }

export default function WorkoutsTab({ clubId }: { clubId: string }) {
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<{ title: string; description: string }>({ title: "", description: "" })

  const load = async () => {
    const { data } = await supabase
      .from("runs")
      .select("id, title, description")
      .eq("club_id", clubId)
      .eq("kind", "workout")
      .order("title")
    setWorkouts(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [clubId])

  const addWorkout = async () => {
    if (!draft.title.trim()) return
    await supabase.from("runs").insert({
      club_id: clubId,
      title: draft.title.trim(),
      description: draft.description || null,
      kind: "workout",
    })
    setDraft({ title: "", description: "" })
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
        <div className="space-y-2">
          <Input placeholder="Name, e.g. Tempo" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <TextArea placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} />
          <Button onClick={addWorkout}>Add workout type</Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>Workout library</SectionTitle>
        <div className="space-y-2">
          {workouts.length === 0 && <p className="text-sm text-white/50">No workout types yet.</p>}
          {workouts.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
              <div>
                <p className="text-sm font-bold text-white">{w.title}</p>
                {w.description && <p className="text-xs text-white/60">{w.description}</p>}
              </div>
              <Button variant="danger" onClick={() => deleteWorkout(w.id)}>Delete</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
