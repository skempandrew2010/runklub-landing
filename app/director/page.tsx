"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { localDateStr } from "@/utils/dates"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Send, Plus, Trophy, Users, CalendarPlus,
  MessageSquare, MapPin, Ruler, ExternalLink,
  Zap, ShieldCheck,
  Globe, Lock, Check, X, Link2, Pencil, Trash2,
} from "lucide-react"
import RegionsLocationsTab from "@/app/admin/club-model/manager/RegionsLocationsTab"
import PaceGroupsTab from "@/app/admin/club-model/manager/PaceGroupsTab"
import SchedulesTab from "@/app/admin/club-model/manager/SchedulesTab"
import WorkoutsTab from "@/app/admin/club-model/manager/WorkoutsTab"
import CoachesTab from "@/app/admin/club-model/manager/CoachesTab"
import { Card, SectionTitle, Button, Input } from "@/app/admin/club-model/manager/ui"
import { isNativeApp } from "@/utils/platform"

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
  members_only: boolean
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

type MembershipType = "free" | "optional_paid" | "paid_required"

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
  membership_type: MembershipType
  website: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

const ALL_TABS = [
  { key: "runs",      label: "Runs",                free: true,  starter: true,  growth: true  },
  { key: "members",   label: "Members",             free: false, starter: true,  growth: true  },
  { key: "coaches",   label: "Coaches",             free: false, starter: true,  growth: true  },
  { key: "regions",   label: "Branches & Locations", free: false, starter: false, growth: true  },
  { key: "pace",      label: "Pace Groups",         free: false, starter: false, growth: true  },
  { key: "workouts",  label: "Workout Library",     free: false, starter: false, growth: true  },
  { key: "messages",  label: "Messages",            free: true,  starter: true,  growth: true  },
  { key: "settings",  label: "Settings",            free: true,  starter: true,  growth: true  },
] as const

type TabKey = (typeof ALL_TABS)[number]["key"]

function ManagerView({ userId, profile }: { userId: string; profile: Profile }) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>("runs")
  const [myClubs, setMyClubs] = useState<ClubWithCount[]>([])
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [allRuns, setAllRuns] = useState<RunChatPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRun, setSelectedRun] = useState<RunWithClub | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: "", city: "", location: "", day: "", time: "", instagram: "", website: "", membership: "free" as MembershipType })
  const [savingEdit, setSavingEdit] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [copiedJoinLink, setCopiedJoinLink] = useState(false)
  const [newsletterOpen, setNewsletterOpen] = useState(false)
  const [newsletterSubject, setNewsletterSubject] = useState("")
  const [newsletterBody, setNewsletterBody] = useState("")
  const [newsletterSending, setNewsletterSending] = useState(false)
  const [newsletterResult, setNewsletterResult] = useState<{ sent: number; total: number } | null>(null)
  const [newsletterError, setNewsletterError] = useState("")
  const [upgrading, setUpgrading] = useState(false)
  const [nativeApp, setNativeApp] = useState(false)
  const [tierOverride, setTierOverride] = useState<"free" | "starter" | "growth" | "enterprise" | null>(null)
  const [members, setMembers] = useState<{ id: string; created_at: string; member_type: string; profiles: { display_name: string | null; avatar_url: string | null } | null }[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [pendingRequests, setPendingRequests] = useState<{ id: string; created_at: string; user_id: string; profiles: { display_name: string | null; avatar_url: string | null } | null }[]>([])
  const [pendingInvites, setPendingInvites] = useState<{ id: string; email: string; name: string | null; created_at: string }[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteName, setInviteName] = useState("")
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteError, setInviteError] = useState("")
  const [inviteSuccess, setInviteSuccess] = useState(false)

  useEffect(() => { setNativeApp(isNativeApp()) }, [])

  useEffect(() => {
    if (tab !== "members" || !selectedClubId) return
    setMembersLoading(true)
    Promise.all([
      supabase.from("subscriptions").select("id, created_at, member_type, profiles(display_name, avatar_url)").eq("club_id", selectedClubId).order("created_at", { ascending: false }),
      supabase.from("membership_requests").select("id, created_at, user_id, profiles(display_name, avatar_url)").eq("club_id", selectedClubId).eq("status", "pending").order("created_at", { ascending: true }),
      supabase.from("member_invites").select("id, email, name, created_at").eq("club_id", selectedClubId).eq("status", "pending").order("created_at", { ascending: false }),
    ]).then(([{ data: subs }, { data: reqs }, { data: invites }]) => {
      setMembers((subs as any[]) || [])
      setPendingRequests((reqs as any[]) || [])
      setPendingInvites((invites as any[]) || [])
      setMembersLoading(false)
    })
  }, [tab, selectedClubId])

  useEffect(() => {
    const load = async () => {
      const { data: clubs } = await supabase
        .from("clubs")
        .select("id, name, city, location, meeting_day, meeting_time, image_url, tier, is_public, instagram_handle, membership_type, website")
        .eq("user_id", userId)

      const rawClubs = clubs || []
      const clubIds = rawClubs.map((c: any) => c.id)
      const counts = await Promise.all(clubIds.map((id: string) => supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("club_id", id)))
      const clubsWithCounts: ClubWithCount[] = rawClubs.map((c: any, i: number) => ({ ...c, member_count: counts[i].count ?? 0 }))
      setMyClubs(clubsWithCounts)
      if (clubsWithCounts.length > 0) setSelectedClubId(clubsWithCounts[0].id)
      if (clubIds.length === 0) { setLoading(false); return }

      const today = localDateStr()
      const { data: runs } = await supabase.from("runs").select("*, members_only, clubs(name, image_url)").in("club_id", clubIds).gte("date", today).order("date").order("time")
      if (!runs || runs.length === 0) { setLoading(false); return }

      const runIds = runs.map((r: any) => r.id)
      const { data: chats } = await supabase.from("run_chats").select("*, profiles(display_name, avatar_url)").in("run_id", runIds).order("created_at", { ascending: false })
      const chatsByRun: Record<string, ChatMessage[]> = {}
      for (const msg of (chats || []) as ChatMessage[]) {
        if (!chatsByRun[msg.run_id]) chatsByRun[msg.run_id] = []
        chatsByRun[msg.run_id].push(msg)
      }
      setAllRuns((runs as RunWithClub[]).map((r) => ({ ...r, message_count: chatsByRun[r.id]?.length || 0, last_message: chatsByRun[r.id]?.[0] || null })))
      setLoading(false)
    }
    load()
  }, [userId])

  const deleteRun = async (runId: string) => {
    if (!confirm("Delete this run? This cannot be undone.")) return
    setAllRuns((prev) => prev.filter((r) => r.id !== runId))
    await supabase.from("runs").delete().eq("id", runId)
  }

  const sendNewsletter = async () => {
    if (!newsletterSubject.trim() || !newsletterBody.trim() || !selectedClubId) return
    setNewsletterSending(true)
    setNewsletterError("")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch("/api/director/send-newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ club_id: selectedClubId, subject: newsletterSubject, message: newsletterBody }),
      })
      const json = await res.json()
      if (!res.ok) {
        setNewsletterError(json.error ?? "Something went wrong. Please try again.")
      } else {
        setNewsletterResult({ sent: json.sent, total: json.total })
        setNewsletterSubject("")
        setNewsletterBody("")
        setTimeout(() => { setNewsletterResult(null); setNewsletterOpen(false) }, 5000)
      }
    } catch {
      setNewsletterError("Network error. Please try again.")
    } finally {
      setNewsletterSending(false)
    }
  }

  const startCheckout = async (tier: "starter" | "growth" | "enterprise") => {
    if (!selectedClubId) return
    setUpgrading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ clubId: selectedClubId, tier }),
      })
      const json = await res.json()
      if (json.url) { window.location.href = json.url } else { alert(json.error ?? "Could not start checkout"); setUpgrading(false) }
    } catch {
      alert("Could not start checkout. Try again.")
      setUpgrading(false)
    }
  }

  const sendInvite = async () => {
    if (!inviteEmail.trim() || !selectedClubId) return
    setInviteSending(true)
    setInviteError("")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch("/api/director/invite-member", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ club_id: selectedClubId, email: inviteEmail.trim(), name: inviteName.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setInviteError(json.error ?? "Failed to send invite"); return }
      setInviteSuccess(true)
      setInviteEmail("")
      setInviteName("")
      const { data } = await supabase.from("member_invites").select("id, email, name, created_at").eq("club_id", selectedClubId).eq("status", "pending").order("created_at", { ascending: false })
      setPendingInvites((data as any[]) || [])
      setTimeout(() => setInviteSuccess(false), 3000)
    } finally {
      setInviteSending(false)
    }
  }

  const approveRequest = async (requestId: string, action: "approve" | "reject") => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch("/api/director/approve-member", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ request_id: requestId, action }),
    })
    if (res.ok) {
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId))
      if (action === "approve") {
        const { data } = await supabase.from("subscriptions").select("id, created_at, member_type, profiles(display_name, avatar_url)").eq("club_id", selectedClubId).order("created_at", { ascending: false })
        setMembers((data as any[]) || [])
      }
    }
  }

  const revokeInvite = async (inviteId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch("/api/director/invite-member", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ invite_id: inviteId }),
    })
    setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId))
  }

  useEffect(() => {
    const club = myClubs.find((c) => c.id === selectedClubId)
    if (!club) return
    setEditForm({ name: club.name ?? "", city: club.city ?? "", location: club.location ?? "", day: club.meeting_day ?? "", time: club.meeting_time ?? "", instagram: club.instagram_handle ?? "", website: club.website ?? "", membership: club.membership_type ?? "free" })
    setEditing(false)
  }, [selectedClubId]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveEdit = async () => {
    if (!selectedClubId) return
    setSavingEdit(true)
    const rawHandle = editForm.instagram.trim().replace(/^@/, "")
    let image_url: string | undefined
    if (imageFile) {
      const ext = imageFile.name.split(".").pop()
      const path = `${userId}/clubs/${selectedClubId}.${ext}`
      const { error: uploadError } = await supabase.storage.from("club-images").upload(path, imageFile, { upsert: true })
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from("club-images").getPublicUrl(path)
        image_url = publicUrl
      }
    }
    const updates: Record<string, unknown> = { name: editForm.name, city: editForm.city, location: editForm.location, meeting_day: editForm.day || null, meeting_time: editForm.time || null, instagram_handle: rawHandle || null, website: editForm.website.trim() || null, membership_type: editForm.membership }
    if (image_url) updates.image_url = image_url
    await supabase.from("clubs").update(updates).eq("id", selectedClubId)
    setMyClubs((prev) => prev.map((c) => c.id === selectedClubId ? { ...c, ...(updates as Partial<ClubWithCount>), ...(image_url ? { image_url } : {}) } : c))
    setImageFile(null)
    setImagePreview(null)
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
  const tier = tierOverride ?? selectedClub.tier
  const isFree = !tier || tier === "free"
  const isStarter = tier === "starter"
  const isGrowth = tier === "growth"
  const isEnterprise = tier === "enterprise"
  const isPaid = !isFree

  const UPSELL_INFO: Record<"starter" | "growth" | "enterprise", { name: string; price: string; trial: boolean; headline: string; features: string[] }> = {
    starter:    { name: "Starter",    price: "$24.99/mo", trial: true,  headline: "More tools for your club",  features: ["Private member-only runs", "Weekly email reminders", "Charge members to join", "Verified badge"] },
    growth:     { name: "Growth",     price: "$49.99/mo", trial: false, headline: "Scale up your club",        features: ["Everything in Starter", "One branch + unlimited locations", "Up to 150 members + 10 coaches", "Priority placement"] },
    enterprise: { name: "Enterprise", price: "$99.99/mo", trial: false, headline: "Take your club to the top", features: ["Everything in Growth", "Unlimited branches", "Unlimited members", "First in city search", "Event payments at 1%"] },
  }

  const makeUpgradeCard = (targetTier: "starter" | "growth" | "enterprise", highlighted: boolean) => {
    const info = UPSELL_INFO[targetTier]
    return (
      <div key={targetTier} className={`border rounded-2xl p-5 ${highlighted ? "bg-[#1a2110] border-[#c5f135]/20" : "bg-[#141f0d] border-[#2e3d1a]"}`}>
        <p className="text-[10px] font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">{info.name} — {info.price}</p>
        <p className="text-sm font-black text-white mb-3">{info.headline}</p>
        <ul className="space-y-1.5 mb-4">
          {info.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-white/60">
              <span className="text-[#c5f135] mt-0.5 shrink-0">✓</span>{f}
            </li>
          ))}
        </ul>
        {nativeApp ? (
          <p className="text-xs text-white/40">Upgrade at <span className="text-[#c5f135] font-semibold">runklub.fit</span> on the web.</p>
        ) : (
          <Button onClick={() => startCheckout(targetTier)} disabled={upgrading} className="w-full text-center">
            {upgrading ? "Redirecting…" : info.trial ? "Start 1-month free trial" : `Upgrade to ${info.name}`}
          </Button>
        )}
      </div>
    )
  }

  const tabEnabled = (t: typeof ALL_TABS[number]) => {
    if (isFree) return t.free
    if (isStarter) return t.starter
    return t.growth
  }

  const runsWithMessages = [...allRuns].filter((r) => r.message_count > 0).sort((a, b) => {
    const aT = a.last_message?.created_at ?? a.date
    const bT = b.last_message?.created_at ?? b.date
    return new Date(bT).getTime() - new Date(aT).getTime()
  })
  const runsNoMessages = allRuns.filter((r) => r.message_count === 0)
  const hasUnread = runsWithMessages.length > 0

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">

      {/* Club switcher */}
      {myClubs.length > 1 && (
        <div className="bg-[#111a0a] border-b border-[#2e3d1a] px-4 py-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest shrink-0 mr-1">My Clubs</p>
          {myClubs.map((club) => (
            <button key={club.id} onClick={() => setSelectedClubId(club.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition ${
                selectedClubId === club.id ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] text-white/50 border border-[#2e3d1a] hover:border-[#c5f135]/30 hover:text-white/70"
              }`}>
              <div className="w-4 h-4 rounded-full shrink-0 overflow-hidden flex items-center justify-center bg-[#2e3d1a]">
                {club.image_url ? <img src={club.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-[8px] font-black text-[#c5f135]">{clubAbbr(club.name)}</span>}
              </div>
              {club.name}
            </button>
          ))}
        </div>
      )}

      {/* Header */}
      <header className="bg-[#1e2d12] border-b border-[#2e3d1a]">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest">Club Manager</p>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <h1 className="text-xl font-black text-white">{selectedClub.name}</h1>
              {isStarter && (
                <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30">
                  <Zap className="w-2.5 h-2.5" /> STARTER
                </span>
              )}
              {isGrowth && (
                <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110]">
                  <Zap className="w-2.5 h-2.5" /> GROWTH
                </span>
              )}
              {isEnterprise && (
                <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-400/20 text-purple-300 border border-purple-400/30">
                  <Zap className="w-2.5 h-2.5" /> ENTERPRISE
                </span>
              )}
              {selectedClub.tier === "verified" && (
                <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30">
                  <ShieldCheck className="w-2.5 h-2.5" /> VERIFIED
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {selectedClub.city && <p className="text-xs text-white/40 flex items-center gap-1"><MapPin className="w-3 h-3" />{selectedClub.city}</p>}
              {selectedClub.member_count >= 2 && <p className="text-xs text-white/40 flex items-center gap-1"><Users className="w-3 h-3" />{selectedClub.member_count} members</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { const link = `${window.location.origin}/clubs/${selectedClub.id}?join=1`; navigator.clipboard.writeText(link); setCopiedJoinLink(true); setTimeout(() => setCopiedJoinLink(false), 2500) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-[#2e3d1a] text-white/40 hover:text-[#c5f135] hover:border-[#c5f135]/30 transition"
            >
              {copiedJoinLink ? <><Check className="w-3 h-3 text-[#c5f135]" /><span className="text-[#c5f135]">Copied!</span></> : <><Link2 className="w-3 h-3" />Join link</>}
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar + Content */}
      <div className="max-w-5xl mx-auto px-6 py-8 flex gap-8 items-start">

        {/* Vertical tab sidebar */}
        <aside className="w-52 shrink-0 sticky top-4">
          <nav className="space-y-0.5">
            {ALL_TABS.map((t) => {
              const enabled = tabEnabled(t)
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-bold transition
                    ${active ? "bg-[#c5f135]/10 text-[#c5f135]" : ""}
                    ${enabled && !active ? "text-white/50 hover:text-white/70 hover:bg-[#2e3d1a]/50" : ""}
                    ${!enabled ? "text-white/20" : ""}`}
                >
                  <span className="truncate">{t.label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {t.key === "messages" && hasUnread && !active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#c5f135]" />
                    )}
                    {!enabled && <Lock className="w-2.5 h-2.5 opacity-40" />}
                  </div>
                </button>
              )
            })}
          </nav>


          {/* Tier preview switcher */}
          {(() => {
            const TIER_PLANS: Record<"free" | "starter" | "growth" | "enterprise", { price: string; features: string[] }> = {
              free:       { price: "Free",        features: ["Public club listing", "Unlimited run posts", "Run chat for members", "Basic analytics"] },
              starter:    { price: "$24.99/mo",   features: ["1-month free trial", "Private member-only runs", "Weekly email reminders", "Charge members to join", "Verified badge + invite by email"] },
              growth:     { price: "$49.99/mo",   features: ["Everything in Starter", "One branch + unlimited locations", "Pace groups", "Up to 150 members + 10 coaches", "Priority placement in search"] },
              enterprise: { price: "$99.99/mo",   features: ["Everything in Growth", "Unlimited branches", "Unlimited members", "First in city search", "Training schedules & workout library", "Event payments at 1% fee"] },
            }
            const activeTier = (tier === "starter" || tier === "growth" || tier === "enterprise") ? tier : "free"
            const plan = TIER_PLANS[activeTier]
            return (
              <div className="mt-4 pt-4 border-t border-[#2e3d1a]">
                <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest px-3 mb-2">Preview tier</p>
                <div className="space-y-0.5 mb-3">
                  {(["free", "starter", "growth", "enterprise"] as const).map((t) => {
                    const active = tier === t || (t === "free" && !["starter","growth","enterprise"].includes(tier ?? ""))
                    return (
                      <button
                        key={t}
                        onClick={() => setTierOverride(t === (selectedClub.tier || "free") ? null : t)}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition capitalize
                          ${active ? "bg-[#c5f135]/10 text-[#c5f135]" : "text-white/30 hover:text-white/50 hover:bg-[#2e3d1a]/40"}`}
                      >
                        <span>{t === "free" ? "Free" : t.charAt(0).toUpperCase() + t.slice(1)}</span>
                        {active && <span className="ml-1 font-normal opacity-60">{tierOverride !== null ? "· preview" : "· live"}</span>}
                      </button>
                    )
                  })}
                </div>
                {/* Plan card for active tier */}
                <div className="mx-3 rounded-xl border border-[#2e3d1a] bg-[#141f0d] p-3">
                  <div className="flex items-baseline justify-between gap-1 mb-2">
                    <p className="text-xs font-black text-white capitalize">{activeTier}</p>
                    <p className="text-xs font-bold text-[#c5f135]">{plan.price}</p>
                  </div>
                  <ul className="space-y-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-[11px] text-white/50 leading-snug">
                        <span className="text-[#c5f135] shrink-0 mt-px">✓</span>{f}
                      </li>
                    ))}
                  </ul>
                  {tierOverride !== null && (
                    <button onClick={() => setTierOverride(null)} className="mt-2.5 text-[10px] text-white/25 hover:text-white/40 transition">
                      ↩ back to live tier
                    </button>
                  )}
                </div>
              </div>
            )
          })()}
        </aside>

        {/* Content area */}
        <div className="flex-1 min-w-0">

          {/* ── RUNS ── */}
          {tab === "runs" && (() => {
            const clubRuns = allRuns.filter((r) => r.club_id === selectedClubId)
            const communityRuns = clubRuns.filter((r) => !r.members_only)
            const membersOnlyRuns = clubRuns.filter((r) => r.members_only)

            const RunRow = ({ run }: { run: RunChatPreview }) => (
              <div className="flex items-center justify-between gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{run.title}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {formatDay(run.date)} · {formatTime(run.time)}{run.distance ? ` · ${run.distance}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => router.push(`/dashboard/${selectedClubId}/edit-run/${run.id}`)}
                    className="p-1.5 rounded-lg text-white/25 hover:text-white/70 hover:bg-[#2e3d1a] transition"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteRun(run.id)}
                    className="p-1.5 rounded-lg text-white/25 hover:text-red-400 hover:bg-[#2e3d1a] transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )

            return (
              <div className="space-y-4">
                {/* Schedule a Run — primary action */}
                <button
                  onClick={() => router.push(`/dashboard/${selectedClub.id}/create-run`)}
                  className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition"
                >
                  <span className="text-sm font-black">Schedule a Run</span>
                  <CalendarPlus className="w-5 h-5" />
                </button>

                <Card>
                  <SectionTitle>Community Runs</SectionTitle>
                  <p className="text-xs text-white/30 mb-3">Open to everyone — visible on the discover map</p>
                  {communityRuns.length === 0 ? (
                    <p className="text-sm text-white/50">No upcoming community runs.</p>
                  ) : (
                    <div className="space-y-2">
                      {communityRuns.map((run) => <RunRow key={run.id} run={run} />)}
                    </div>
                  )}
                </Card>

                <Card>
                  <div className="flex items-center justify-between mb-1">
                    <SectionTitle>Members Only Runs</SectionTitle>
                    {!isPaid && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110]">STARTER+</span>}
                  </div>
                  <p className="text-xs text-white/30 mb-3">Only visible to paying members</p>
                  {!isPaid ? (
                    <p className="text-sm text-white/50">Upgrade to Starter to create members-only runs.</p>
                  ) : (
                    <>
                      {membersOnlyRuns.length === 0 ? (
                        <p className="text-sm text-white/50">No members-only runs yet. Toggle a run to "Members Only" when scheduling.</p>
                      ) : (
                        <div className="space-y-2">
                          {membersOnlyRuns.map((run) => <RunRow key={run.id} run={run} />)}
                        </div>
                      )}
                      <div className="border-t border-[#2e3d1a] mt-5 pt-5">
                        <SchedulesTab />
                      </div>
                    </>
                  )}
                </Card>
              </div>
            )
          })()}

          {/* ── MEMBERS ── */}
          {tab === "members" && (() => {
            if (isFree) return (
              <div className="space-y-4">
                <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Members</p>
                <p className="text-sm text-white/50">Unlock member management with Starter or above.</p>
                {makeUpgradeCard("starter", true)}
                {makeUpgradeCard("growth", false)}
                {makeUpgradeCard("enterprise", false)}
              </div>
            )
            const memberLimit = isStarter ? 100 : isGrowth ? 150 : null
            const nearLimit = memberLimit !== null && members.length >= memberLimit * 0.85
            const atLimit = memberLimit !== null && members.length >= memberLimit
            return (
              <div className="space-y-6">
                {pendingRequests.length > 0 && (
                  <Card>
                    <SectionTitle>Pending approval ({pendingRequests.length})</SectionTitle>
                    <div className="space-y-2">
                      {pendingRequests.map((req) => (
                        <div key={req.id} className="flex items-center justify-between gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
                          <div>
                            <p className="text-sm font-bold text-white">{req.profiles?.display_name || "Runner"}</p>
                            <p className="text-xs text-white/50">Requested {new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button onClick={() => approveRequest(req.id, "approve")}>Approve</Button>
                            <Button variant="danger" onClick={() => approveRequest(req.id, "reject")}>Reject</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <Card>
                  <SectionTitle>Invite a member</SectionTitle>
                  <div className="flex gap-2 flex-wrap">
                    <div className="flex-1 min-w-[120px]">
                      <Input placeholder="Name (optional)" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <Input type="email" placeholder="Email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendInvite()} />
                    </div>
                    <Button disabled={inviteSending || !inviteEmail.trim()} onClick={sendInvite}>
                      {inviteSending ? "Sending…" : "Send invite"}
                    </Button>
                  </div>
                  {inviteError && <p className="text-red-400 text-xs mt-2">{inviteError}</p>}
                  {inviteSuccess && <p className="text-[#c5f135] text-xs mt-2">Invite sent!</p>}
                </Card>

                {pendingInvites.length > 0 && (
                  <Card>
                    <SectionTitle>Sent invites</SectionTitle>
                    <div className="space-y-2">
                      {pendingInvites.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
                          <div>
                            <p className="text-sm font-bold text-white">{inv.name || inv.email}</p>
                            {inv.name && <p className="text-xs text-white/60">{inv.email}</p>}
                            <p className="text-xs text-white/40">Sent {new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                          </div>
                          <Button variant="danger" onClick={() => revokeInvite(inv.id)}>Revoke</Button>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {atLimit && (
                  <div className="bg-red-400/10 border border-red-400/25 rounded-2xl px-4 py-3 flex items-center gap-3">
                    <Lock className="w-4 h-4 text-red-400 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-red-400">Member limit reached</p>
                      <p className="text-xs text-red-400/70 mt-0.5">Upgrade to add more members.</p>
                    </div>
                  </div>
                )}
                {!atLimit && nearLimit && (
                  <div className="bg-amber-400/10 border border-amber-400/25 rounded-2xl px-4 py-3">
                    <p className="text-sm font-bold text-amber-400">Approaching your member limit</p>
                    <p className="text-xs text-amber-400/70 mt-0.5">{members.length} of {memberLimit} spots filled. Upgrade soon.</p>
                  </div>
                )}

                {(() => {
                  const paidMembers = members.filter((m) => m.member_type === "paid")
                  const communityMembers = members.filter((m) => m.member_type !== "paid")
                  const showSplit = selectedClub.membership_type !== "free" && selectedClub.is_public

                  const MemberRow = ({ m }: { m: typeof members[number] }) => (
                    <div className="flex items-center gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
                      <div className="w-8 h-8 rounded-full shrink-0 bg-[#2e3d1a] overflow-hidden flex items-center justify-center">
                        {m.profiles?.avatar_url
                          ? <img src={m.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                          : <span className="text-sm font-black text-[#c5f135]">{(m.profiles?.display_name || "?")[0].toUpperCase()}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{m.profiles?.display_name || "Runner"}</p>
                        <p className="text-xs text-white/40">Joined {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                      </div>
                      {showSplit && (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${m.member_type === "paid" ? "bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30" : "bg-white/5 text-white/30 border border-white/10"}`}>
                          {m.member_type === "paid" ? "Paid" : "Free"}
                        </span>
                      )}
                    </div>
                  )

                  if (membersLoading) return (
                    <Card>
                      <div className="flex justify-center py-6">
                        <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
                      </div>
                    </Card>
                  )

                  if (members.length === 0) return (
                    <Card>
                      <SectionTitle>Members</SectionTitle>
                      <p className="text-sm text-white/50">No members yet. Invite someone above or share your join link.</p>
                    </Card>
                  )

                  if (!showSplit) return (
                    <Card>
                      <div className="flex items-center justify-between mb-3">
                        <SectionTitle>Members</SectionTitle>
                        <span className={`text-xs font-semibold ${atLimit ? "text-red-400" : nearLimit ? "text-amber-400" : "text-white/30"}`}>
                          {`${members.length}${memberLimit ? ` / ${memberLimit}` : ""}`}
                        </span>
                      </div>
                      <div className="space-y-2">{members.map((m) => <MemberRow key={m.id} m={m} />)}</div>
                    </Card>
                  )

                  return (
                    <div className="space-y-4">
                      <Card>
                        <div className="flex items-center justify-between mb-3">
                          <SectionTitle>Paying Members</SectionTitle>
                          <span className={`text-xs font-semibold ${atLimit ? "text-red-400" : nearLimit ? "text-amber-400" : "text-white/30"}`}>
                            {`${paidMembers.length}${memberLimit ? ` / ${memberLimit}` : ""}`}
                          </span>
                        </div>
                        {paidMembers.length === 0 ? (
                          <p className="text-sm text-white/50">No paying members yet. Approve a request or send an invite.</p>
                        ) : (
                          <div className="space-y-2">{paidMembers.map((m) => <MemberRow key={m.id} m={m} />)}</div>
                        )}
                      </Card>

                      <Card>
                        <div className="flex items-center justify-between mb-3">
                          <SectionTitle>Community Members</SectionTitle>
                          <span className="text-xs font-semibold text-white/30">{communityMembers.length}</span>
                        </div>
                        {communityMembers.length === 0 ? (
                          <p className="text-sm text-white/50">No free followers yet.</p>
                        ) : (
                          <div className="space-y-2">{communityMembers.map((m) => <MemberRow key={m.id} m={m} />)}</div>
                        )}
                      </Card>
                    </div>
                  )
                })()}

                {!isEnterprise && (
                  <div className="space-y-3">
                    {isStarter && makeUpgradeCard("growth", true)}
                    {isStarter && makeUpgradeCard("enterprise", false)}
                    {isGrowth && makeUpgradeCard("enterprise", true)}
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── COACHES ── */}
          {tab === "coaches" && (isPaid
            ? <CoachesTab />
            : <div className="space-y-4">
                <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Coaches</p>
                <p className="text-sm text-white/50">Unlock coach management with Starter or above.</p>
                {makeUpgradeCard("starter", true)}
                {makeUpgradeCard("growth", false)}
                {makeUpgradeCard("enterprise", false)}
              </div>
          )}

          {/* ── REGIONS & LOCATIONS ── */}
          {tab === "regions" && (isGrowth || isEnterprise
            ? <RegionsLocationsTab />
            : <div className="space-y-4">
                <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Branches & Locations</p>
                <p className="text-sm text-white/50">Unlock branches and locations with Growth or above.</p>
                {makeUpgradeCard("growth", true)}
                {makeUpgradeCard("enterprise", false)}
              </div>
          )}

          {/* ── PACE GROUPS ── */}
          {tab === "pace" && (isGrowth || isEnterprise
            ? <PaceGroupsTab />
            : <div className="space-y-4">
                <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Pace Groups</p>
                <p className="text-sm text-white/50">Unlock pace group management with Growth or above.</p>
                {makeUpgradeCard("growth", true)}
                {makeUpgradeCard("enterprise", false)}
              </div>
          )}

          {/* ── WORKOUT LIBRARY ── */}
          {tab === "workouts" && (isGrowth || isEnterprise
            ? <WorkoutsTab />
            : <div className="space-y-4">
                <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Workout Library</p>
                <p className="text-sm text-white/50">Unlock the workout library with Growth or above.</p>
                {makeUpgradeCard("growth", true)}
                {makeUpgradeCard("enterprise", false)}
              </div>
          )}

          {/* ── MESSAGES ── */}
          {tab === "messages" && (
            <div className="space-y-6">
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <SectionTitle>
                    Send Newsletter
                    {isFree && <span className="ml-2 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110] align-middle">STARTER+</span>}
                  </SectionTitle>
                  {!newsletterOpen && (
                    <Button onClick={() => { setNewsletterOpen(true); setNewsletterError(""); setNewsletterResult(null) }}>Compose</Button>
                  )}
                </div>
                {!newsletterOpen && (
                  <p className="text-sm text-white/50">Email all {selectedClub?.member_count ?? 0} follower{selectedClub?.member_count === 1 ? "" : "s"}</p>
                )}
                {newsletterOpen && isFree && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                        <Lock className="w-4 h-4 text-white/40" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">Newsletters require Starter or above</p>
                        <p className="text-xs text-white/40 mt-0.5">Start a free trial to email your followers directly.</p>
                      </div>
                    </div>
                    {!nativeApp && <Button onClick={() => startCheckout("starter")} disabled={upgrading}>{upgrading ? "Redirecting…" : "Start free trial"}</Button>}
                  </div>
                )}
                {newsletterOpen && !isFree && (
                  <div className="space-y-3">
                    {newsletterResult ? (
                      <div className="flex items-center gap-3 py-2">
                        <div className="w-8 h-8 rounded-full bg-[#c5f135]/15 flex items-center justify-center shrink-0">
                          <Check className="w-4 h-4 text-[#c5f135]" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">Newsletter sent!</p>
                          <p className="text-xs text-white/40 mt-0.5">Delivered to {newsletterResult.sent} of {newsletterResult.total} subscribers</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Subject</label>
                          <Input type="text" value={newsletterSubject} onChange={(e) => setNewsletterSubject(e.target.value)} placeholder="e.g. This weekend's run details" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Message</label>
                          <textarea value={newsletterBody} onChange={(e) => setNewsletterBody(e.target.value)} placeholder="Write your message to club followers…" rows={5}
                            className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition resize-none" />
                        </div>
                        {newsletterError && <p className="text-red-400/80 text-xs">{newsletterError}</p>}
                        <div className="flex items-center gap-2">
                          <Button onClick={sendNewsletter} disabled={newsletterSending || !newsletterSubject.trim() || !newsletterBody.trim()}>
                            {newsletterSending ? "Sending…" : "Send to all followers"}
                          </Button>
                          <Button variant="ghost" onClick={() => { setNewsletterOpen(false); setNewsletterSubject(""); setNewsletterBody(""); setNewsletterError("") }}>Cancel</Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>

              <Card>
                <SectionTitle>Run Chats</SectionTitle>
                {allRuns.length === 0 ? (
                  <p className="text-sm text-white/50">No upcoming runs. Schedule a run to see chats here.</p>
                ) : (
                  <div className="space-y-2">
                    {runsWithMessages.length > 0 && (
                      <>
                        <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-2">Active Chats</p>
                        {runsWithMessages.map((run) => (
                          <button key={run.id} onClick={() => setSelectedRun(run)}
                            className="w-full flex items-center gap-4 px-3 py-3 rounded-xl bg-[#1a2110] border border-[#2e3d1a] hover:border-[#c5f135]/20 transition text-left">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm font-semibold text-white truncate">{run.title}</p>
                                <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full ${run.members_only ? "bg-white/10 text-white/40" : "bg-[#c5f135]/10 text-[#c5f135]/70"}`}>
                                  {run.members_only ? "MEMBERS" : "OPEN"}
                                </span>
                              </div>
                              <p className="text-xs text-white/30">{formatDay(run.date)} at {formatTime(run.time)}</p>
                              {run.last_message && (
                                <p className="text-xs text-white/40 truncate mt-1">
                                  <span className="text-white/55 font-medium">{run.last_message.profiles?.display_name || "Runner"}:</span>{" "}{run.last_message.message}
                                </p>
                              )}
                            </div>
                            <div className="shrink-0 w-6 h-6 rounded-full bg-[#c5f135] flex items-center justify-center">
                              <span className="text-[9px] font-black text-[#1a2110]">{run.message_count > 9 ? "9+" : run.message_count}</span>
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                    {runsNoMessages.length > 0 && (
                      <>
                        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mt-3 mb-2">No activity yet</p>
                        {runsNoMessages.map((run) => (
                          <button key={run.id} onClick={() => setSelectedRun(run)}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-[#1a2110] border border-[#2e3d1a] hover:border-[#c5f135]/20 transition text-left">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-white/55 truncate">{run.title}</p>
                                <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full ${run.members_only ? "bg-white/5 text-white/25" : "bg-[#c5f135]/5 text-[#c5f135]/40"}`}>
                                  {run.members_only ? "MEMBERS" : "OPEN"}
                                </span>
                              </div>
                              <p className="text-xs text-white/30">{formatDay(run.date)} at {formatTime(run.time)}</p>
                            </div>
                            <MessageSquare className="w-4 h-4 text-white/15 shrink-0" />
                          </button>
                        ))}
                      </>
                    )}
                    {runsWithMessages.length === 0 && (
                      <p className="text-sm text-white/50">No messages yet. Messages from your run chats will appear here.</p>
                    )}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ── SETTINGS ── */}
          {tab === "settings" && (
            <div className="space-y-6">
              <Card>
                <SectionTitle>Club Visibility</SectionTitle>
                <button onClick={toggleClubVisibility}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#1a2110] border border-[#2e3d1a] hover:border-[#c5f135]/20 transition text-left">
                  {selectedClub.is_public ? <Globe className="w-4 h-4 text-[#c5f135] shrink-0" /> : <Lock className="w-4 h-4 text-white/50 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">Club Visibility</p>
                    <p className="text-xs text-white/40 mt-0.5">{selectedClub.is_public ? "Visible on the discover map" : "Hidden — only members can find you"}</p>
                  </div>
                  <span className={`text-xs font-black px-2.5 py-1 rounded-full shrink-0 ${selectedClub.is_public ? "bg-[#c5f135]/10 text-[#c5f135] border border-[#c5f135]/30" : "bg-white/5 text-white/40 border border-white/15"}`}>
                    {selectedClub.is_public ? "Public" : "Private"}
                  </span>
                </button>
              </Card>

              <Card>
                <div className="flex items-center justify-between mb-3">
                  <SectionTitle>Club Details</SectionTitle>
                  <button onClick={() => setEditing(!editing)} className="text-xs font-bold text-white/40 hover:text-white/70 transition">{editing ? "Cancel" : "Edit"}</button>
                </div>
                {editing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-white/50 mb-1.5">Club Photo</label>
                      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5MB"); return }
                        setImageFile(file)
                        setImagePreview(URL.createObjectURL(file))
                      }} />
                      {imagePreview ? (
                        <div className="relative w-full h-36 rounded-xl overflow-hidden">
                          <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); if (imageInputRef.current) imageInputRef.current.value = "" }}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-red-500/80 transition">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => imageInputRef.current?.click()}
                          className="w-full h-20 rounded-xl border-2 border-dashed border-[#2e3d1a] hover:border-[#c5f135]/40 flex items-center justify-center text-white/30 hover:text-white/60 transition text-xs font-medium">
                          Upload new photo
                        </button>
                      )}
                    </div>
                    {([
                      { label: "Club Name", field: "name" as const, placeholder: "e.g. Boulder Trail Runners" },
                      { label: "City", field: "city" as const, placeholder: "e.g. Boulder, CO" },
                      { label: "Location", field: "location" as const, placeholder: "Meeting address or landmark" },
                      { label: "Meeting Day", field: "day" as const, placeholder: "e.g. Saturday" },
                    ]).map(({ label, field, placeholder }) => (
                      <div key={field}>
                        <label className="block text-xs font-semibold text-white/50 mb-1">{label}</label>
                        <Input value={editForm[field]} onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })} placeholder={placeholder} />
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs font-semibold text-white/50 mb-1">Meeting Time</label>
                      <input type="time" value={editForm.time} onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                        className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c5f135]/50 transition" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/50 mb-1">Instagram <span className="font-normal text-white/25">(optional)</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm pointer-events-none">@</span>
                        <input value={editForm.instagram} onChange={(e) => setEditForm({ ...editForm, instagram: e.target.value.replace(/^@/, "") })} placeholder="yourclubhandle"
                          className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl pl-7 pr-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/50 mb-1">Website <span className="font-normal text-white/25">(optional)</span></label>
                      <Input value={editForm.website} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} placeholder="https://yourclub.com" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/50 mb-1.5">Membership</label>
                      <div className="space-y-1.5">
                        {([
                          { value: "free", label: "Free to Join" },
                          { value: "optional_paid", label: "Free + Paid Options" },
                          { value: "paid_required", label: "Membership Required" },
                        ] as { value: MembershipType; label: string }[]).map(({ value, label }) => (
                          <button key={value} type="button" onClick={() => setEditForm({ ...editForm, membership: value })}
                            className={`w-full text-left px-3 py-2 rounded-xl border text-sm transition ${editForm.membership === value ? "bg-[#c5f135]/10 border-[#c5f135]/40 text-[#c5f135] font-semibold" : "bg-[#1a2110] border-[#2e3d1a] text-white/50 hover:border-[#c5f135]/20"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Saving…" : "Save"}</Button>
                      <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm text-white/60">
                    {selectedClub.city && <p><span className="text-white/30 text-xs uppercase tracking-widest font-bold">City</span><br />{selectedClub.city}</p>}
                    {selectedClub.location && <p><span className="text-white/30 text-xs uppercase tracking-widest font-bold">Location</span><br />{selectedClub.location}</p>}
                    {selectedClub.meeting_day && <p><span className="text-white/30 text-xs uppercase tracking-widest font-bold">Meets</span><br />{[selectedClub.meeting_day, selectedClub.meeting_time ? formatTime(selectedClub.meeting_time) : null].filter(Boolean).join(" · ")}</p>}
                  </div>
                )}
              </Card>

              <Card>
                <SectionTitle>Danger Zone</SectionTitle>
                <Button variant="danger" onClick={handleDelete}>Delete this club</Button>
              </Card>
            </div>
          )}

        </div>{/* end content */}
      </div>{/* end sidebar+content */}
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
      const { data: runsData } = await supabase.from("runs").select("*, clubs(name, image_url)").in("club_id", clubIds).gte("date", today).order("date").order("time")
      if (!runsData || runsData.length === 0) { setLoading(false); return }

      const runIds = runsData.map((r: any) => r.id)
      const { data: chats } = await supabase.from("run_chats").select("*, profiles(display_name, avatar_url)").in("run_id", runIds).order("created_at", { ascending: false })
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
                    <p className="text-xs text-white/40 truncate">{clubName} · {isToday ? "Today" : dayLabel} at {formatTime(run.time)}</p>
                    {run.last_message ? (
                      <p className="text-xs text-white/40 truncate mt-1">
                        <span className="text-white/55 font-medium">{run.last_message.profiles?.display_name || "Runner"}:</span>{" "}{run.last_message.message}
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
      const { data: prof } = await supabase.from("profiles").select("id, display_name, avatar_url, role").eq("id", user.id).single()
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
