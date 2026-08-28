"use client"

import { useEffect, useState } from "react"
import { GripVertical, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Card, SectionTitle, Input, TextArea, Button } from "./ui"
import { type WorkoutSegment, formatWorkoutSegment, parseWorkoutStructure, maskMMSS, PACE_OPTIONS, DISTANCE_UNIT_OPTIONS, TIME_UNIT, WORKOUT_DRAG_MIME } from "@/lib/workouts"
import { Select } from "@/components/Select"

type WorkoutEntry = { id: string; title: string; description: string | null; structure: WorkoutSegment[] }
type WorkoutDraft = { title: string; description: string; segments: WorkoutSegment[] }

const EMPTY_SEGMENT: WorkoutSegment = { reps: "", distance_time: "", unit: "", pace: "", rest: "", rest_unit: "" }
const EMPTY_DRAFT: WorkoutDraft = { title: "", description: "", segments: [] }

function hasContent(s: WorkoutSegment) {
  return !!(s.reps || s.distance_time || s.unit || s.pace || s.rest || s.rest_unit)
}

function WorkoutFields({
  draft,
  onChange,
  customPaces,
  titlePlaceholder = "Name, e.g. Tempo",
}: {
  draft: WorkoutDraft
  onChange: (updater: (d: WorkoutDraft) => WorkoutDraft) => void
  customPaces: string[]
  titlePlaceholder?: string
}) {
  const addSegment = () => onChange((d) => ({ ...d, segments: [...d.segments, { ...EMPTY_SEGMENT }] }))
  const updateSegment = (i: number, field: keyof WorkoutSegment, value: string) =>
    onChange((d) => ({ ...d, segments: d.segments.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)) }))
  const removeSegment = (i: number) => onChange((d) => ({ ...d, segments: d.segments.filter((_, idx) => idx !== i) }))

  return (
    <div className="space-y-3">
      <Input placeholder={titlePlaceholder} value={draft.title} onChange={(e) => onChange((d) => ({ ...d, title: e.target.value }))} />
      <TextArea
        placeholder="Free-flowing description (optional) - context, coaching notes, anything not captured by the structure below"
        value={draft.description}
        onChange={(e) => onChange((d) => ({ ...d, description: e.target.value }))}
        rows={2}
      />

      <div>
        <p className="text-xs font-semibold text-white/50 mb-2">
          Structured segments <span className="text-white/25 font-normal">(optional - reps × distance/time @ pace, rest)</span>
        </p>
        {draft.segments.length > 0 && (
          <div className="space-y-2.5 mb-2">
            {draft.segments.map((seg, i) => {
              const segField = "bg-[#1a2110] border border-[#2e3d1a] rounded-lg text-white text-xs placeholder-white/30 focus:outline-none focus:border-[#c5f135]/50 transition px-1 py-1.5 min-w-0 flex-1 basis-0"
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-1">
                    <input placeholder="Reps" value={seg.reps} onChange={(e) => updateSegment(i, "reps", e.target.value)}
                      className={`${segField} text-center`} />
                    <span className="text-white/40 text-xs font-black shrink-0">×</span>
                    <input placeholder={seg.unit === TIME_UNIT ? "3:00" : "800"} value={seg.distance_time}
                      onChange={(e) => updateSegment(i, "distance_time", seg.unit === TIME_UNIT ? maskMMSS(e.target.value) : e.target.value)}
                      className={`${segField} text-center`} />
                    <Select value={seg.unit} onChange={(e) => updateSegment(i, "unit", e.target.value)}
                      className={segField}>
                      <option value="">unit</option>
                      <optgroup label="Distance">
                        {DISTANCE_UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </optgroup>
                      <option value={TIME_UNIT}>time (mm:ss)</option>
                    </Select>
                    <span className="text-white/40 text-xs font-black shrink-0">@</span>
                    <Select value={seg.pace} onChange={(e) => updateSegment(i, "pace", e.target.value)}
                      className={segField}>
                      <option value="">pace</option>
                      {PACE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                      {customPaces.length > 0 && (
                        <optgroup label="Custom">
                          {customPaces.map((p) => <option key={p} value={p}>{p}</option>)}
                        </optgroup>
                      )}
                    </Select>
                    <button type="button" onClick={() => removeSegment(i)}
                      className="text-[10px] font-bold text-white/30 hover:text-red-400 transition px-1.5 py-1.5 shrink-0">
                      Delete
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-white/25 text-[10px] font-bold shrink-0 w-9 text-center">rest</span>
                    <input placeholder={seg.rest_unit === TIME_UNIT ? "1:30" : "400"} value={seg.rest}
                      onChange={(e) => updateSegment(i, "rest", seg.rest_unit === TIME_UNIT ? maskMMSS(e.target.value) : e.target.value)}
                      className={`${segField} text-center`} />
                    <Select value={seg.rest_unit} onChange={(e) => updateSegment(i, "rest_unit", e.target.value)}
                      className={segField}>
                      <option value="">unit</option>
                      <optgroup label="Distance">
                        {DISTANCE_UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </optgroup>
                      <option value={TIME_UNIT}>time (mm:ss)</option>
                    </Select>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <Button type="button" variant="ghost" onClick={addSegment}>+ Add segment</Button>
      </div>
    </div>
  )
}

export default function WorkoutsTab({ clubId, onWorkoutsChanged }: { clubId: string; onWorkoutsChanged?: () => void }) {
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([])
  const [customPaces, setCustomPaces] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<WorkoutDraft>(EMPTY_DRAFT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<WorkoutDraft | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const load = async () => {
    const [wt, cp] = await Promise.all([
      supabase.from("runs").select("id, title, description, structure").eq("club_id", clubId).eq("kind", "workout").order("title"),
      supabase.from("club_custom_paces").select("label").eq("club_id", clubId).order("label"),
    ])
    setWorkouts(
      ((wt.data ?? []) as any[]).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        structure: parseWorkoutStructure(r.structure),
      }))
    )
    setCustomPaces(((cp.data ?? []) as { label: string }[]).map((r) => r.label))
    setLoading(false)
  }

  useEffect(() => { load() }, [clubId])

  const addWorkout = async () => {
    if (!draft.title.trim()) return
    const segments = draft.segments.filter(hasContent)
    await supabase.from("runs").insert({
      club_id: clubId,
      title: draft.title.trim(),
      description: draft.description || null,
      structure: segments.length > 0 ? segments : null,
      kind: "workout",
    })
    setDraft(EMPTY_DRAFT)
    await load()
    onWorkoutsChanged?.()
  }

  const deleteWorkout = async (id: string) => {
    await supabase.from("runs").delete().eq("id", id)
    if (editingId === id) { setEditingId(null); setEditDraft(null) }
    await load()
    onWorkoutsChanged?.()
  }

  const openEdit = (w: WorkoutEntry) => {
    setEditingId(w.id)
    setEditDraft({ title: w.title, description: w.description ?? "", segments: w.structure })
  }

  const closeEdit = () => { setEditingId(null); setEditDraft(null) }

  const saveEdit = async () => {
    if (!editingId || !editDraft || !editDraft.title.trim()) return
    setSavingEdit(true)
    const segments = editDraft.segments.filter(hasContent)
    await supabase.from("runs").update({
      title: editDraft.title.trim(),
      description: editDraft.description || null,
      structure: segments.length > 0 ? segments : null,
    }).eq("id", editingId)
    setSavingEdit(false)
    closeEdit()
    await load()
    onWorkoutsChanged?.()
  }

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle>Workout library</SectionTitle>
        {workouts.length > 0 && (
          <p className="text-xs text-white/35 mb-3 -mt-1">Tap a workout to edit it, or drag it onto a day in the Weekly Training Schedule.</p>
        )}
        <div className="space-y-2">
          {workouts.length === 0 && <p className="text-sm text-white/50">No workout types yet.</p>}
          {workouts.map((w) => (
            <div
              key={w.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(WORKOUT_DRAG_MIME, w.id)
                e.dataTransfer.effectAllowed = "copy"
              }}
              onClick={() => openEdit(w)}
              className="flex items-center justify-between gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 cursor-pointer hover:border-[#c5f135]/30 transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                <GripVertical className="w-3.5 h-3.5 text-white/20 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">{w.title}</p>
                  {w.structure.length > 0 && (
                    <p className="text-xs text-[#c5f135]/70 mt-0.5">{w.structure.map(formatWorkoutSegment).join(" · ")}</p>
                  )}
                  {w.description && <p className="text-xs text-white/60 mt-0.5">{w.description}</p>}
                </div>
              </div>
              <Button variant="danger" onClick={(e) => { e.stopPropagation(); deleteWorkout(w.id) }}>Delete</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Add a workout type</SectionTitle>
        <div className="space-y-3">
          <WorkoutFields draft={draft} onChange={setDraft} customPaces={customPaces} />
          <Button onClick={addWorkout}>Add workout type</Button>
        </div>
      </Card>

      {editingId && editDraft && (
        <div
          onClick={closeEdit}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[85vh] flex flex-col bg-[#1e2d12] border border-[#2e3d1a] rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 animate-[fadeUp_0.25s_ease-out_forwards]"
          >
            <div className="flex items-center justify-between mb-4 shrink-0">
              <p className="text-sm font-black text-white">Edit workout</p>
              <button onClick={closeEdit} className="text-white/30 hover:text-white/60 transition p-1" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto">
              <WorkoutFields
                draft={editDraft}
                onChange={(updater) => setEditDraft((d) => (d ? updater(d) : d))}
                customPaces={customPaces}
              />
            </div>
            <div className="flex gap-2 pt-4 shrink-0">
              <Button onClick={saveEdit} disabled={savingEdit || !editDraft.title.trim()}>
                {savingEdit ? "Saving…" : "Save changes"}
              </Button>
              <Button variant="ghost" onClick={closeEdit}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
