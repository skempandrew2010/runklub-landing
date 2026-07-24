"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { localDateStr } from "@/utils/dates"
import { MessageSquare } from "lucide-react"
import RunChatPanel from "@/components/RunChatPanel"

type ChatMessage = {
  id: string
  run_id: string
  user_id: string
  message: string
  created_at: string
  profiles: { display_name: string | null; avatar_url: string | null } | null
}

type RunWithClub = {
  id: string
  title: string
  date: string
  time: string
  club_id: string
  distance: string | null
  meeting_point: string | null
  route_url: string | null
  clubs: { name: string; image_url: string | null } | null
}

type RunChatPreview = RunWithClub & {
  message_count: number
  last_message: ChatMessage | null
}

function clubAbbr(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow"
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function formatChatTime(iso: string) {
  const d = new Date(iso)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return "now"
  if (diffMin < 60) return `${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function MemberChatInbox({ userId }: { userId: string }) {
  const [runs, setRuns] = useState<RunChatPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRun, setSelectedRun] = useState<RunWithClub | null>(null)

  useEffect(() => {
    const load = async () => {
      const [{ data: subs }, { data: memberships }, { data: chattable }] = await Promise.all([
        supabase.from("subscriptions").select("club_id").eq("user_id", userId),
        supabase.from("members").select("club_id").eq("user_id", userId).eq("status", "active"),
        supabase.rpc("my_chattable_run_ids"),
      ])
      const clubIds = Array.from(new Set([
        ...(subs || []).map((s: any) => s.club_id),
        ...(memberships || []).map((m: any) => m.club_id),
      ]))
      const chattableRunIds = new Set(((chattable as { run_id: string }[]) || []).map((r) => r.run_id))
      if (clubIds.length === 0 || chattableRunIds.size === 0) { setLoading(false); return }

      const today = localDateStr()
      const { data: allRunsData } = await supabase.from("runs").select("*, clubs(name, image_url)").in("club_id", clubIds).eq("kind", "run").gte("date", today).order("date").order("time")
      const runsData = (allRunsData || []).filter((r: any) => chattableRunIds.has(r.id))
      if (runsData.length === 0) { setLoading(false); return }

      const runIds = runsData.map((r: any) => r.id)
      // Preview only group messages here — DMs are visible inside the panel itself
      const { data: chats } = await supabase.from("run_chats").select("*, profiles(display_name, avatar_url)").in("run_id", runIds).is("recipient_id", null).order("created_at", { ascending: false })
      const chatsByRun: Record<string, ChatMessage[]> = {}
      for (const msg of (chats || []) as ChatMessage[]) {
        if (!chatsByRun[msg.run_id]) chatsByRun[msg.run_id] = []
        chatsByRun[msg.run_id].push(msg)
      }

      const withPreviews: RunChatPreview[] = (runsData as RunWithClub[]).map((r) => ({
        ...r,
        message_count: chatsByRun[r.id]?.length || 0,
        last_message: chatsByRun[r.id]?.[0] || null,
      }))

      withPreviews.sort((a, b) => {
        if (a.last_message && b.last_message) return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime()
        if (a.last_message) return -1
        if (b.last_message) return 1
        return a.date.localeCompare(b.date)
      })

      setRuns(withPreviews)
      setLoading(false)
    }
    load()
  }, [userId])

  if (selectedRun) {
    return (
      <RunChatPanel
        run={{
          id: selectedRun.id,
          title: selectedRun.title,
          date: selectedRun.date,
          time: selectedRun.time,
          distance: selectedRun.distance,
          meeting_point: selectedRun.meeting_point,
          clubName: selectedRun.clubs?.name || "Klub",
          clubImageUrl: selectedRun.clubs?.image_url,
        }}
        userId={userId}
        onClose={() => setSelectedRun(null)}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="bg-[#1e2d12] rounded-2xl p-6 text-center border border-[#2e3d1a]">
        <MessageSquare className="w-10 h-10 text-white/20 mx-auto mb-3" />
        <p className="text-white/80 text-sm font-medium">No upcoming runs</p>
        <p className="text-white/30 text-xs mt-1 mb-5">Join a klub to see event chats here.</p>
        <Link href="/explore" className="px-5 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full">
          Discover Klubs
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-[#1e2d12] rounded-2xl overflow-hidden border border-[#2e3d1a] divide-y divide-[#2e3d1a]">
      {runs.map((run) => {
        const clubName = run.clubs?.name || "Klub"
        const dayLabel = formatDay(run.date)
        const isToday = dayLabel === "Today"
        return (
          <button key={run.id} onClick={() => setSelectedRun(run)}
            className="w-full flex items-center gap-3.5 px-4 py-4 hover:bg-[#2e3d1a]/40 transition text-left">
            <div className="w-11 h-11 rounded-xl bg-[#2e3d1a] shrink-0 overflow-hidden flex items-center justify-center">
              {run.clubs?.image_url
                ? <img src={run.clubs.image_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-xs font-black text-[#c5f135]">{clubAbbr(clubName)}</span>
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <p className="text-sm font-bold text-white truncate">{run.title}</p>
                <span className="shrink-0 text-[10px] text-white/30">
                  {run.last_message ? formatChatTime(run.last_message.created_at) : <span className={isToday ? "text-[#c5f135] font-semibold" : ""}>{dayLabel}</span>}
                </span>
              </div>
              <p className="text-xs text-white/80 truncate">{clubName} · {isToday ? "Today" : dayLabel} at {formatTime(run.time)}</p>
              {run.last_message ? (
                <p className="text-xs text-white/80 truncate mt-1">
                  <span className="text-white/80 font-medium">{run.last_message.profiles?.display_name || "Runner"}:</span>{" "}{run.last_message.message}
                </p>
              ) : (
                <p className="text-xs text-white/20 truncate mt-1">No messages yet</p>
              )}
            </div>
            {run.message_count > 0 && (
              <div className="shrink-0 w-5 h-5 rounded-full bg-[#c5f135] flex items-center justify-center">
                <span className="text-[9px] font-black text-[#1a2110]">{run.message_count > 9 ? "9+" : run.message_count}</span>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
