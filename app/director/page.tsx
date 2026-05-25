"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { localDateStr } from "@/utils/dates"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Send, Plus, Trophy, Users, CalendarPlus,
  MessageSquare, MapPin, Ruler, ExternalLink,
  Pencil, Trash2, Clock, Calendar, Zap, ShieldCheck,
  Globe, Lock, Check, X, Mail,
} from "lucide-react"
import { getTagStyle } from "@/utils/tagStyle"
import ShareRunButton from "@/components/ShareRunButton"

// ── Types ──────────────────────────────────────────────────────────────────────

type Profile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  role: string | null
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
  tags: string[] | null
  clubs: { name: string; image_url: string | null } | null
}

type ChatMessage = {
  id: string
  run_id: string
  user_id: string
  message: string
  created_at: string
  profiles: { display_name: string | null; avatar_url: string | null } | null
}

type RunChatPreview = RunWithClub & {
  message_count: number
  last_message: ChatMessage | null
}

type ClubWithCount = {
  id: string
  name: string
  city: string | null
  location: string | null
  meeting_day: string | null
  meeting_time: string | null
  image_url: string | null
  tier: string | null
  member_count: number
  is_public: boolean
  instagram_handle: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const GRADIENTS = [
  "from-[#2d5a1b] to-[#111a0a]",
  "from-[#1b3d5a] to-[#111a0a]",
  "from-[#5a3d1b] to-[#111a0a]",
  "from-[#3d1b5a] to-[#111a0a]",
  "from-[#1b5a3d] to-[#111a0a]",
  "from-[#5a2b1b] to-[#111a0a]",
]

function getGradient(name: string) {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return GRADIENTS[hash % GRADIENTS.length]
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

function clubAbbr(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

// ── Chat Panel ─────────────────────────────────────────────────────────────────

function ChatPanel({
  run,
  userId,
  profile,
  onClose,
}: {
  run: RunWithClub
  userId: string
  profile: Profile
  onClose: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from("run_chats")
      .select("*, profiles(display_name, avatar_url)")
      .eq("run_id", run.id)
      .order("created_at", { ascending: true })
    setMessages((data || []) as ChatMessage[])
    setLoading(false)
  }, [run.id])

  useEffect(() => {
    loadMessages()
    const channel = supabase
      .channel(`run-chat-${run.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "run_chats", filter: `run_id=eq.${run.id}` }, () => loadMessages())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [run.id, loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || sending || text.length > 500) return
    setSending(true)
    setInput("")
    await supabase.from("run_chats").insert({ run_id: run.id, user_id: userId, message: text })
    setSending(false)
    inputRef.current?.focus()
  }

  const clubName = run.clubs?.name || "Club"

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#111a0a]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2e3d1a] bg-[#1a2110] shrink-0">
        <button onClick={onClose} className="text-white/50 hover:text-white transition p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-[#2e3d1a]">
          {run.clubs?.image_url
            ? <img src={run.clubs.image_url} alt="" className="w-full h-full object-cover" />
            : <span className="text-xs font-black text-[#c5f135]">{clubAbbr(clubName)}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{run.title}</p>
          <p className="text-xs text-white/40 truncate">{clubName} · {formatDay(run.date)} at {formatTime(run.time)}</p>
        </div>
      </div>

      {(run.distance || run.meeting_point || run.route_url) && (
        <div className="shrink-0 px-4 py-3 border-b border-[#2e3d1a] bg-[#141f0d] flex flex-wrap gap-2">
          {run.distance && (
            <div className="flex items-center gap-1.5 bg-[#1e2d12] rounded-full px-3 py-1.5 text-xs font-medium text-white/70">
              <Ruler className="w-3.5 h-3.5 text-[#c5f135] shrink-0" />{run.distance}
            </div>
          )}
          {run.meeting_point && (
            <div className="flex items-center gap-1.5 bg-[#1e2d12] rounded-full px-3 py-1.5 text-xs font-medium text-white/70 max-w-[60%]">
              <MapPin className="w-3.5 h-3.5 text-[#c5f135] shrink-0" />
              <span className="truncate">{run.meeting_point}</span>
            </div>
          )}
          {run.route_url && (
            <a href={run.route_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-[#c5f135]/10 border border-[#c5f135]/30 rounded-full px-3 py-1.5 text-xs font-bold text-[#c5f135] hover:bg-[#c5f135]/20 transition">
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />View Route
            </a>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center pb-20">
            <MessageSquare className="w-10 h-10 text-white/15 mb-3" />
            <p className="text-white/40 text-sm font-medium">No messages yet</p>
            <p className="text-white/25 text-xs mt-1">Be the first to say something!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === userId
            const name = msg.profiles?.display_name || "Runner"
            const initial = name[0]?.toUpperCase() || "?"
            return (
              <div key={msg.id} className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                {!isMe && (
                  <div className="w-7 h-7 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0 mt-auto overflow-hidden">
                    {msg.profiles?.avatar_url
                      ? <img src={msg.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-xs font-bold text-[#c5f135]">{initial}</span>
                    }
                  </div>
                )}
                <div className={`max-w-[72%] flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
                  {!isMe && <p className="text-[10px] text-white/35 px-1 font-medium">{name}</p>}
                  <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${isMe ? "bg-[#c5f135] text-[#1a2110] font-medium rounded-br-sm" : "bg-[#1e2d12] text-white rounded-bl-sm"}`}>
                    {msg.message}
                  </div>
                  <p className="text-[10px] text-white/25 px-1">{formatChatTime(msg.created_at)}</p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-4 py-3 border-t border-[#2e3d1a] bg-[#1a2110] flex items-end gap-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="Message…"
          maxLength={500}
          rows={1}
          className="flex-1 bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-[#c5f135]/50 resize-none transition"
          style={{ maxHeight: "120px" }}
        />
        <button onClick={sendMessage} disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full bg-[#c5f135] flex items-center justify-center shrink-0 hover:bg-[#d4ff45] transition disabled:opacity-30">
          <Send className="w-4 h-4 text-[#1a2110]" />
        </button>
      </div>
    </div>
  )
}

// ── Manager View ───────────────────────────────────────────────────────────────

function ManagerView({ userId, profile }: { userId: string; profile: Profile }) {
  const router = useRouter()
  const [tab, setTab] = useState<"runs" | "messages" | "settings">("runs")
  const [myClubs, setMyClubs] = useState<ClubWithCount[]>([])
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [allRuns, setAllRuns] = useState<RunChatPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRun, setSelectedRun] = useState<RunWithClub | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: "", city: "", location: "", day: "", time: "", instagram: "" })
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: clubs } = await supabase
        .from("clubs")
        .select("id, name, city, location, meeting_day, meeting_time, image_url, tier, is_public, instagram_handle")
        .eq("user_id", userId)

      const rawClubs = clubs || []
      const clubIds = rawClubs.map((c: any) => c.id)

      const counts = await Promise.all(
        clubIds.map((id: string) =>
          supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("club_id", id)
        )
      )
      const clubsWithCounts: ClubWithCount[] = rawClubs.map((c: any, i: number) => ({
        ...c,
        member_count: counts[i].count ?? 0,
      }))
      setMyClubs(clubsWithCounts)
      if (clubsWithCounts.length > 0) setSelectedClubId(clubsWithCounts[0].id)

      if (clubIds.length === 0) { setLoading(false); return }

      const today = localDateStr()
      const { data: runs } = await supabase
        .from("runs")
        .select("*, clubs(name, image_url)")
        .in("club_id", clubIds)
        .gte("date", today)
        .order("date")
        .order("time")

      if (!runs || runs.length === 0) { setLoading(false); return }

      const runIds = runs.map((r: any) => r.id)
      const { data: chats } = await supabase
        .from("run_chats")
        .select("*, profiles(display_name, avatar_url)")
        .in("run_id", runIds)
        .order("created_at", { ascending: false })

      const chatsByRun: Record<string, ChatMessage[]> = {}
      for (const msg of (chats || []) as ChatMessage[]) {
        if (!chatsByRun[msg.run_id]) chatsByRun[msg.run_id] = []
        chatsByRun[msg.run_id].push(msg)
      }

      setAllRuns(
        (runs as RunWithClub[]).map((r) => ({
          ...r,
          message_count: chatsByRun[r.id]?.length || 0,
          last_message: chatsByRun[r.id]?.[0] || null,
        }))
      )
      setLoading(false)
    }
    load()
  }, [userId])

  const deleteRun = async (runId: string) => {
    if (!confirm("Delete this run? This cannot be undone.")) return
    setAllRuns((prev) => prev.filter((r) => r.id !== runId))
    await supabase.from("runs").delete().eq("id", runId).eq("created_by", userId)
  }

  useEffect(() => {
    const club = myClubs.find((c) => c.id === selectedClubId)
    if (!club) return
    setEditForm({
      name: club.name ?? "",
      city: club.city ?? "",
      location: club.location ?? "",
      day: club.meeting_day ?? "",
      time: club.meeting_time ?? "",
      instagram: club.instagram_handle ?? "",
    })
    setEditing(false)
  }, [selectedClubId]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveEdit = async () => {
    if (!selectedClubId) return
    setSavingEdit(true)
    const rawHandle = editForm.instagram.trim().replace(/^@/, "")
    await supabase.from("clubs").update({
      name: editForm.name,
      city: editForm.city,
      location: editForm.location,
      meeting_day: editForm.day || null,
      meeting_time: editForm.time || null,
      instagram_handle: rawHandle || null,
    }).eq("id", selectedClubId)
    setMyClubs((prev) => prev.map((c) => c.id === selectedClubId ? {
      ...c,
      name: editForm.name,
      city: editForm.city,
      location: editForm.location,
      meeting_day: editForm.day || null,
      meeting_time: editForm.time || null,
      instagram_handle: rawHandle || null,
    } : c))
    setSavingEdit(false)
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!selectedClubId) return
    const club = myClubs.find((c) => c.id === selectedClubId)
    if (!confirm(`Delete ${club?.name ?? "this club"}? This cannot be undone.`)) return
    await supabase.from("clubs").delete().eq("id", selectedClubId)
    const remaining = myClubs.filter((c) => c.id !== selectedClubId)
    setMyClubs(remaining)
    if (remaining.length > 0) setSelectedClubId(remaining[0].id)
  }

  const toggleClubVisibility = async () => {
    const club = myClubs.find((c) => c.id === selectedClubId)
    if (!club) return
    const next = !club.is_public
    const { error } = await supabase.from("clubs").update({ is_public: next }).eq("id", selectedClubId)
    if (!error) setMyClubs((prev) => prev.map((c) => c.id === selectedClubId ? { ...c, is_public: next } : c))
  }

  if (selectedRun) {
    return <ChatPanel run={selectedRun} userId={userId} profile={profile} onClose={() => setSelectedRun(null)} />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (myClubs.length === 0) {
    return (
      <div className="min-h-screen bg-[#1a2110]">
        <div className="max-w-2xl mx-auto px-5 py-20 text-center">
          <Trophy className="w-12 h-12 text-white/15 mx-auto mb-4" />
          <p className="text-white/60 text-base font-semibold">No clubs yet</p>
          <p className="text-white/30 text-sm mt-1 mb-6">Create your first run club to get started.</p>
          <Link href="/submit-club" className="px-6 py-3 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition">
            + Create a Club
          </Link>
        </div>
      </div>
    )
  }

  const selectedClub = myClubs.find((c) => c.id === selectedClubId) ?? myClubs[0]
  const clubRuns = allRuns.filter((r) => r.club_id === selectedClub.id)
  const runsWithMessages = [...allRuns]
    .filter((r) => r.message_count > 0)
    .sort((a, b) => {
      const aT = a.last_message?.created_at ?? a.date
      const bT = b.last_message?.created_at ?? b.date
      return new Date(bT).getTime() - new Date(aT).getTime()
    })
  const runsNoMessages = allRuns.filter((r) => r.message_count === 0)
  const hasUnread = runsWithMessages.length > 0
  const todayStr = localDateStr()
  const gradient = getGradient(selectedClub.name)
  const initials = selectedClub.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">

      {/* ── CLUB SWITCHER — only when managing multiple clubs ── */}
      {myClubs.length > 1 && (
        <div className="bg-[#111a0a] border-b border-[#2e3d1a] px-4 py-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest shrink-0 mr-1">My Clubs</p>
          {myClubs.map((club) => (
            <button
              key={club.id}
              onClick={() => setSelectedClubId(club.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition ${
                selectedClubId === club.id
                  ? "bg-[#c5f135] text-[#1a2110]"
                  : "bg-[#1e2d12] text-white/50 border border-[#2e3d1a] hover:border-[#c5f135]/30 hover:text-white/70"
              }`}
            >
              <div className="w-4 h-4 rounded-full shrink-0 overflow-hidden flex items-center justify-center bg-[#2e3d1a]">
                {club.image_url
                  ? <img src={club.image_url} alt="" className="w-full h-full object-cover" />
                  : <span className="text-[8px] font-black text-[#c5f135]">{clubAbbr(club.name)}</span>
                }
              </div>
              {club.name}
            </button>
          ))}
          <Link
            href="/submit-club"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 text-white/30 border border-[#2e3d1a] hover:border-[#c5f135]/30 hover:text-white/50 transition ml-1"
          >
            <Plus className="w-3 h-3" /> New
          </Link>
        </div>
      )}

      {/* ── HERO — same layout as club detail page ── */}
      <div className={`relative bg-gradient-to-b ${gradient} border-b border-[#2e3d1a]`}>
        {selectedClub.image_url && (
          <div className="absolute inset-0 overflow-hidden">
            <img src={selectedClub.image_url} alt="" className="w-full h-full object-cover opacity-20" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#111a0a]/60 to-[#111a0a]" />
          </div>
        )}
        <div className="relative max-w-2xl mx-auto px-5 pt-5 pb-8">
          {myClubs.length === 1 && (
            <p className="text-[10px] font-bold text-[#c5f135]/40 uppercase tracking-widest mb-5">Club Manager</p>
          )}
          <div className="flex items-end gap-4">
            <div className={`w-20 h-20 rounded-2xl overflow-hidden shrink-0 bg-gradient-to-br ${gradient} flex items-center justify-center border border-white/10`}>
              {selectedClub.image_url
                ? <img src={selectedClub.image_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-2xl font-black text-white/30">{initials}</span>
              }
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-2xl font-black text-white leading-tight">{selectedClub.name}</h1>
                {selectedClub.tier === "pro" && (
                  <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110]">
                    <Zap className="w-2.5 h-2.5" /> PRO
                  </span>
                )}
                {selectedClub.tier === "verified" && (
                  <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30">
                    <ShieldCheck className="w-2.5 h-2.5" /> VERIFIED
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {selectedClub.city && (
                  <p className="text-sm text-white/50 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{selectedClub.city}
                  </p>
                )}
                <p className="text-sm text-white/50 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {selectedClub.member_count} {selectedClub.member_count === 1 ? "member" : "members"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">

        {/* ── TABS + SCHEDULE BUTTON ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex bg-[#1e2d12] rounded-xl p-1 border border-[#2e3d1a]">
            <button
              onClick={() => setTab("runs")}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition ${tab === "runs" ? "bg-[#c5f135] text-[#1a2110]" : "text-white/40 hover:text-white/60"}`}
            >
              Runs
            </button>
            <button
              onClick={() => setTab("messages")}
              className={`relative px-3 py-2 rounded-lg text-sm font-bold transition ${tab === "messages" ? "bg-[#c5f135] text-[#1a2110]" : "text-white/40 hover:text-white/60"}`}
            >
              Messages
              {hasUnread && tab !== "messages" && (
                <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#c5f135] ring-1 ring-[#1e2d12]" />
              )}
            </button>
            <button
              onClick={() => setTab("settings")}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition ${tab === "settings" ? "bg-[#c5f135] text-[#1a2110]" : "text-white/40 hover:text-white/60"}`}
            >
              Settings
            </button>
          </div>
          {tab === "runs" && (
            <button
              onClick={() => router.push(`/dashboard/${selectedClub.id}/create-run`)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition shrink-0"
            >
              <CalendarPlus className="w-4 h-4" /> Schedule Run
            </button>
          )}
        </div>

        {/* ── RUNS TAB ── */}
        {tab === "runs" && (
          <>
            {/* Regular meeting info */}
            {(selectedClub.meeting_day || selectedClub.meeting_time || selectedClub.location) && (
              <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-2.5">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Regular Meeting</p>
                {(selectedClub.meeting_day || selectedClub.meeting_time) && (
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Calendar className="w-4 h-4 text-[#c5f135] shrink-0" />
                    <span>
                      {[
                        selectedClub.meeting_day,
                        selectedClub.meeting_time ? formatTime(selectedClub.meeting_time) : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                )}
                {selectedClub.location && (
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <MapPin className="w-4 h-4 text-[#c5f135] shrink-0" />
                    <span>{selectedClub.location}</span>
                  </div>
                )}
              </div>
            )}

            {/* Upcoming runs */}
            <div>
              <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest px-1 mb-3">Upcoming Runs</h2>
              {clubRuns.length === 0 ? (
                <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-10 text-center">
                  <CalendarPlus className="w-10 h-10 text-white/15 mx-auto mb-3" />
                  <p className="text-white/50 text-sm font-medium">No upcoming runs scheduled</p>
                  <p className="text-white/25 text-xs mt-1 mb-5">Schedule your next run to get members together.</p>
                  <button
                    onClick={() => router.push(`/dashboard/${selectedClub.id}/create-run`)}
                    className="px-5 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
                  >
                    + Schedule a Run
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {clubRuns.map((run) => {
                    const d = new Date(run.date + "T00:00:00")
                    const isToday = run.date === todayStr
                    return (
                      <div
                        key={run.id}
                        className={`rounded-2xl border overflow-hidden ${isToday ? "bg-[#c5f135]/5 border-[#c5f135]/25" : "bg-[#1e2d12] border-[#2e3d1a]"}`}
                      >
                        {/* Run info */}
                        <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                          <div className={`shrink-0 rounded-xl px-2.5 py-1.5 text-center min-w-[48px] ${isToday ? "bg-[#c5f135]/20" : "bg-[#2e3d1a]"}`}>
                            <p className={`text-[9px] font-bold uppercase tracking-wider ${isToday ? "text-[#c5f135]" : "text-white/40"}`}>
                              {isToday ? "TODAY" : d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                            </p>
                            <p className={`text-lg font-black leading-tight ${isToday ? "text-[#c5f135]" : "text-white"}`}>{d.getDate()}</p>
                            <p className={`text-[9px] font-semibold ${isToday ? "text-[#c5f135]/60" : "text-white/25"}`}>
                              {d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                            </p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white">{run.title}</p>
                            <p className="text-xs text-white/50 mt-0.5 flex items-center gap-1">
                              <Clock className="w-3 h-3 shrink-0" />
                              {formatTime(run.time)}
                              {run.distance && <><span className="text-white/20">·</span>{run.distance}</>}
                            </p>
                            {run.meeting_point && (
                              <p className="text-xs text-white/35 mt-0.5 flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">{run.meeting_point}</span>
                              </p>
                            )}
                            {run.tags && run.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {run.tags.map((tag) => (
                                  <span key={tag} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getTagStyle(tag)}`}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Manager action row */}
                        <div className={`flex items-center gap-1 px-3 py-2 border-t ${isToday ? "border-[#c5f135]/10" : "border-[#2e3d1a]"}`}>
                          <button
                            onClick={() => router.push(`/dashboard/${selectedClub.id}/edit-run/${run.id}`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white/40 hover:text-[#c5f135] hover:bg-[#c5f135]/5 transition"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                          <button
                            onClick={() => setSelectedRun(run)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white/40 hover:text-[#c5f135] hover:bg-[#c5f135]/5 transition"
                          >
                            <MessageSquare className="w-3 h-3" /> Chat
                            {run.message_count > 0 && (
                              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-[#c5f135]/15 text-[#c5f135] text-[9px] font-black">
                                {run.message_count}
                              </span>
                            )}
                          </button>
                          <ShareRunButton run={{
                            title: run.title,
                            date: run.date,
                            time: run.time,
                            distance: run.distance,
                            meeting_point: run.meeting_point,
                            tags: run.tags,
                            clubName: selectedClub.name,
                            clubImageUrl: selectedClub.image_url,
                          }} />
                          <button
                            onClick={() => deleteRun(run.id)}
                            className="ml-auto p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/5 transition"
                            title="Delete run"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {myClubs.length === 1 && (
              <div className="text-center pt-1">
                <Link href="/submit-club" className="text-xs text-white/25 hover:text-white/40 transition">
                  + Add another club
                </Link>
              </div>
            )}
          </>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest px-1 mb-3">Club Settings</h2>
              <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] overflow-hidden">
                <button
                  onClick={toggleClubVisibility}
                  className="w-full flex items-center gap-3 px-4 py-4 hover:bg-[#2e3d1a]/40 transition text-left border-b border-[#2e3d1a]"
                >
                  {selectedClub.is_public
                    ? <Globe className="w-4 h-4 text-[#c5f135] shrink-0" />
                    : <Lock className="w-4 h-4 text-white/50 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">Club Visibility</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {selectedClub.is_public ? "Visible on the discover map" : "Hidden — only members can find you"}
                    </p>
                  </div>
                  <span className={`text-xs font-black px-2.5 py-1 rounded-full shrink-0 ${
                    selectedClub.is_public
                      ? "bg-[#c5f135]/10 text-[#c5f135] border border-[#c5f135]/30"
                      : "bg-white/5 text-white/40 border border-white/15"
                  }`}>
                    {selectedClub.is_public ? "Public" : "Private"}
                  </span>
                </button>

                <button
                  onClick={() => setEditing(!editing)}
                  className="w-full flex items-center gap-3 px-4 py-4 hover:bg-[#2e3d1a]/40 transition text-left border-b border-[#2e3d1a]"
                >
                  <Pencil className="w-4 h-4 text-white/50 shrink-0" />
                  <span className="flex-1 text-sm font-medium text-white">Edit Club Details</span>
                  <span className="text-xs text-white/30">{editing ? "Cancel" : "Edit"}</span>
                </button>

                {editing && (
                  <div className="px-4 py-4 space-y-3 border-b border-[#2e3d1a]">
                    {([
                      { label: "Club Name", field: "name", placeholder: "e.g. Boulder Trail Runners" },
                      { label: "City", field: "city", placeholder: "e.g. Boulder, CO" },
                      { label: "Location", field: "location", placeholder: "Meeting address or landmark" },
                      { label: "Meeting Day", field: "day", placeholder: "e.g. Saturday" },
                    ] as const).map(({ label, field, placeholder }) => (
                      <div key={field}>
                        <label className="block text-xs font-semibold text-white/50 mb-1">{label}</label>
                        <input
                          value={editForm[field]}
                          onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })}
                          placeholder={placeholder}
                          className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                        />
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs font-semibold text-white/50 mb-1">Meeting Time</label>
                      <input
                        type="time"
                        value={editForm.time}
                        onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                        className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/50 mb-1">Instagram <span className="font-normal text-white/25">(optional)</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm pointer-events-none">@</span>
                        <input
                          value={editForm.instagram}
                          onChange={(e) => setEditForm({ ...editForm, instagram: e.target.value.replace(/^@/, "") })}
                          placeholder="yourclubhandle"
                          className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl pl-7 pr-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={saveEdit}
                        disabled={savingEdit}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#c5f135] text-[#1a2110] rounded-full text-xs font-black disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" /> {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditing(false)}
                        className="flex items-center gap-1.5 px-4 py-2 border border-[#2e3d1a] text-white/50 rounded-full text-xs"
                      >
                        <X className="w-3 h-3" /> Cancel
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-3 px-4 py-4 hover:bg-red-500/10 transition text-left"
                >
                  <Trash2 className="w-4 h-4 text-red-400/70 shrink-0" />
                  <span className="text-sm font-medium text-red-400/70">Delete Club</span>
                </button>
              </div>
            </div>

            {/* Email Members — Coming Soon */}
            <div>
              <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest px-1 mb-3">Email Members</h2>
              <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 opacity-60 cursor-not-allowed select-none">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#2e3d1a] flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-white/30" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white/50">Send Newsletter</p>
                      <p className="text-xs text-white/30 mt-0.5">Email all club members</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-[#c5f135]/10 text-[#c5f135] border border-[#c5f135]/20 shrink-0">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MESSAGES TAB ── */}
        {tab === "messages" && (
          <div className="space-y-4">
            {allRuns.length === 0 ? (
              <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-12 text-center">
                <MessageSquare className="w-10 h-10 text-white/15 mx-auto mb-3" />
                <p className="text-white/50 text-sm font-medium">No upcoming runs</p>
                <p className="text-white/25 text-xs mt-1">Schedule a run to start seeing messages here.</p>
              </div>
            ) : (
              <>
                {runsWithMessages.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest px-1 mb-2">Active Chats</p>
                    <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] overflow-hidden divide-y divide-[#2e3d1a]">
                      {runsWithMessages.map((run) => (
                        <button
                          key={run.id}
                          onClick={() => setSelectedRun(run)}
                          className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#2e3d1a]/40 transition text-left"
                        >
                          <div className="w-10 h-10 rounded-xl bg-[#2e3d1a] shrink-0 overflow-hidden flex items-center justify-center">
                            {run.clubs?.image_url
                              ? <img src={run.clubs.image_url} alt="" className="w-full h-full object-cover" />
                              : <span className="text-xs font-black text-[#c5f135]">{clubAbbr(run.clubs?.name || "")}</span>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-white truncate">{run.title}</p>
                              <span className="shrink-0 text-xs text-white/30">{run.last_message ? formatChatTime(run.last_message.created_at) : ""}</span>
                            </div>
                            <p className="text-xs text-white/30 mt-0.5">{run.clubs?.name} · {formatDay(run.date)} at {formatTime(run.time)}</p>
                            {run.last_message && (
                              <p className="text-xs text-white/40 truncate mt-1">
                                <span className="text-white/55 font-medium">{run.last_message.profiles?.display_name || "Runner"}:</span>{" "}
                                {run.last_message.message}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 w-6 h-6 rounded-full bg-[#c5f135] flex items-center justify-center">
                            <span className="text-[9px] font-black text-[#1a2110]">{run.message_count > 9 ? "9+" : run.message_count}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {runsNoMessages.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest px-1 mb-2">No activity yet</p>
                    <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] overflow-hidden divide-y divide-[#2e3d1a]">
                      {runsNoMessages.map((run) => (
                        <button
                          key={run.id}
                          onClick={() => setSelectedRun(run)}
                          className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-[#2e3d1a]/30 transition text-left"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white/55 truncate">{run.title}</p>
                            <p className="text-xs text-white/30 mt-0.5">{run.clubs?.name} · {formatDay(run.date)} at {formatTime(run.time)}</p>
                          </div>
                          <MessageSquare className="w-4 h-4 text-white/15 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {runsWithMessages.length === 0 && (
                  <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
                    <MessageSquare className="w-8 h-8 text-white/15 mx-auto mb-2" />
                    <p className="text-white/40 text-sm">No messages yet</p>
                    <p className="text-white/25 text-xs mt-1">Messages from your run chats will appear here.</p>
                  </div>
                )}
              </>
            )}

          </div>
        )}

      </div>
    </div>
  )
}

// ── Member View ────────────────────────────────────────────────────────────────

function MemberView({ userId, profile }: { userId: string; profile: Profile }) {
  const [runs, setRuns] = useState<RunChatPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRun, setSelectedRun] = useState<RunWithClub | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: subs } = await supabase.from("subscriptions").select("club_id").eq("user_id", userId)
      const clubIds = (subs || []).map((s: any) => s.club_id)
      if (clubIds.length === 0) { setLoading(false); return }

      const today = localDateStr()
      const { data: runsData } = await supabase
        .from("runs")
        .select("*, clubs(name, image_url)")
        .in("club_id", clubIds)
        .gte("date", today)
        .order("date")
        .order("time")

      if (!runsData || runsData.length === 0) { setLoading(false); return }

      const runIds = runsData.map((r: any) => r.id)
      const { data: chats } = await supabase
        .from("run_chats")
        .select("*, profiles(display_name, avatar_url)")
        .in("run_id", runIds)
        .order("created_at", { ascending: false })

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
    return <ChatPanel run={selectedRun} userId={userId} profile={profile} onClose={() => setSelectedRun(null)} />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110]">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">Messages</h1>
          <p className="text-sm text-white/40 mt-0.5">Chats from your upcoming runs.</p>
        </div>

        {runs.length === 0 ? (
          <div className="bg-[#1e2d12] rounded-2xl p-8 text-center">
            <MessageSquare className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/60 text-sm font-medium">No upcoming runs</p>
            <p className="text-white/30 text-xs mt-1 mb-5">Join a club to see event chats here.</p>
            <Link href="/" className="px-5 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full">
              Discover Clubs
            </Link>
          </div>
        ) : (
          <div className="bg-[#1e2d12] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
            {runs.map((run) => {
              const clubName = run.clubs?.name || "Club"
              const dayLabel = formatDay(run.date)
              const isToday = dayLabel === "Today"
              return (
                <button
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  className="w-full flex items-center gap-3.5 px-4 py-4 hover:bg-[#2e3d1a]/40 transition text-left"
                >
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
                    <p className="text-xs text-white/40 truncate">{clubName} · {isToday ? "Today" : dayLabel} at {formatTime(run.time)}</p>
                    {run.last_message ? (
                      <p className="text-xs text-white/40 truncate mt-1">
                        <span className="text-white/55 font-medium">{run.last_message.profiles?.display_name || "Runner"}:</span>{" "}
                        {run.last_message.message}
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
        )}
        <div className="h-8" />
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DirectorPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }
      setUser(user)
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, role")
        .eq("id", user.id)
        .single()
      setProfile(prof)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  return profile?.role === "manager"
    ? <ManagerView userId={user.id} profile={profile} />
    : <MemberView userId={user.id} profile={profile!} />
}
