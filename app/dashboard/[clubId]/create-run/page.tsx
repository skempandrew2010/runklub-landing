"use client"

import { Suspense, useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, CalendarPlus, Repeat2, Globe, Lock, Bell } from "lucide-react"
import mapboxSdk from "@mapbox/mapbox-sdk/services/geocoding"
import { localDateStr } from "@/utils/dates"
import { COMMON_TIMEZONES, getBrowserTimezone } from "@/lib/timezone"


const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

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
type WorkoutType = { id: string; name: string }
type Coach = { id: string; name: string }
type RunTemplate = {
  id: string
  title: string
  distance: string | null
  meeting_point: string | null
  city: string | null
  route_url: string | null
  description: string | null
  tags: string[] | null
  pace_group_ids: string[]
  workout_type_id: string | null
  coach_id: string | null
  members_only: boolean
  times_used: number
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + "T00:00:00")
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().split("T")[0]
}

function getRepeatDates(startDate: string, totalWeeks: number): string[] {
  return Array.from({ length: totalWeeks }, (_, i) => addWeeks(startDate, i))
}

function fmtPace(minPerMile: number) {
  const m = Math.floor(minPerMile)
  const s = Math.round((minPerMile - m) * 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

function CreateRunContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const clubId = params?.clubId as string
  const router = useRouter()

  const isQuickParam = searchParams.get("quick") === "1"

  // Core form
  const [quickMode, setQuickMode] = useState(isQuickParam)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null)
  const [title, setTitle] = useState(isQuickParam ? "Weekly Community Run" : "")
  const [date, setDate] = useState(searchParams.get("date") ?? "")
  const [time, setTime] = useState("")
  const [timezone, setTimezone] = useState(getBrowserTimezone())
  const [distance, setDistance] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [routeUrl, setRouteUrl] = useState("")
  const [description, setDescription] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(true)
  const [repeatWeekly, setRepeatWeekly] = useState(isQuickParam)
  const [repeatWeeks, setRepeatWeeks] = useState(isQuickParam ? 12 : 4)
  const [notifyFollowers, setNotifyFollowers] = useState(false)
  const [loading, setLoading] = useState(false)

  // New fields
  const [selectedPaceGroupIds, setSelectedPaceGroupIds] = useState<string[]>([])
  const [selectedWorkoutTypeId, setSelectedWorkoutTypeId] = useState("")
  const [selectedCoachId, setSelectedCoachId] = useState("")

  useEffect(() => {
    if (dayOfWeek !== null) setDate(nextDateForWeekday(dayOfWeek))
  }, [dayOfWeek])

  // Club model data
  const [paceGroups, setPaceGroups] = useState<PaceGroup[]>([])
  const [workoutTypes, setWorkoutTypes] = useState<WorkoutType[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [templates, setTemplates] = useState<RunTemplate[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [clubIsPrivate, setClubIsPrivate] = useState(false)

  useEffect(() => {
    if (!clubId) return
    Promise.all([
      supabase.from("pace_groups").select("id, name, pace_min, pace_max").eq("club_id", clubId).order("pace_min"),
      supabase.from("runs").select("id, title").eq("club_id", clubId).eq("kind", "workout").order("title"),
      supabase.from("coaches").select("id, name").eq("club_id", clubId).order("name"),
      supabase.from("run_templates")
        .select("id, title, distance, meeting_point, city, route_url, description, tags, pace_group_ids, workout_type_id, coach_id, members_only, times_used")
        .eq("club_id", clubId)
        .order("last_used_at", { ascending: false })
        .limit(8),
      supabase.from("clubs").select("membership_type, default_timezone").eq("id", clubId).single(),
    ]).then(([pg, wt, co, tpl, club]) => {
      setPaceGroups((pg.data as PaceGroup[]) || [])
      setWorkoutTypes(((wt.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.title })))
      setCoaches((co.data as Coach[]) || [])
      setTemplates((tpl.data as RunTemplate[]) || [])
      setClubIsPrivate((club.data as any)?.membership_type !== "free")
      const defaultTz = (club.data as any)?.default_timezone
      if (defaultTz) setTimezone(defaultTz)
      setDataLoading(false)
    })
  }, [clubId])

  // Public clubs have no members concept - a Members Only run would be unreachable.
  useEffect(() => {
    if (!clubIsPrivate) setIsPublic(true)
  }, [clubIsPrivate])

  const applyTemplate = (tpl: RunTemplate) => {
    setTitle(tpl.title)
    setDistance(tpl.distance || "")
    setAddress(tpl.meeting_point || "")
    setCity(tpl.city || "")
    setRouteUrl(tpl.route_url || "")
    setDescription(tpl.description || "")
    setSelectedTags(tpl.tags || [])
    setSelectedPaceGroupIds(tpl.pace_group_ids || [])
    setSelectedWorkoutTypeId(tpl.workout_type_id || "")
    setSelectedCoachId(tpl.coach_id || "")
    setIsPublic(!tpl.members_only)
  }

  const togglePaceGroup = (id: string) =>
    setSelectedPaceGroupIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])

  async function geocodeAddress(addr: string, cityName: string): Promise<{ lat: number; lng: number } | null> {
    const query = [addr, cityName].filter(Boolean).join(", ")
    if (!query) return null
    try {
      const geocodingClient = mapboxSdk({ accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN! })
      const res = await geocodingClient.forwardGeocode({ query, limit: 1 }).send()
      const match = res.body.features[0]
      if (match) return { lat: match.center[1], lng: match.center[0] }
    } catch {}
    return null
  }

  async function saveTemplate() {
    const payload = {
      club_id: clubId,
      title,
      distance: distance || null,
      meeting_point: address || null,
      city: city || null,
      route_url: routeUrl || null,
      description: description || null,
      tags: selectedTags.length > 0 ? selectedTags : null,
      pace_group_ids: selectedPaceGroupIds,
      workout_type_id: selectedWorkoutTypeId || null,
      coach_id: selectedCoachId || null,
      members_only: clubIsPrivate && !isPublic,
      last_used_at: new Date().toISOString(),
    }
    const { data: existing } = await supabase
      .from("run_templates")
      .select("id, times_used")
      .eq("club_id", clubId)
      .eq("title", title)
      .maybeSingle()
    if (existing) {
      await supabase.from("run_templates")
        .update({ ...payload, times_used: existing.times_used + 1 })
        .eq("id", existing.id)
    } else {
      await supabase.from("run_templates").insert(payload)
    }
  }

  async function notifyFollowersOfNewRun(firstDate: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const dateLabel = new Date(firstDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
      const bits = [dateLabel, time && new Date(`2000-01-01T${time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })]
      if (distance) bits.push(distance)
      if (address) bits.push(address)
      const messageLines = [bits.filter(Boolean).join(" · ")]
      if (repeatWeekly) messageLines.push(`Repeats weekly for ${repeatWeeks} weeks.`)
      await fetch(`/api/clubs/${clubId}/email-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          subject: `New run: ${title || "Community Run"}`,
          message: messageLines.join("\n"),
        }),
      })
    } catch (err) {
      console.error("notify followers error:", err)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!date || !time) return
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: ownedClub } = await supabase
        .from("clubs").select("id").eq("id", clubId).eq("user_id", user.id).single()
      if (!ownedClub) { setLoading(false); router.push("/director"); return }

      const coords = await geocodeAddress(address, city)

      const baseRun = {
        club_id: clubId,
        title,
        time,
        timezone,
        distance: distance || null,
        meeting_point: address || null,
        city: city || null,
        run_lat: coords?.lat ?? null,
        run_lng: coords?.lng ?? null,
        route_url: routeUrl || null,
        description: description || null,
        tags: selectedTags.length > 0 ? selectedTags : null,
        is_public: !(clubIsPrivate && !isPublic),
        members_only: clubIsPrivate && !isPublic,
        pace_group_ids: selectedPaceGroupIds.length > 0 ? selectedPaceGroupIds : null,
        workout_type_id: selectedWorkoutTypeId || null,
        coach_id: selectedCoachId || null,
        created_by: user.id,
      }

      const dates = repeatWeekly ? getRepeatDates(date, repeatWeeks) : [date]
      const { error } = await supabase.from("runs").insert(dates.map((d) => ({ ...baseRun, date: d })))
      if (error) { console.error(error); setLoading(false); return }

      await saveTemplate()
      if (notifyFollowers && baseRun.is_public) {
        await notifyFollowersOfNewRun(dates[0])
      }
      router.push(`/director`)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const inputClass = "w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
  const labelClass = "block text-xs font-semibold text-white/50 mb-1.5"
  const repeatDates = date && repeatWeekly ? getRepeatDates(date, repeatWeeks) : []

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-lg mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => router.push(`/director`)}
            className="w-9 h-9 rounded-full bg-[#1e2d12] border border-[#2e3d1a] flex items-center justify-center text-white/60 hover:text-white transition shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-black text-white leading-tight">{quickMode ? "Weekly Community Run" : "Schedule a Run"}</h1>
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

        <button type="button" onClick={() => setQuickMode((v) => !v)}
          className="text-[11px] font-semibold text-[#c5f135]/70 hover:text-[#c5f135] underline underline-offset-2 mb-6">
          {quickMode ? "Switch to full scheduling form" : "Just need a weekly community run? Quick create →"}
        </button>

        {/* Template library */}
        {!dataLoading && templates.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 px-0.5">Load from library</p>
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

          {/* Core details */}
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-4">
            {(!quickMode || showAdvanced) && (
              <div>
                <label className={labelClass}>Run Title <span className="text-white/25 font-normal">(optional)</span></label>
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Saturday Morning 5K (optional)" className={inputClass} />
              </div>
            )}
            {quickMode ? (
              <div>
                <label className={labelClass}>Day of Week *</label>
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
                  <label className={labelClass}>Date *</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={`${inputClass} [color-scheme:dark]`} />
                </div>
                <div>
                  <label className={labelClass}>Distance</label>
                  <input value={distance} onChange={(e) => setDistance(e.target.value)}
                    placeholder="e.g. 5K, 10 mi" className={inputClass} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Time *</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className={`${inputClass} [color-scheme:dark]`} />
              </div>
              <div>
                <label className={labelClass}>Timezone</label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
                  {COMMON_TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
              {(!quickMode || showAdvanced) && (
                <div>
                  <label className={labelClass}>Route Link <span className="text-white/25 font-normal">(optional)</span></label>
                  <input value={routeUrl} onChange={(e) => setRouteUrl(e.target.value)}
                    placeholder="Strava link…" type="url" className={inputClass} />
                </div>
              )}
            </div>
            {quickMode && showAdvanced && (
              <div>
                <label className={labelClass}>Distance</label>
                <input value={distance} onChange={(e) => setDistance(e.target.value)}
                  placeholder="e.g. 5K, 10 mi" className={inputClass} />
              </div>
            )}
          </div>

          {/* Location */}
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-white/50 mb-0.5">Meeting Location</p>
              <p className="text-[11px] text-white/25">Used to pin this run on the discover map</p>
            </div>
            <div>
              <label className={labelClass}>Meeting Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 1600 Pearl St, Central Park" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Boulder, CO" className={inputClass} />
            </div>
          </div>

          {quickMode && (
            <button type="button" onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-[#2e3d1a] text-xs font-semibold text-white/40 hover:text-white/70 hover:border-[#c5f135]/30 transition">
              {showAdvanced ? "Hide advanced options" : "+ Add workout, pace groups, coach, or tags"}
            </button>
          )}

          {(!quickMode || showAdvanced) && (
            <>
              {/* Workout library */}
              <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-white/50 mb-0.5">Workout</p>
                  <p className="text-[11px] text-white/25">
                    {workoutTypes.length > 0 ? "Pick from your workout library" : "Add workouts in the klub manager to link them here"}
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
                  <label className={labelClass}>Notes <span className="text-white/25 font-normal">(optional)</span></label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder="Pace, terrain, workout details…" rows={3}
                    className={`${inputClass} resize-none`} />
                </div>
              </div>

              {/* Groups & Visibility */}
              <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-4">
                <p className="text-xs font-semibold text-white/50">Groups</p>

                {/* Community / Members Only */}
                <button type="button" disabled={!clubIsPrivate} onClick={() => setIsPublic((v) => !v)}
                  className={`w-full flex items-center justify-between gap-3 text-left bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-3 ${!clubIsPrivate ? "opacity-50 cursor-not-allowed" : ""}`}>
                  <div className="flex items-center gap-3">
                    {isPublic
                      ? <Globe className="w-4 h-4 text-[#c5f135] shrink-0" />
                      : <Lock className="w-4 h-4 text-white/40 shrink-0" />}
                    <div>
                      <p className="text-xs font-semibold text-white/70">{isPublic ? "Community Run" : "Members Only"}</p>
                      <p className="text-[11px] text-white/30 mt-0.5">
                        {!clubIsPrivate ? "Turn on the paid membership tier in Settings to unlock this" : isPublic ? "Open to everyone" : "Only visible to approved members"}
                      </p>
                    </div>
                  </div>
                  <div className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-300 ease-out ${isPublic ? "bg-[#c5f135]" : "bg-[#2e3d1a]"}`}>
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isPublic ? "translate-x-[22px]" : "translate-x-0"}`} />
                  </div>
                </button>

                {/* Pace groups */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Pace Group</p>
                  {paceGroups.length === 0 ? (
                    <p className="text-xs text-white/30 italic">No pace groups set up yet - add them in the klub manager.</p>
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

                {/* Coach */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Coach</p>
                  {coaches.length === 0 ? (
                    <p className="text-xs text-white/30 italic">No coaches set up yet - add them in the klub manager.</p>
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

          {/* Repeat weekly */}
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
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2.5">
                      Creates {repeatWeeks} runs
                    </p>
                    <div className="space-y-1.5">
                      {repeatDates.map((d, i) => (
                        <div key={d} className="flex items-center gap-2 text-xs">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${i === 0 ? "bg-[#c5f135]" : "bg-white/15"}`} />
                          <span className={i === 0 ? "text-[#c5f135] font-semibold" : "text-white/35"}>
                            {new Date(d + "T00:00:00").toLocaleDateString("en-US", {
                              weekday: "short", month: "short", day: "numeric",
                            })}
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

          {isPublic && (
            <button type="button" onClick={() => setNotifyFollowers((v) => !v)}
              className="w-full flex items-center justify-between gap-3 bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4">
              <div className="flex items-center gap-2.5">
                <Bell className={`w-4 h-4 shrink-0 transition-colors ${notifyFollowers ? "text-[#c5f135]" : "text-white/30"}`} />
                <div className="text-left">
                  <p className="text-xs font-semibold text-white/70">Notify Followers</p>
                  <p className="text-[11px] text-white/30 mt-0.5">Email everyone following your klub about this run</p>
                </div>
              </div>
              <div className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-300 ease-out ${notifyFollowers ? "bg-[#c5f135]" : "bg-[#2e3d1a]"}`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${notifyFollowers ? "translate-x-[22px]" : "translate-x-0"}`} />
              </div>
            </button>
          )}

          <button type="submit" disabled={loading || !date || !time || (quickMode && dayOfWeek === null)}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-2xl disabled:opacity-40 hover:bg-[#d4ff45] transition">
            <CalendarPlus className="w-4 h-4" />
            {loading
              ? "Scheduling…"
              : quickMode
                ? "Create Weekly Run"
                : repeatWeekly
                  ? `Schedule ${repeatWeeks} Runs`
                  : "Schedule Run"}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function CreateRunPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    }>
      <CreateRunContent />
    </Suspense>
  )
}
