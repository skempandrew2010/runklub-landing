"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Check } from "lucide-react"
import mapboxSdk from "@mapbox/mapbox-sdk/services/geocoding"

const geocodingClient = mapboxSdk({ accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN! })

const TAG_GROUPS = [
  { label: "Pace",  tags: ["Easy", "Moderate", "Fast", "All Paces"] },
  { label: "Type",  tags: ["Social Run", "Long Run", "Speed Work", "Trail Run", "Race Prep", "Fun Run"] },
  { label: "Vibe",  tags: ["Beer After", "Coffee After", "Dog Friendly", "Beginner Friendly", "No Drop"] },
]

export default function EditRunPage() {
  const { clubId, runId } = useParams<{ clubId: string; runId: string }>()
  const router = useRouter()

  const [title, setTitle] = useState("")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [distance, setDistance] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [routeUrl, setRouteUrl] = useState("")
  const [description, setDescription] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const { data: run, error } = await supabase
        .from("runs")
        .select("*")
        .eq("id", runId)
        .eq("created_by", user.id)
        .single()

      if (error || !run) { setNotFound(true); setLoadingData(false); return }

      setTitle(run.title ?? "")
      setDate(run.date ?? "")
      setTime(run.time ?? "")
      setDistance(run.distance ?? "")
      setAddress(run.meeting_point ?? "")
      setCity(run.city ?? "")
      setRouteUrl(run.route_url ?? "")
      setDescription(run.description ?? "")
      setSelectedTags(run.tags ?? [])
      setLoadingData(false)
    }
    load()
  }, [runId])

  function toggleTag(tag: string) {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title || !date || !time) return
    setSaving(true)
    try {
      const coords = await geocodeAddress(address, city)

      const { error } = await supabase.from("runs").update({
        title,
        date,
        time,
        distance: distance || null,
        meeting_point: address || null,
        city: city || null,
        run_lat: coords?.lat ?? null,
        run_lng: coords?.lng ?? null,
        route_url: routeUrl || null,
        description: description || null,
        tags: selectedTags.length > 0 ? selectedTags : null,
      }).eq("id", runId)

      if (error) { console.error(error); setSaving(false); return }
      router.push(`/director`)
    } catch (err) {
      console.error(err)
      setSaving(false)
    }
  }

  const inputClass = "w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
  const labelClass = "block text-xs font-semibold text-white/50 mb-1.5"

  if (loadingData) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex flex-col items-center justify-center gap-3">
        <p className="text-white/40 text-sm">Run not found.</p>
        <button onClick={() => router.push(`/director`)} className="text-[#c5f135] text-sm font-semibold hover:underline">
          ← Back to dashboard
        </button>
      </div>
    )
  }

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
            <h1 className="text-xl font-black text-white leading-tight">Edit Run</h1>
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
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
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

          <button
            type="submit"
            disabled={saving || !title || !date || !time}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-2xl disabled:opacity-40 hover:bg-[#d4ff45] transition"
          >
            <Check className="w-4 h-4" />
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  )
}
