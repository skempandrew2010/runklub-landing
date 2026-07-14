"use client"

import { useEffect, useState } from "react"
import { fetchClubModelData, insertRow, deleteRow } from "@/lib/clubModel/api"
import { CLUB_ID } from "@/lib/clubModel/constants"
import type { WorkoutType } from "@/lib/clubModel/types"
import { Card, SectionTitle, Input, TextArea, Button } from "./ui"

export default function WorkoutsTab() {
  const [workouts, setWorkouts] = useState<WorkoutType[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Partial<WorkoutType>>({})

  const load = async () => {
    const data = await fetchClubModelData()
    setWorkouts(data.workout_types.slice().sort((a, b) => a.name.localeCompare(b.name)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const addWorkout = async () => {
    if (!draft.name?.trim()) return
    await insertRow("workout_types", {
      club_id: CLUB_ID,
      name: draft.name.trim(),
      description: draft.description ?? null,
    })
    setDraft({})
    load()
  }

  const deleteWorkout = async (id: string) => {
    await deleteRow("workout_types", { id })
    load()
  }

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle>Add a workout type</SectionTitle>
        <div className="space-y-2">
          <Input placeholder="Name, e.g. Tempo" value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <TextArea placeholder="Description" value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} />
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
                <p className="text-sm font-bold text-white">{w.name}</p>
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
