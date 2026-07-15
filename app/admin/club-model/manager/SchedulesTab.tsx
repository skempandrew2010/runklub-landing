"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Trash2, Pencil } from "lucide-react"
import { fetchClubModelData, insertRow, deleteRow, updateRow } from "@/lib/clubModel/api"
import type { PaceGroup, TrainingSchedule, TrainingScheduleRegion, Region, WorkoutType, ScheduledWorkout } from "@/lib/clubModel/types"
import { DAYS_OF_WEEK } from "@/lib/clubModel/types"
import { currentWeekMonday, formatWeekRange } from "@/lib/clubModel/week"
import { resolveScheduledWorkout } from "@/lib/clubModel/resolveWorkout"
import { Card, Select, Input, TextArea, Button, Row } from "./ui"

function RegionCheckboxes({
  regions,
  selected,
  onToggle,
  onSelectAll,
}: {
  regions: Region[]
  selected: Set<string>
  onToggle: (regionId: string) => void
  onSelectAll: () => void
}) {
  const allSelected = regions.length > 0 && regions.every((r) => selected.has(r.id))
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={onSelectAll}
        className={`px-2.5 py-1 rounded-full text-xs font-bold border transition ${
          allSelected ? "bg-white/10 border-white/20 text-white" : "bg-[#1a2110] border-[#2e3d1a] text-white/60 hover:text-white/70"
        }`}
      >
        Select all
      </button>
      {regions.map((r) => (
        <button
          key={r.id}
          onClick={() => onToggle(r.id)}
          className={`px-2.5 py-1 rounded-full text-xs font-bold border transition ${
            selected.has(r.id)
              ? "bg-[#c5f135] border-[#c5f135] text-[#1a2110]"
              : "bg-[#1a2110] border-[#2e3d1a] text-white/60 hover:border-[#c5f135]/40"
          }`}
        >
          {r.name}
        </button>
      ))}
    </div>
  )
}

export default function SchedulesTab({ clubId }: { clubId: string }) {
  const [paceGroups, setPaceGroups] = useState<PaceGroup[]>([])
  const [schedules, setSchedules] = useState<TrainingSchedule[]>([])
  const [scheduleRegions, setScheduleRegions] = useState<TrainingScheduleRegion[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [workoutTypes, setWorkoutTypes] = useState<WorkoutType[]>([])
  const [scheduledWorkouts, setScheduledWorkouts] = useState<ScheduledWorkout[]>([])
  const [loading, setLoading] = useState(true)

  const [newSchedule, setNewSchedule] = useState<Record<string, { day_of_week: string; regionIds: Set<string> }>>({})
  const [newWorkout, setNewWorkout] = useState<Record<string, { workout_type_id: string; sameAsGroupId: string; week_of: string; details: string; isInPerson: boolean }>>({})
  const [editingWorkout, setEditingWorkout] = useState<Record<string, string | null>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const thisWeek = currentWeekMonday()

  const load = async () => {
    const data = await fetchClubModelData(clubId)
    setPaceGroups(data.pace_groups.slice().sort((a, b) => a.pace_min - b.pace_min))
    setSchedules(data.training_schedules)
    setScheduleRegions(data.training_schedule_regions)
    setRegions(data.regions.slice().sort((a, b) => a.name.localeCompare(b.name)))
    setWorkoutTypes(data.workout_types.slice().sort((a, b) => a.name.localeCompare(b.name)))
    setScheduledWorkouts(data.scheduled_workouts.slice().sort((a, b) => b.week_of.localeCompare(a.week_of)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const draftFor = (paceGroupId: string) => newSchedule[paceGroupId] ?? { day_of_week: "", regionIds: new Set<string>() }

  const toggleDraftRegion = (paceGroupId: string, regionId: string) => {
    setNewSchedule((prev) => {
      const draft = draftFor(paceGroupId)
      const next = new Set(draft.regionIds)
      if (next.has(regionId)) next.delete(regionId); else next.add(regionId)
      return { ...prev, [paceGroupId]: { ...draft, regionIds: next } }
    })
  }

  const selectAllDraftRegions = (paceGroupId: string) => {
    setNewSchedule((prev) => {
      const draft = draftFor(paceGroupId)
      const allSelected = regions.length > 0 && regions.every((r) => draft.regionIds.has(r.id))
      return { ...prev, [paceGroupId]: { ...draft, regionIds: allSelected ? new Set() : new Set(regions.map((r) => r.id)) } }
    })
  }

  const addSchedule = async (paceGroupId: string) => {
    const draft = draftFor(paceGroupId)
    if (!draft.day_of_week) return
    const created = await insertRow("training_schedules", { pace_group_id: paceGroupId, day_of_week: draft.day_of_week }, clubId)
    const scheduleId = created[0].id
    await Promise.all(
      Array.from(draft.regionIds).map((regionId) => insertRow("training_schedule_regions", { training_schedule_id: scheduleId, region_id: regionId }, clubId))
    )
    setNewSchedule((p) => ({ ...p, [paceGroupId]: { day_of_week: "", regionIds: new Set() } }))
    load()
  }

  const deleteSchedule = async (id: string) => {
    await deleteRow("training_schedules", { id }, clubId)
    load()
  }

  const toggleScheduleRegion = async (scheduleId: string, regionId: string) => {
    const exists = scheduleRegions.some((sr) => sr.training_schedule_id === scheduleId && sr.region_id === regionId)
    if (exists) {
      await deleteRow("training_schedule_regions", { training_schedule_id: scheduleId, region_id: regionId }, clubId)
    } else {
      await insertRow("training_schedule_regions", { training_schedule_id: scheduleId, region_id: regionId }, clubId)
    }
    load()
  }

  const selectAllScheduleRegions = async (scheduleId: string) => {
    const selected = new Set(scheduleRegions.filter((sr) => sr.training_schedule_id === scheduleId).map((sr) => sr.region_id))
    const allSelected = regions.length > 0 && regions.every((r) => selected.has(r.id))
    if (allSelected) {
      await Promise.all(regions.map((r) => deleteRow("training_schedule_regions", { training_schedule_id: scheduleId, region_id: r.id }, clubId)))
    } else {
      await Promise.all(
        regions.filter((r) => !selected.has(r.id)).map((r) => insertRow("training_schedule_regions", { training_schedule_id: scheduleId, region_id: r.id }, clubId))
      )
    }
    load()
  }

  const emptyWorkoutDraft = { workout_type_id: "", sameAsGroupId: "", week_of: "", details: "", isInPerson: true }

  const addScheduledWorkout = async (scheduleId: string) => {
    const draft = newWorkout[scheduleId]
    if (!draft?.workout_type_id && !draft?.sameAsGroupId) return
    const values = {
      training_schedule_id: scheduleId,
      workout_type_id: draft.sameAsGroupId ? null : draft.workout_type_id,
      same_as_pace_group_id: draft.sameAsGroupId || null,
      week_of: draft.week_of || thisWeek,
      details: draft.sameAsGroupId ? null : (draft.details || null),
      is_in_person: draft.isInPerson,
    }
    const editingId = editingWorkout[scheduleId]
    if (editingId) {
      await updateRow("scheduled_workouts", { id: editingId }, values, clubId)
    } else {
      await insertRow("scheduled_workouts", values, clubId)
    }
    setNewWorkout((p) => ({ ...p, [scheduleId]: emptyWorkoutDraft }))
    setEditingWorkout((p) => ({ ...p, [scheduleId]: null }))
    load()
  }

  const startEditWorkout = (scheduleId: string, w: ScheduledWorkout) => {
    setEditingWorkout((p) => ({ ...p, [scheduleId]: w.id }))
    setNewWorkout((p) => ({
      ...p,
      [scheduleId]: {
        workout_type_id: w.workout_type_id ?? "",
        sameAsGroupId: w.same_as_pace_group_id ?? "",
        week_of: w.week_of,
        details: w.details ?? "",
        isInPerson: w.is_in_person,
      },
    }))
  }

  const cancelEditWorkout = (scheduleId: string) => {
    setEditingWorkout((p) => ({ ...p, [scheduleId]: null }))
    setNewWorkout((p) => ({ ...p, [scheduleId]: emptyWorkoutDraft }))
  }

  const deleteScheduledWorkout = async (id: string) => {
    await deleteRow("scheduled_workouts", { id }, clubId)
    load()
  }

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  return (
    <div className="space-y-6">
      {paceGroups.length === 0 && (
        <Card><p className="text-sm text-white/50">Add a pace group first, on the Pace Groups tab.</p></Card>
      )}

      {paceGroups.map((group) => {
        const groupSchedules = schedules
          .filter((s) => s.pace_group_id === group.id)
          .sort((a, b) => DAYS_OF_WEEK.indexOf(a.day_of_week as typeof DAYS_OF_WEEK[number]) - DAYS_OF_WEEK.indexOf(b.day_of_week as typeof DAYS_OF_WEEK[number]))
        const draft = draftFor(group.id)

        return (
          <Card key={group.id}>
            <h3 className="font-black text-white mb-3">{group.name}</h3>

            <div className="space-y-2">
              {groupSchedules.length === 0 && (
                <p className="text-sm text-white/50">No weekly schedule set for this pace group yet.</p>
              )}
              {groupSchedules.map((schedule) => {
                const workouts = scheduledWorkouts.filter((w) => w.training_schedule_id === schedule.id)
                const workoutDraft = newWorkout[schedule.id] ?? emptyWorkoutDraft
                const editingWorkoutId = editingWorkout[schedule.id] ?? null
                const otherGroups = paceGroups.filter((g) => g.id !== group.id)
                const selectedRegionIds = new Set(scheduleRegions.filter((sr) => sr.training_schedule_id === schedule.id).map((sr) => sr.region_id))
                const selectedRegionNames = regions.filter((r) => selectedRegionIds.has(r.id)).map((r) => r.name)
                const isExpanded = expandedId === schedule.id

                return (
                  <div key={schedule.id} className="bg-[#1a2110] border border-[#2e3d1a] rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <button
                        onClick={() => setExpandedId((prev) => (prev === schedule.id ? null : schedule.id))}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-white/50 shrink-0" /> : <ChevronRight className="w-4 h-4 text-white/50 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{schedule.day_of_week}s</p>
                          <p className="text-xs text-white/60 truncate">
                            {selectedRegionNames.length > 0 ? selectedRegionNames.join(", ") : "No regions selected"}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => deleteSchedule(schedule.id)}
                        className="p-1.5 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-400/10 transition shrink-0"
                        title="Delete slot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-[#2e3d1a] p-3 space-y-3">
                        <div>
                          <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-1.5">Regions</p>
                          <RegionCheckboxes
                            regions={regions}
                            selected={selectedRegionIds}
                            onToggle={(regionId) => toggleScheduleRegion(schedule.id, regionId)}
                            onSelectAll={() => selectAllScheduleRegions(schedule.id)}
                          />
                        </div>

                        <div>
                          <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-1.5">This week&rsquo;s workout</p>
                          <div className="space-y-1.5">
                            {workouts.length === 0 && <p className="text-xs text-white/50">Nothing scheduled yet.</p>}
                            {workouts.map((w) => {
                              const resolved = resolveScheduledWorkout(w, {
                                training_schedules: schedules,
                                scheduled_workouts: scheduledWorkouts,
                                workout_types: workoutTypes,
                                pace_groups: paceGroups,
                              })
                              const label = resolved
                                ? resolved.sameAsGroup
                                  ? `Same as ${resolved.sameAsGroup.name} — ${resolved.workoutType.name}`
                                  : resolved.workoutType.name
                                : w.same_as_pace_group_id
                                  ? "Linked group has no workout set yet"
                                  : "Unknown workout"
                              return (
                                <div key={w.id} className="flex items-center justify-between gap-2 bg-[#1e2d12] border border-[#2e3d1a] rounded-lg px-3 py-1.5">
                                  <div>
                                    <p className="text-[10px] text-white/50">{formatWeekRange(w.week_of)}</p>
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-xs font-bold text-white">{label}</p>
                                      <span className={`text-[9px] font-black uppercase tracking-wide shrink-0 ${w.is_in_person ? "text-[#c5f135]/70" : "text-white/50"}`}>
                                        {w.is_in_person ? "In person" : "On your own"}
                                      </span>
                                    </div>
                                    {resolved?.details && <p className="text-xs text-white/60">{resolved.details}</p>}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => startEditWorkout(schedule.id, w)}
                                      className="p-1.5 rounded-lg text-white/50 hover:text-[#c5f135] hover:bg-white/5 transition"
                                      title="Edit"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <Button variant="danger" onClick={() => deleteScheduledWorkout(w.id)}>Remove</Button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {editingWorkoutId && (
                          <p className="text-xs font-bold text-[#c5f135] uppercase tracking-widest">Editing {formatWeekRange(workoutDraft.week_of || thisWeek)}</p>
                        )}

                        <div className="flex items-center gap-4 flex-wrap">
                          <label className="flex items-center gap-1.5 text-xs font-bold text-white/50">
                            <input
                              type="checkbox"
                              checked={!!workoutDraft.sameAsGroupId}
                              onChange={(e) => setNewWorkout((p) => ({
                                ...p,
                                [schedule.id]: { ...workoutDraft, sameAsGroupId: e.target.checked ? (otherGroups[0]?.id ?? "") : "", workout_type_id: "" },
                              }))}
                              className="accent-[#c5f135]"
                            />
                            Same as another group
                          </label>
                          <label className="flex items-center gap-1.5 text-xs font-bold text-white/50">
                            <input
                              type="checkbox"
                              checked={workoutDraft.isInPerson}
                              onChange={(e) => setNewWorkout((p) => ({ ...p, [schedule.id]: { ...workoutDraft, isInPerson: e.target.checked } }))}
                              className="accent-[#c5f135]"
                            />
                            In person
                          </label>
                        </div>

                        <Row>
                          {workoutDraft.sameAsGroupId ? (
                            <div className="min-w-[160px]">
                              <Select
                                value={workoutDraft.sameAsGroupId}
                                onChange={(e) => setNewWorkout((p) => ({ ...p, [schedule.id]: { ...workoutDraft, sameAsGroupId: e.target.value } }))}
                              >
                                {otherGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                              </Select>
                            </div>
                          ) : (
                            <div className="min-w-[160px]">
                              <Select
                                value={workoutDraft.workout_type_id}
                                onChange={(e) => setNewWorkout((p) => ({ ...p, [schedule.id]: { ...workoutDraft, workout_type_id: e.target.value } }))}
                              >
                                <option value="">Workout type</option>
                                {workoutTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </Select>
                            </div>
                          )}
                          <div className="w-40">
                            <Input
                              type="date"
                              value={workoutDraft.week_of || thisWeek}
                              onChange={(e) => setNewWorkout((p) => ({ ...p, [schedule.id]: { ...workoutDraft, week_of: e.target.value } }))}
                            />
                            <p className="text-[9px] text-white/50 mt-0.5">{formatWeekRange(workoutDraft.week_of || thisWeek)}</p>
                          </div>
                          {!workoutDraft.sameAsGroupId && (
                            <div className="flex-1 min-w-[200px]">
                              <TextArea
                                placeholder="Details, e.g. 6 x 800m @ 5k pace"
                                rows={1}
                                value={workoutDraft.details}
                                onChange={(e) => setNewWorkout((p) => ({ ...p, [schedule.id]: { ...workoutDraft, details: e.target.value } }))}
                              />
                            </div>
                          )}
                          <Button onClick={() => addScheduledWorkout(schedule.id)}>
                            {editingWorkoutId ? "Save changes" : "Add workout"}
                          </Button>
                          {editingWorkoutId && (
                            <Button variant="ghost" onClick={() => cancelEditWorkout(schedule.id)}>Cancel</Button>
                          )}
                        </Row>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

          </Card>
        )
      })}
    </div>
  )
}
