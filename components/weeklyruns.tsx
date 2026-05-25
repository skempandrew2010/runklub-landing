"use client"

import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { getDistanceMiles } from "@/utils/distance"
import { Club } from "@/types/club"
import { CalendarCheck, Clock, MapPin } from "lucide-react"
import { localDateStr } from "@/utils/dates"

type WeekRun = {
  id: string
  title: string
  date: string
  time: string
  distance: string | null
  meeting_point: string | null
  club_id: string
  club_name: string
  club_image: string | null
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow"
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`
}

type Props = {
  clubs: Club[]
  center: { lat: number; lng: number } | null
  locationLabel?: string
}

export default function WeeklyRuns({ clubs, center, locationLabel = "near you" }: Props) {
  const [weekRuns, setWeekRuns] = useState<WeekRun[]>([])
  const [loading, setLoading] = useState(false)

  // Stable dependency — only re-fetch when club IDs or center coords actually change
  const clubIds = useMemo(() => clubs.map((c) => c.id).sort().join(","), [clubs])
  const centerKey = center ? `${center.lat.toFixed(4)},${center.lng.toFixed(4)}` : null

  useEffect(() => {
    async function load() {
      if (!center || clubs.length === 0) {
        setWeekRuns([])
        return
      }

      const nearbyClubs = clubs.filter((c) => {
        if (c.latitude == null || c.longitude == null) return false
        return getDistanceMiles(center.lat, center.lng, c.latitude, c.longitude) <= 50
      })

      if (nearbyClubs.length === 0) {
        setWeekRuns([])
        return
      }

      setLoading(true)
      const todayStr = localDateStr()
      const weekAhead = new Date()
      weekAhead.setDate(weekAhead.getDate() + 7)
      const weekStr = localDateStr(weekAhead)

      const { data } = await supabase
        .from("runs")
        .select("id, title, date, time, distance, meeting_point, club_id")
        .in("club_id", nearbyClubs.map((c) => c.id))
        .gte("date", todayStr)
        .lte("date", weekStr)
        .eq("is_public", true)
        .order("date", { ascending: true })
        .order("time", { ascending: true })

      const clubLookup = new Map(nearbyClubs.map((c) => [c.id, { name: c.name, image_url: c.image_url }]))
      setWeekRuns(
        (data || []).map((r) => ({
          ...r,
          club_name: clubLookup.get(r.club_id)?.name ?? "",
          club_image: clubLookup.get(r.club_id)?.image_url ?? null,
        }))
      )
      setLoading(false)
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubIds, centerKey])

  const grouped: Record<string, WeekRun[]> = {}
  weekRuns.forEach((r) => {
    const label = formatDate(r.date)
    if (!grouped[label]) grouped[label] = []
    grouped[label].push(r)
  })

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-white/40 tracking-widest uppercase">Runs This Week</p>
        {center && (
          <span className="text-[10px] text-white/30 font-medium">within 50 mi {locationLabel}</span>
        )}
      </div>

      {!center && (
        <div className="bg-[#1e2d12] rounded-2xl p-5 text-center">
          <p className="text-white/40 text-sm">Enable location or search a city to see nearby runs.</p>
        </div>
      )}

      {center && loading && weekRuns.length === 0 && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
        </div>
      )}

      {center && !loading && weekRuns.length === 0 && (
        <div className="bg-[#1e2d12] rounded-2xl p-5 text-center">
          <CalendarCheck className="w-8 h-8 text-white/20 mx-auto mb-2" />
          <p className="text-white/40 text-sm">No runs scheduled nearby this week.</p>
        </div>
      )}

      {weekRuns.length > 0 && (
        <div className="space-y-4">
          {Object.entries(grouped).map(([dateLabel, dayRuns]) => (
            <div key={dateLabel}>
              <p className="text-[11px] font-bold text-[#c5f135]/70 tracking-wider uppercase mb-2 px-1">
                {dateLabel}
              </p>
              <div className="bg-[#1e2d12] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
                {dayRuns.map((run) => (
                  <div key={run.id} className="px-4 py-3.5 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#2e3d1a] shrink-0 overflow-hidden flex items-center justify-center">
                      {run.club_image ? (
                        <img src={run.club_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-black text-white/50">
                          {run.club_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white leading-tight">{run.title}</p>
                      <p className="text-[11px] text-[#c5f135]/80 font-medium mt-0.5">{run.club_name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                        <span className="flex items-center gap-1 text-xs text-white/50">
                          <Clock className="w-3 h-3" /> {formatTime(run.time)}
                        </span>
                        {run.meeting_point && (
                          <span className="flex items-center gap-1 text-xs text-white/50">
                            <MapPin className="w-3 h-3" /> {run.meeting_point}
                          </span>
                        )}
                        {run.distance && (
                          <span className="text-xs text-white/40">{run.distance}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
