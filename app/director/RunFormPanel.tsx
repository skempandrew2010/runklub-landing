"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, CalendarPlus, Check, Globe, Lock, Repeat2 } from "lucide-react"
import mapboxSdk from "@mapbox/mapbox-sdk/services/geocoding"
import { localDateStr, mondayOf } from "@/utils/dates"
import { COMMON_TIMEZONES, getBrowserTimezone } from "@/lib/timezone"
import { type WorkoutSegment, formatWorkoutSegment, parseWorkoutStructure } from "@/lib/workouts"
import AddressAutocomplete from "@/components/AddressAutocomplete"
import { openNativePicker } from "@/utils/openPicker"


const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MAX_DESCRIPTION_WORDS = 100

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function limitWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length <= max ? text : words.slice(0, max).join(" ")
}

function nextDateForWeekday(target: number): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = (target - today.getDay() + 7) % 7
  today.setDate(today.getDate() + diff)
  return localDateStr(today)
}

const TAG_GROUPS = [
  { label: "Pace", tags: ["Easy", "Moderate", "Fast", "All Paces"] },
  { label: "Type", tags: ["Social Run", "Long Run", "Speed Work", "Trail Run", "Race Prep", "Fun Run", "Night Run"] },
  { label: "Vibe", tags: ["Beer After", "Coffee After", "Dog Friendly", "Beginner Friendly", "No Drop", "First Timers Welcome", "Traveler Friendly", "Rain or Shine", "Stroller Friendly"] },
]

type PaceGroup = { id: string; name: string; pace_min: number; pace_max: number }
type WorkoutType = { id: string; name: string; description: string | null; structure: WorkoutSegment[] }
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
  quickMode = false,
  onClose,
  onSaved,
  onGoToSetup,
  onToggleQuickMode,
}: {
  clubId: string
  userId: string
  runId: string | null
  tier?: string | null
  quickMode?: boolean
  onClose: () => void
  onSaved: () => void
  onGoToSetup?: () => void
  onToggleQuickMode?: () => void
}) {
  const isEdit = runId !== null

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null)
  const [title, setTitle] = useState(quickMode ? "Weekly Community Run" : "")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [timezone, setTimezone] = useState(getBrowserTimezone())
  const [distance, setDistance] = useState("")
  const [address, setAddress] = useState("")
  const [manageMode, setManageMode] = useState<"runklub" | "external">("runklub")
  const [externalUrl, setExternalUrl] = useState("")
  const [city, setCity] = useState("")
  const [routeUrl, setRouteUrl] = useState("")
  const [description, setDescription] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [membersOnly, setMembersOnly] = useState(false)
  const [passportCheckinLimit, setPassportCheckinLimit] = useState("")
  const [passportCreditValue, setPassportCreditValue] = useState("")
  const [repeatWeekly, setRepeatWeekly] = useState(quickMode)
  const [repeatWeeks, setRepeatWeeks] = useState(quickMode ? 12 : 4)
  const [selectedPaceGroupIds, setSelectedPaceGroupIds] = useState<string[]>([])
  const [selectedWorkoutTypeId, setSelectedWorkoutTypeId] = useState("")
  const [workoutManuallySet, setWorkoutManuallySet] = useState(false)
  const [selectedCoachId, setSelectedCoachId] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (dayOfWeek !== null) setDate(nextDateForWeekday(dayOfWeek))
  }, [dayOfWeek])

  const [paceGroups, setPaceGroups] = useState<PaceGroup[]>([])
  const [workoutTypes, setWorkoutTypes] = useState<WorkoutType[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState("")
  const [templates, setTemplates] = useState<RunTemplate[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [clubHome, setClubHome] = useState<{ lat: number; lng: number } | null>(null)
  const [weeklySchedule, setWeeklySchedule] = useState<Record<string, Record<number, string | null>>>({})

  useEffect(() => {
    const load = async () => {
      const [pg, wt, co, tpl, regionRows, clubRow, sched] = await Promise.all([
        supabase.from("pace_groups").select("id, name, pace_min, pace_max").eq("club_id", clubId).order("pace_min"),
        supabase.from("runs").select("id, title, description, structure").eq("club_id", clubId).eq("kind", "workout").order("title"),
        supabase.from("coaches").select("id, name").eq("club_id", clubId).order("name"),
        isEdit
          ? Promise.resolve({ data: [] })
          : supabase.from("run_templates")
              .select("id, title, distance, meeting_point, city, route_url, description, tags, pace_group_ids, workout_type_id, coach_id, members_only, times_used")
              .eq("club_id", clubId)
              .order("last_used_at", { ascending: false })
              .limit(8),
        supabase.from("regions").select("id, name").eq("club_id", clubId).order("name"),
        supabase.from("clubs").select("default_timezone, latitude, longitude").eq("id", clubId).single(),
        supabase.from("club_weekly_schedule").select("day_of_week, week_of, pace_group_id, workout_type_id").eq("club_id", clubId),
      ])
      setPaceGroups((pg.data as PaceGroup[]) || [])
      setWorkoutTypes(((wt.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.title, description: r.description, structure: parseWorkoutStructure(r.structure) })))
      setCoaches((co.data as Coach[]) || [])
      if (!isEdit) setTemplates((tpl.data as RunTemplate[]) || [])
      const scheduleByKey: Record<string, Record<number, string | null>> = {}
      for (const row of (sched.data ?? []) as { day_of_week: number; week_of: string; pace_group_id: string; workout_type_id: string | null }[]) {
        const key = `${row.pace_group_id}_${row.week_of}`
        if (!scheduleByKey[key]) scheduleByKey[key] = {}
        scheduleByKey[key][row.day_of_week] = row.workout_type_id
      }
      setWeeklySchedule(scheduleByKey)
      const clubInfo = clubRow.data as { default_timezone: string | null; latitude: number | null; longitude: number | null } | null
      if (!isEdit && clubInfo?.default_timezone) setTimezone(clubInfo.default_timezone)
      setClubHome(clubInfo?.latitude != null && clubInfo?.longitude != null ? { lat: clubInfo.latitude, lng: clubInfo.longitude } : null)

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
          setTimezone(run.timezone ?? clubInfo?.default_timezone ?? getBrowserTimezone())
          setDistance(run.distance ?? "")
          setAddress(run.meeting_point ?? "")
          setManageMode(run.external_url ? "external" : "runklub")
          setExternalUrl(run.external_url ?? "")
          setCity(run.city ?? "")
          setRouteUrl(run.route_url ?? "")
          setDescription(run.description ?? "")
          setSelectedTags(run.tags ?? [])
          setMembersOnly(run.members_only ?? false)
          setPassportCheckinLimit(run.passport_checkin_limit != null ? String(run.passport_checkin_limit) : "")
          setPassportCreditValue(run.passport_credit_value != null ? String(run.passport_credit_value) : "")
          setSelectedPaceGroupIds(run.pace_group_ids ?? [])
          setSelectedWorkoutTypeId(run.workout_type_id ?? "")
          setWorkoutManuallySet(true)
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

  // Suggest whatever the weekly training schedule has for this run's pace group,
  // specific week, and day of week - only for new runs with a pace group picked,
  // and only until the director picks a workout themselves.
  useEffect(() => {
    if (isEdit || workoutManuallySet || !date || selectedPaceGroupIds.length === 0) return
    const runDate = new Date(`${date}T00:00:00`)
    const key = `${selectedPaceGroupIds[0]}_${mondayOf(runDate)}`
    const suggested = weeklySchedule[key]?.[runDate.getDay()]
    if (suggested) setSelectedWorkoutTypeId(suggested)
  }, [date, isEdit, workoutManuallySet, weeklySchedule, selectedPaceGroupIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyTemplate = (tpl: RunTemplate) => {
    setTitle(tpl.title)
    setDistance(tpl.distance || "")
    setAddress(tpl.meeting_point || "")
    setRouteUrl(tpl.route_url || "")
    setDescription(tpl.description || "")
    setSelectedTags(tpl.tags || [])
    setSelectedPaceGroupIds(tpl.pace_group_ids || [])
    setSelectedWorkoutTypeId(tpl.workout_type_id || "")
    setWorkoutManuallySet(true)
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
    if (manageMode === "external" && !externalUrl) return
    setSaving(true)
    try {
      const isExternal = manageMode === "external"
      const coords = isExternal ? null : await geocode(address)
      const runData = {
        title, time, timezone,
        distance: distance || null,
        meeting_point: isExternal ? null : (address || null),
        city: isExternal ? (city || null) : null,
        run_lat: coords?.lat ?? null, run_lng: coords?.lng ?? null,
        external_url: isExternal ? externalUrl : null,
        route_url: routeUrl || null, description: description || null,
        tags: selectedTags.length > 0 ? selectedTags : null,
        is_public: !membersOnly, members_only: membersOnly,
        pace_group_ids: selectedPaceGroupIds.length > 0 ? selectedPaceGroupIds : null,
        workout_type_id: selectedWorkoutTypeId || null,
        coach_id: selectedCoachId || null,
        passport_checkin_limit: passportCheckinLimit.trim() === "" ? null : parseInt(passportCheckinLimit, 10),
        passport_credit_value: passportCreditValue.trim() === "" ? null : parseInt(passportCreditValue, 10),
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
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onClose}
          className="w-9 h-9 rounded-full bg-[#1e2d12] border border-[#2e3d1a] flex items-center justify-center text-white/60 hover:text-white transition shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-black text-white leading-tight">{quickMode ? "Weekly Community Run" : isEdit ? "Edit Run" : "Schedule a Run"}</h2>
          {quickMode ? (
            <p className="text-xs text-white/40 mt-0.5">
              {dayOfWeek !== null ? `Every ${DAY_FULL[dayOfWeek]}` : "The open run your klub does every week"}
            </p>
          ) : date && (
            <p className="text-xs text-white/40 mt-0.5">
              {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          )}
        </div>
      </div>

      {!isEdit && onToggleQuickMode && (
        <button type="button" onClick={onToggleQuickMode}
          className="text-[11px] font-semibold text-[#c5f135]/70 hover:text-[#c5f135] underline underline-offset-2 mb-6">
          {quickMode ? "Switch to full scheduling form" : "Just need a weekly community run? Quick create →"}
        </button>
      )}

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
          {(!quickMode || showAdvanced) && (
            <div>
              <label className={lc}>Run Title{isEdit ? " *" : " (optional)"}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Saturday Morning 5K" required={isEdit} className={ic} />
            </div>
          )}
          {quickMode ? (
            <div>
              <label className={lc}>Day of Week *</label>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_LABELS.map((label, i) => (
                  <button key={i} type="button" onClick={() => setDayOfWeek(i)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${dayOfWeek === i ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-[#1a2110] text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lc}>Date *</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} onFocus={openNativePicker} onClick={openNativePicker} required className={`${ic} [color-scheme:dark]`} />
              </div>
              <div>
                <label className={lc}>Distance</label>
                <input value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="e.g. 5K, 10 mi" className={ic} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc}>Time *</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} onFocus={openNativePicker} onClick={openNativePicker} required className={`${ic} [color-scheme:dark]`} />
            </div>
            <div>
              <label className={lc}>Timezone</label>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={ic}>
                {COMMON_TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
            {(!quickMode || showAdvanced) && (
              <div>
                <label className={lc}>Route Link <span className="text-white/25 font-normal">(optional)</span></label>
                <input value={routeUrl} onChange={(e) => setRouteUrl(e.target.value)} placeholder="Strava link…" type="url" className={ic} />
              </div>
            )}
          </div>
          {quickMode && showAdvanced && (
            <div>
              <label className={lc}>Distance</label>
              <input value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="e.g. 5K, 10 mi" className={ic} />
            </div>
          )}
        </div>

        {/* Manage RSVPs */}
        <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-3">
          <p className="text-xs font-semibold text-white/50">How do you manage this run?</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setManageMode("runklub")}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${manageMode === "runklub" ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-[#1a2110] text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"}`}>
              In RunKlub
            </button>
            <button type="button" onClick={() => setManageMode("external")}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${manageMode === "external" ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-[#1a2110] text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"}`}>
              External link
            </button>
          </div>
          {manageMode === "external" && (
            <div className="space-y-3 pt-1">
              <p className="text-[11px] text-white/25">
                We'll list this run with just the day and time - runners tap through to your link to see the location or RSVP.
              </p>
              <div>
                <label className={lc}>City</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Boulder, CO" className={ic} />
              </div>
              <div>
                <label className={lc}>Sign-up / management link *</label>
                <input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://meetup.com/…" type="url" required className={ic} />
              </div>
            </div>
          )}
        </div>

        {/* Location */}
        {manageMode === "runklub" && (() => {
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
              <AddressAutocomplete
                placeholder="Type an address or place name…"
                value={selectedLocationId ? "" : address}
                onChange={(v) => { setSelectedLocationId(""); setAddress(v) }}
                onSelect={(s) => { setSelectedLocationId(""); setAddress(s.placeName) }}
                proximity={clubHome}
                className={ic}
              />
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
                  No locations set up yet - go to Setup → Branches & Locations
                </button>
              )}
              <div>
                <label className={lc}>Branch</label>
                <div className={`${ic} ${selectedRegion ? "text-white" : "text-white/20"}`}>
                  {selectedRegion?.name ?? "-"}
                </div>
              </div>
            </div>
          )
        })()}

        {quickMode && (
          <button type="button" onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-[#2e3d1a] text-xs font-semibold text-white/40 hover:text-white/70 hover:border-[#c5f135]/30 transition">
            {showAdvanced ? "Hide advanced options" : "+ Add workout, pace groups, coach, or tags"}
          </button>
        )}

        {(!quickMode || showAdvanced) && (
          <>
            {/* Description */}
            <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-white/50">Description <span className="text-white/25 font-normal">(optional)</span></label>
                <span className={`text-[10px] font-semibold ${countWords(description) >= MAX_DESCRIPTION_WORDS ? "text-[#c5f135]" : "text-white/25"}`}>
                  {countWords(description)}/{MAX_DESCRIPTION_WORDS} words
                </span>
              </div>
              <textarea value={description} onChange={(e) => setDescription(limitWords(e.target.value, MAX_DESCRIPTION_WORDS))}
                placeholder="Weather, meeting details, anything else…" rows={3} className={`${ic} resize-none`} />
            </div>

            {/* Add Workout */}
            <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-white/50 mb-0.5">Add Workout</p>
                <p className="text-[11px] text-white/25">
                  {workoutTypes.length > 0 ? "Pick from your workout library" : "Add workouts in Runs → Workout Library to link them here"}
                </p>
              </div>
              {workoutTypes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setSelectedWorkoutTypeId(""); setWorkoutManuallySet(true) }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${!selectedWorkoutTypeId ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-transparent text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40"}`}>
                    No workout
                  </button>
                  {workoutTypes.map((wt) => (
                    <button key={wt.id} type="button"
                      onClick={() => { setSelectedWorkoutTypeId(selectedWorkoutTypeId === wt.id ? "" : wt.id); setWorkoutManuallySet(true) }}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${selectedWorkoutTypeId === wt.id ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-transparent text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"}`}>
                      {wt.name}
                    </button>
                  ))}
                </div>
              )}
              {selectedWorkoutTypeId && !workoutManuallySet && (
                <p className="text-[11px] text-[#c5f135]/70">Suggested from your weekly training schedule - pick another to override.</p>
              )}
              {selectedWorkoutTypeId && (() => {
                const wt = workoutTypes.find((w) => w.id === selectedWorkoutTypeId)
                if (!wt || (wt.structure.length === 0 && !wt.description)) return null
                return (
                  <div className="bg-[#1a2110] border border-[#c5f135]/20 rounded-xl px-3 py-2.5 space-y-2">
                    <p className="text-[10px] font-bold text-[#c5f135]/60 uppercase tracking-widest">{wt.name} - what runners will see</p>
                    {wt.structure.length > 0 && (
                      <ul className="space-y-1">
                        {wt.structure.map((seg, i) => (
                          <li key={i} className="text-xs text-white/80 font-semibold">{formatWorkoutSegment(seg)}</li>
                        ))}
                      </ul>
                    )}
                    {wt.description && <p className="text-xs text-white/60 leading-relaxed">{wt.description}</p>}
                  </div>
                )
              })()}
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
                <div className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-300 ease-out ${!membersOnly ? "bg-[#c5f135]" : "bg-[#2e3d1a]"}`}>
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${!membersOnly ? "translate-x-[22px]" : "translate-x-0"}`} />
                </div>
              </button>

              <div>
                <label className={lc}>Passport Credit Value <span className="text-white/25 font-normal">(optional - overrides your klub default)</span></label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPassportCreditValue("")}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${!passportCreditValue ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-[#1a2110] text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40"}`}>
                    Klub default
                  </button>
                  {[1, 2, 3, 4, 5, 6].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setPassportCreditValue(String(v))}
                      className={`w-9 py-1.5 rounded-full text-xs font-bold border transition-all ${passportCreditValue === String(v) ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]" : "bg-[#1a2110] text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40"}`}>
                      {v}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-white/25 mt-1">How many credits a Passport subscriber spends to check into this specific run - higher values earn a bigger payout.</p>
              </div>

              <div>
                <label className={lc}>Passport Check-in Limit <span className="text-white/25 font-normal">(optional)</span></label>
                <input
                  type="number"
                  min="1"
                  value={passportCheckinLimit}
                  onChange={(e) => setPassportCheckinLimit(e.target.value)}
                  placeholder="Unlimited"
                  className={ic}
                />
                <p className="text-[11px] text-white/25 mt-1">Cap how many Passport subscribers can check into this specific run. Once it&apos;s reached, the run shows as full to outside runners. Leave blank to use your klub&apos;s default limit.</p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Pace Group</p>
                {paceGroups.length === 0 ? (
                  <p className="text-xs text-white/30 italic">No pace groups yet - add them in Setup.</p>
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
                  <p className="text-xs text-white/30 italic">No coaches yet - add them in Members.</p>
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
          </>
        )}

        {/* Repeat (create only) */}
        {!isEdit && (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-4">
            {quickMode ? (
              <div className="flex items-center gap-2.5">
                <Repeat2 className="w-4 h-4 text-[#c5f135] shrink-0" />
                <div className="text-left">
                  <p className="text-xs font-semibold text-white/70">Repeats Every Week</p>
                  <p className="text-[11px] text-white/30 mt-0.5">This is a standing weekly run</p>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setRepeatWeekly((v) => !v)}
                className="w-full flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Repeat2 className={`w-4 h-4 shrink-0 transition-colors ${repeatWeekly ? "text-[#c5f135]" : "text-white/30"}`} />
                  <div className="text-left">
                    <p className="text-xs font-semibold text-white/70">Repeat Weekly</p>
                    <p className="text-[11px] text-white/30 mt-0.5">Schedule this run every week</p>
                  </div>
                </div>
                <div className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-300 ease-out ${repeatWeekly ? "bg-[#c5f135]" : "bg-[#2e3d1a]"}`}>
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${repeatWeekly ? "translate-x-[22px]" : "translate-x-0"}`} />
                </div>
              </button>
            )}
            {repeatWeekly && (
              <div className="space-y-3 pt-1">
                <div>
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2.5">Repeat for</p>
                  <div className="flex gap-2 flex-wrap">
                    {(quickMode ? [8, 12, 16, 26] : [2, 3, 4, 5, 6, 8]).map((n) => (
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
                            {i === 0 && <span className="text-[#c5f135]/50 font-normal"> - first run</span>}
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

        <button type="submit" disabled={saving || !date || !time || (isEdit && !title) || (quickMode && dayOfWeek === null) || (manageMode === "external" && !externalUrl)}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-2xl disabled:opacity-40 hover:bg-[#d4ff45] transition">
          {isEdit ? <Check className="w-4 h-4" /> : <CalendarPlus className="w-4 h-4" />}
          {saving
            ? (isEdit ? "Saving…" : "Scheduling…")
            : isEdit
              ? "Save Changes"
              : quickMode
                ? "Create Weekly Run"
                : repeatWeekly ? `Schedule ${repeatWeeks} Runs` : "Schedule Run"}
        </button>
      </form>
    </div>
  )
}
