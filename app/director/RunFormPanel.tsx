"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, CalendarPlus, Check, Globe, Lock, Repeat2 } from "lucide-react"
import mapboxSdk from "@mapbox/mapbox-sdk/services/geocoding"


const TAG_GROUPS = [
  { label: "Pace", tags: ["Easy", "Moderate", "Fast", "All Paces"] },
  { label: "Type", tags: ["Social Run", "Long Run", "Speed Work", "Trail Run", "Race Prep", "Fun Run", "Night Run"] },
  { label: "Vibe", tags: ["Beer After", "Coffee After", "Dog Friendly", "Beginner Friendly", "No Drop", "First Timers Welcome", "Traveler Friendly", "Rain or Shine", "Stroller Friendly"] },
]

type PaceGroup = { id: string; name: string; pace_min: number; pace_max: number }
type WorkoutType = { id: string; name: string }
type Coach = { id: string; name: string }
type Region = { id: string; name: string }
type Location = { id: string; name: string; address: string | null; region_id: string }
type RunTemplate = {
  id: string; title: string; distance: string | null; meeting_point: string | null
  city: string | null; route_url: string | null; description: string | null
  tags: string[] | null; pace_group_ids: string[]; workout_type_id: string | null
  coach_id: string | null; members_only: boolean; times_used: number
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + "T00:00:00")
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().split("T")[0]
}

function getRepeatDates(start: string, total: number): string[] {
  return Array.from({ length: total }, (_, i) => addWeeks(start, i))
}

function fmtPace(minPerMile: number) {
  const m = Math.floor(minPerMile)
  const s = Math.round((minPerMile - m) * 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

export default function RunFormPanel({
  clubId,
  userId,
  runId,
  tier,
  onClose,
  onSaved,
  onGoToSetup,
}: {
  clubId: string
  userId: string
  runId: string | null
  tier?: string | null
  onClose: () => void
  onSaved: () => void
  onGoToSetup?: () => void
}) {
  const isEdit = runId !== null

  const [title, setTitle] = useState("")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [distance, setDistance] = useState("")
  const [address, setAddress] = useState("")
  const [routeUrl, setRouteUrl] = useState("")
  const [description, setDescription] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [membersOnly, setMembersOnly] = useState(false)
  const [repeatWeekly, setRepeatWeekly] = useState(false)
  const [repeatWeeks, setRepeatWeeks] = useState(4)
  const [selectedPaceGroupIds, setSelectedPaceGroupIds] = useState<string[]>([])
  const [selectedWorkoutTypeId, setSelectedWorkoutTypeId] = useState("")
  const [selectedCoachId, setSelectedCoachId] = useState("")
  const [saving, setSaving] = useState(false)

  const [paceGroups, setPaceGroups] = useState<PaceGroup[]>([])
  const [workoutTypes, setWorkoutTypes] = useState<WorkoutType[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState("")
  const [templates, setTemplates] = useState<RunTemplate[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const [pg, wt, co, tpl, regionRows] = await Promise.all([
        supabase.from("pace_groups").select("id, name, pace_min, pace_max").eq("club_id", clubId).order("pace_min"),
        supabase.from("runs").select("id, title").eq("club_id", clubId).eq("kind", "workout").order("title"),
        supabase.from("coaches").select("id, name").eq("club_id", clubId).order("name"),
        isEdit
          ? Promise.resolve({ data: [] })
          : supabase.from("run_templates")
              .select("id, title, distance, meeting_point, city, route_url, description, tags, pace_group_ids, workout_type_id, coach_id, members_only, times_used")
              .eq("club_id", clubId)
              .order("last_used_at", { ascending: false })
              .limit(8),
        supabase.from("regions").select("id, name").eq("club_id", clubId).order("name"),
      ])
      setPaceGroups((pg.data as PaceGroup[]) || [])
      setWorkoutTypes(((wt.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.title })))
      setCoaches((co.data as Coach[]) || [])
      if (!isEdit) setTemplates((tpl.data as RunTemplate[]) || [])

      const fetchedRegions = (regionRows.data as Region[]) || []
      setRegions(fetchedRegions)
      const regionIds = fetchedRegions.map((r) => r.id)
      let fetchedLocs: Location[] = []
      if (regionIds.length > 0) {
        const { data: locRows } = await supabase.from("locations").select("id, name, address, region_id").in("region_id", regionIds).order("name")
        fetchedLocs = (locRows as Location[]) || []
        setLocations(fetchedLocs)
      }

      if (isEdit && runId) {
        const { data: run } = await supabase.from("runs").select("*").eq("id", runId).single()
        if (run) {
          setTitle(run.title ?? "")
          setDate(run.date ?? "")
          setTime(run.time ?? "")
          setDistance(run.distance ?? "")
          setAddress(run.meeting_point ?? "")
          setRouteUrl(run.route_url ?? "")
          setDescription(run.description ?? "")
          setSelectedTags(run.tags ?? [])
          setMembersOnly(run.members_only ?? false)
          setSelectedPaceGroupIds(run.pace_group_ids ?? [])
          setSelectedWorkoutTypeId(run.workout_type_id ?? "")
          setSelectedCoachId(run.coach_id ?? "")
          if (run.meeting_point) {
            const match = fetchedLocs.find((l) => l.address === run.meeting_point || l.name === run.meeting_point)
            if (match) setSelectedLocationId(match.id)
          }
        }
      }
      setDataLoading(false)
    }
    load()
  }, [clubId, runId, isEdit])

  const applyTemplate = (tpl: RunTemplate) => {
    setTitle(tpl.title)
    setDistance(tpl.distance || "")
    setAddress(tpl.meeting_point || "")
    setRouteUrl(tpl.route_url || "")
    setDescription(tpl.description || "")
    setSelectedTags(tpl.tags || [])
    setSelectedPaceGroupIds(tpl.pace_group_ids || [])
    setSelectedWorkoutTypeId(tpl.workout_type_id || "")
    setSelectedCoachId(tpl.coach_id || "")
    setMembersOnly(tpl.members_only)
  }

  const togglePaceGroup = (id: string) =>
    setSelectedPaceGroupIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])

  async function geocode(addr: string) {
    if (!addr) return null
    try {
      const geocodingClient = mapboxSdk({ accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN! })
      const res = await geocodingClient.forwardGeocode({ query: addr, limit: 1 }).send()
      const match = res.body.features[0]
      if (match) return { lat: match.center[1], lng: match.center[0] }
    } catch {}
    return null
  }

  async function saveTemplate() {
    const payload = {
      club_id: clubId, title,
      distance: distance || null, meeting_point: address || null, city: null,
      route_url: routeUrl || null, description: description || null,
      tags: selectedTags.length > 0 ? selectedTags : null,
      pace_group_ids: selectedPaceGroupIds,
      workout_type_id: selectedWorkoutTypeId || null,
      coach_id: selectedCoachId || null,
      members_only: membersOnly,
      last_used_at: new Date().toISOString(),
    }
    const { data: existing } = await supabase.from("run_templates")
      .select("id, times_used").eq("club_id", clubId).eq("title", title).maybeSingle()
    if (existing) {
      await supabase.from("run_templates").update({ ...payload, times_used: existing.times_used + 1 }).eq("id", existing.id)
    } else {
      await supabase.from("run_templates").insert(payload)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date || !time) return
    setSaving(true)
    try {
      const coords = await geocode(address)
      const runData = {
        title, time,
        distance: distance || null,
        meeting_point: address || null,
        run_lat: coords?.lat ?? null, run_lng: coords?.lng ?? null,
        route_url: routeUrl || null, description: description || null,
        tags: selectedTags.length > 0 ? selectedTags : null,
        is_public: !membersOnly, members_only: membersOnly,
        pace_group_ids: selectedPaceGroupIds.length > 0 ? selectedPaceGroupIds : null,
        workout_type_id: selectedWorkoutTypeId || null,
        coach_id: selectedCoachId || null,
      }

      if (isEdit && runId) {
        const { error } = await supabase.from("runs").update({ ...runData, date }).eq("id", runId)
        if (error) { console.error(error); setSaving(false); return }
      } else {
        const dates = repeatWeekly ? getRepeatDates(date, repeatWeeks) : [date]
        const { error } = await supabase.from("runs").insert(
          dates.map((d) => ({ ...runData, date: d, club_id: clubId, created_by: userId }))
        )
        if (error) { console.error(error); setSaving(false); return }
        await saveTemplate()
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      setSaving(false)
    }
  }

  const ic = "w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
  const lc = "block text-xs font-semibold text-white/50 mb-1.5"
  const repeatDates = date && repeatWeekly ? getRepeatDates(date, repeatWeeks) : []

  if (dataLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="pb-12">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onClose}
          className="w-9 h-9 rounded-full bg-[#1e2d12] border border-[#2e3d1a] flex items-center justify-center text-white/60 hover:text-white transition shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-black text-white leading-tight">{isEdit ? "Edit Run" : "Schedule a Run"}</h2>
          {date && (
            <p className="text-xs text-white/40 mt-0.5">
              {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          )}
        </div>
      </div>

      {!isEdit && templates.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Load from library</p>
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            {templates.map((tpl) => (
              <button key={tpl.id} type="button" onClick={() => applyTemplate(tpl)}
                className="shrink-0 flex flex-col items-start px-3 py-2.5 rounded-xl bg-[#1e2d12] border border-[#2e3d1a] hover:border-[#c5f135]/40 transition text-left min-w-[120px] max-w-[180px]">
                <p className="text-xs font-bold text-white truncate w-full">{tpl.title}</p>
                {tpl.distance && <p className="text-[10px] text-white/40 mt-0.5">{tpl.distance}</p>}
                <p className="text-[10px] text-white/25 mt-0.5">Used {tpl.times_used}×</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Core */}
        <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-4">
          <div>
            <label className={lc}>Run Title{isEdit ? " *" : " (optional)"}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Saturday Morning 5K" required={isEdit} className={ic} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc}>Date *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={ic} />
            </div>
            <div>
              <label className={lc}>Time *</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className={ic} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc}>Distance</label>
              <input value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="e.g. 5K, 10 mi" className={ic} />
            </div>
            <div>
              <label className={lc}>Route Link <span className="text-white/25 font-normal">(optional)</span></label>
              <input value={routeUrl} onChange={(e) => setRouteUrl(e.target.value)} placeholder="Strava link…" type="url" className={ic} />
            </div>
          </div>
        </div>

        {/* Workout */}
        <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-white/50 mb-0.5">Workout</p>
            <p className="text-[11px] text-white/25">
              {workoutTypes.length > 0 ? "Pick from your workout library" : "Add workouts in Runs → Workout Library to link them here"}
            </p>
          </div>
          {workoutTypes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedWorkoutTypeId("")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${!selectedWorkoutTypeId ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-transparent text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40"}`}>
                No workout
              </button>
              {workoutTypes.map((wt) => (
                <button key={wt.id} type="button"
                  onClick={() => setSelectedWorkoutTypeId(selectedWorkoutTypeId === wt.id ? "" : wt.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${selectedWorkoutTypeId === wt.id ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-transparent text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"}`}>
                  {wt.name}
                </button>
              ))}
            </div>
          )}
          <div>
            <label className={lc}>Notes <span className="text-white/25 font-normal">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Pace, terrain, workout details…" rows={3} className={`${ic} resize-none`} />
          </div>
        </div>

        {/* Groups & Visibility */}
        <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-4">
          <p className="text-xs font-semibold text-white/50">Groups & Visibility</p>

          <button type="button" onClick={() => setMembersOnly((v) => !v)}
            className="w-full flex items-center justify-between gap-3 text-left bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-3">
            <div className="flex items-center gap-3">
              {!membersOnly
                ? <Globe className="w-4 h-4 text-[#c5f135] shrink-0" />
                : <Lock className="w-4 h-4 text-white/40 shrink-0" />}
              <div>
                <p className="text-xs font-semibold text-white/70">{!membersOnly ? "Community Run" : "Members Only"}</p>
                <p className="text-[11px] text-white/30 mt-0.5">{!membersOnly ? "Open to everyone" : "Paying members only"}</p>
              </div>
            </div>
            <div className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${!membersOnly ? "bg-[#c5f135]" : "bg-[#2e3d1a]"}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${!membersOnly ? "left-[22px]" : "left-0.5"}`} />
            </div>
          </button>

          <div className="space-y-2">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Pace Group</p>
            {paceGroups.length === 0 ? (
              <p className="text-xs text-white/30 italic">No pace groups yet — add them in Setup.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {paceGroups.map((pg) => {
                  const active = selectedPaceGroupIds.includes(pg.id)
                  return (
                    <button key={pg.id} type="button" onClick={() => togglePaceGroup(pg.id)}
                      className={`flex flex-col items-start px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${active ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-[#1a2110] text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"}`}>
                      <span>{pg.name}</span>
                      <span className={`text-[10px] font-normal mt-0.5 ${active ? "text-[#1a2110]/60" : "text-white/30"}`}>
                        {fmtPace(pg.pace_min)}–{fmtPace(pg.pace_max)} /mi
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Coach</p>
            {coaches.length === 0 ? (
              <p className="text-xs text-white/30 italic">No coaches yet — add them in Members.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setSelectedCoachId("")}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${!selectedCoachId ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-[#1a2110] text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40"}`}>
                  No coach
                </button>
                {coaches.map((coach) => (
                  <button key={coach.id} type="button"
                    onClick={() => setSelectedCoachId(selectedCoachId === coach.id ? "" : coach.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${selectedCoachId === coach.id ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-[#1a2110] text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"}`}>
                    {coach.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Location */}
        {(() => {
          const branchesEnabled = tier === "growth" || tier === "enterprise"
          const selectedLoc = locations.find((l) => l.id === selectedLocationId)
          const selectedRegion = selectedLoc ? regions.find((r) => r.id === selectedLoc.region_id) : null
          return (
            <div className={`bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-4 ${!branchesEnabled ? "opacity-40 pointer-events-none" : ""}`}>
              <div>
                <p className="text-xs font-semibold text-white/50 mb-0.5">Meeting Location</p>
                <p className="text-[11px] text-white/25">
                  {!branchesEnabled ? "Available on Growth and above" : "Used to pin this run on the discover map"}
                </p>
              </div>
              {locations.length > 0 ? (
                <div className="space-y-3">
                  {regions.map((region) => {
                    const regionLocs = locations.filter((l) => l.region_id === region.id)
                    if (regionLocs.length === 0) return null
                    return (
                      <div key={region.id}>
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">{region.name}</p>
                        <div className="flex flex-wrap gap-2">
                          {regionLocs.map((loc) => {
                            const active = selectedLocationId === loc.id
                            return (
                              <button key={loc.id} type="button"
                                onClick={() => {
                                  const newId = active ? "" : loc.id
                                  setSelectedLocationId(newId)
                                  setAddress(newId ? (loc.address || loc.name) : "")
                                }}
                                className={`flex flex-col items-start px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                  active
                                    ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]"
                                    : "bg-[#1a2110] text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"
                                }`}>
                                <span>{loc.name}</span>
                                {loc.address && (
                                  <span className={`text-[10px] font-normal mt-0.5 ${active ? "text-[#1a2110]/60" : "text-white/30"}`}>
                                    {loc.address}
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <button type="button" onClick={onGoToSetup}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30 hover:bg-[#c5f135]/25 transition">
                  No locations set up yet — go to Setup → Branches & Locations
                </button>
              )}
              <div>
                <label className={lc}>Branch</label>
                <div className={`${ic} ${selectedRegion ? "text-white" : "text-white/20"}`}>
                  {selectedRegion?.name ?? "—"}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Tags */}
        <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-white/50 mb-0.5">Run Tags <span className="text-white/25 font-normal">(optional)</span></p>
            <p className="text-[11px] text-white/25">Help runners know what to expect</p>
          </div>
          {TAG_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-bold text-[#c5f135]/50 uppercase tracking-widest mb-2">{group.label}</p>
              <div className="flex flex-wrap gap-2">
                {group.tags.map((tag) => {
                  const active = selectedTags.includes(tag)
                  return (
                    <button key={tag} type="button" onClick={() => toggleTag(tag)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-100 ${active ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-transparent text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"}`}>
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Repeat (create only) */}
        {!isEdit && (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-4">
            <button type="button" onClick={() => setRepeatWeekly((v) => !v)}
              className="w-full flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Repeat2 className={`w-4 h-4 shrink-0 transition-colors ${repeatWeekly ? "text-[#c5f135]" : "text-white/30"}`} />
                <div className="text-left">
                  <p className="text-xs font-semibold text-white/70">Repeat Weekly</p>
                  <p className="text-[11px] text-white/30 mt-0.5">Schedule this run every week</p>
                </div>
              </div>
              <div className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${repeatWeekly ? "bg-[#c5f135]" : "bg-[#2e3d1a]"}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${repeatWeekly ? "left-[22px]" : "left-0.5"}`} />
              </div>
            </button>
            {repeatWeekly && (
              <div className="space-y-3 pt-1">
                <div>
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2.5">Repeat for</p>
                  <div className="flex gap-2 flex-wrap">
                    {[2, 3, 4, 5, 6, 8].map((n) => (
                      <button key={n} type="button" onClick={() => setRepeatWeeks(n)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${repeatWeeks === n ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-transparent text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"}`}>
                        {n} weeks
                      </button>
                    ))}
                  </div>
                </div>
                {date ? (
                  <div className="bg-[#1a2110] rounded-xl p-3">
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2.5">Creates {repeatWeeks} runs</p>
                    <div className="space-y-1.5">
                      {repeatDates.map((d, i) => (
                        <div key={d} className="flex items-center gap-2 text-xs">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${i === 0 ? "bg-[#c5f135]" : "bg-white/15"}`} />
                          <span className={i === 0 ? "text-[#c5f135] font-semibold" : "text-white/35"}>
                            {new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                            {i === 0 && <span className="text-[#c5f135]/50 font-normal"> — first run</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-white/25 italic">Set a start date above to preview dates.</p>
                )}
              </div>
            )}
          </div>
        )}

        <button type="submit" disabled={saving || !date || !time || (isEdit && !title)}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-2xl disabled:opacity-40 hover:bg-[#d4ff45] transition">
          {isEdit ? <Check className="w-4 h-4" /> : <CalendarPlus className="w-4 h-4" />}
          {saving
            ? (isEdit ? "Saving…" : "Scheduling…")
            : isEdit
              ? "Save Changes"
              : repeatWeekly ? `Schedule ${repeatWeeks} Runs` : "Schedule Run"}
        </button>
      </form>
    </div>
  )
}
