"use client"

import { Suspense, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, CalendarPlus, Repeat2, Globe, Lock } from "lucide-react"
import mapboxSdk from "@mapbox/mapbox-sdk/services/geocoding"

const geocodingClient = mapboxSdk({ accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN! })

const TAG_GROUPS = [
  {
    label: "Pace",
    tags: ["Easy", "Moderate", "Fast", "All Paces"],
  },
  {
    label: "Type",
    tags: ["Social Run", "Long Run", "Speed Work", "Trail Run", "Race Prep", "Fun Run"],
  },
  {
    label: "Vibe",
    tags: ["Beer After", "Coffee After", "Dog Friendly", "Beginner Friendly", "No Drop"],
  },
]

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + "T00:00:00")
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().split("T")[0]
}

function getRepeatDates(startDate: string, totalWeeks: number): string[] {
  return Array.from({ length: totalWeeks }, (_, i) => addWeeks(startDate, i))
}

function CreateRunContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const clubId = params?.clubId as string
  const router = useRouter()

  const [title, setTitle] = useState("")
  const [date, setDate] = useState(searchParams.get("date") ?? "")
  const [time, setTime] = useState("")
  const [distance, setDistance] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [routeUrl, setRouteUrl] = useState("")
  const [description, setDescription] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(true)
  const [repeatWeekly, setRepeatWeekly] = useState(false)
  const [repeatWeeks, setRepeatWeeks] = useState(4)
  const [loading, setLoading] = useState(false)

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  async function geocodeAddress(addr: string, cityName: string): Promise<{ lat: number; lng: number } | null> {
    const query = [addr, cityName].filter(Boolean).join(", ")
    if (!query) return null
    try {
      const res = await geocodingClient.forwardGeocode({ query, limit: 1 }).send()
      const match = res.body.features[0]
      if (match) return { lat: match.center[1], lng: match.center[0] }
    } catch {}
    return null
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!title || !date || !time) return
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
        distance: distance || null,
        meeting_point: address || null,
        city: city || null,
        run_lat: coords?.lat ?? null,
        run_lng: coords?.lng ?? null,
        route_url: routeUrl || null,
        description: description || null,
        tags: selectedTags.length > 0 ? selectedTags : null,
        is_public: isPublic,
        created_by: user.id,
      }

      const dates = repeatWeekly ? getRepeatDates(date, repeatWeeks) : [date]
      const rows = dates.map((d) => ({ ...baseRun, date: d }))

      const { error } = await supabase.from("runs").insert(rows)

      if (error) { console.error(error); setLoading(false); return }
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
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push(`/director`)}
            className="w-9 h-9 rounded-full bg-[#1e2d12] border border-[#2e3d1a] flex items-center justify-center text-white/60 hover:text-white transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-black text-white leading-tight">Schedule a Run</h1>
            {date && (
              <p className="text-xs text-white/40 mt-0.5">
                {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Core details */}
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-4">

            <div>
              <label className={labelClass}>Run Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Saturday Morning 5K"
                required
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Date *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Time *</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Distance</label>
                <input
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  placeholder="e.g. 5K, 10 mi"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Route Link <span className="text-white/25 font-normal">(optional)</span></label>
                <input
                  value={routeUrl}
                  onChange={(e) => setRouteUrl(e.target.value)}
                  placeholder="Strava link…"
                  type="url"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Description <span className="text-white/25 font-normal">(optional)</span></label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pace, terrain, what to bring…"
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>

          {/* Location */}
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-white/50 mb-0.5">Run Location</p>
              <p className="text-[11px] text-white/25">Used to pin this run on the discover map</p>
            </div>

            <div>
              <label className={labelClass}>Meeting Address</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 1600 Pearl St, Central Park"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Boulder, CO"
                className={inputClass}
              />
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
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-100
                          ${active
                            ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]"
                            : "bg-transparent text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"
                          }`}
                      >
                        {tag}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Visibility */}
          <button
            type="button"
            onClick={() => setIsPublic((v) => !v)}
            className="w-full bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-3">
              {isPublic
                ? <Globe className="w-4 h-4 text-[#c5f135] shrink-0" />
                : <Lock className="w-4 h-4 text-white/40 shrink-0" />
              }
              <div>
                <p className="text-xs font-semibold text-white/70">
                  {isPublic ? "Public Run" : "Members Only"}
                </p>
                <p className="text-[11px] text-white/30 mt-0.5">
                  {isPublic ? "Visible to everyone on the discover map" : "Only visible to club members"}
                </p>
              </div>
            </div>
            <div className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${isPublic ? "bg-[#c5f135]" : "bg-[#2e3d1a]"}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${isPublic ? "left-[22px]" : "left-0.5"}`} />
            </div>
          </button>

          {/* Repeat Weekly */}
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-4">
            <button
              type="button"
              onClick={() => setRepeatWeekly((v) => !v)}
              className="w-full flex items-center justify-between gap-3"
            >
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
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRepeatWeeks(n)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                          repeatWeeks === n
                            ? "bg-[#c5f135] text-[#1a2110] border-[#c5f135]"
                            : "bg-transparent text-white/50 border-[#2e3d1a] hover:border-[#c5f135]/40 hover:text-white/70"
                        }`}
                      >
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

          <button
            type="submit"
            disabled={loading || !title || !date || !time}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-2xl disabled:opacity-40 hover:bg-[#d4ff45] transition"
          >
            <CalendarPlus className="w-4 h-4" />
            {loading
              ? "Scheduling…"
              : repeatWeekly
                ? `Schedule ${repeatWeeks} Runs`
                : "Schedule Run"
            }
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
