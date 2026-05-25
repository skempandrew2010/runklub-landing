"use client"

import { useParams, useRouter } from "next/navigation"
import { localDateStr } from "@/utils/dates"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { Run } from "@/types/run"
import {
  ArrowLeft, Users, CalendarPlus, Trash2, Pencil, Check, X,
  ShieldCheck, Zap, MapPin, Clock, Ruler,
  ChevronLeft, ChevronRight, CalendarDays, LayoutList,
  Globe, Lock, Mail, Send,
} from "lucide-react"

type Club = {
  id: string
  name: string
  city: string
  location: string
  instagram_handle: string | null
  tier: "free" | "verified" | "pro"
  stripe_subscription_id: string | null
  stripe_subscription_status: string | null
  tier_expires_at: string | null
  is_public: boolean
}

function TierBadge({ tier }: { tier: string }) {
  if (tier === "pro") {
    return (
      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-[#c5f135] text-[#1a2110]">
        <Zap className="w-3 h-3" /> PRO
      </span>
    )
  }
  if (tier === "verified") {
    return (
      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30">
        <ShieldCheck className="w-3 h-3" /> VERIFIED
      </span>
    )
  }
  return null
}

function CalendarView({ runs, onDayClick }: { runs: Run[]; onDayClick: (date: string) => void }) {
  const today = new Date()
  const [monthDate, setMonthDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const runDates = useMemo(() => {
    const map = new Map<string, number>()
    runs.forEach((r) => map.set(r.date, (map.get(r.date) ?? 0) + 1))
    return map
  }, [runs])

  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setMonthDate(new Date(year, month - 1, 1))}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-[#2e3d1a] hover:text-white transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-bold text-white">
          {monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </p>
        <button
          onClick={() => setMonthDate(new Date(year, month + 1, 1))}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-[#2e3d1a] hover:text-white transition"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <p key={d} className="text-center text-[10px] font-bold text-white/25 uppercase tracking-wider py-1">{d}</p>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          const count = runDates.get(dateStr) ?? 0
          const isToday = dateStr === todayStr
          return (
            <button
              key={i}
              onClick={() => onDayClick(dateStr)}
              className={`flex flex-col items-center justify-center rounded-xl py-2.5 transition
                ${isToday
                  ? "bg-[#c5f135]/15 border border-[#c5f135]/40 text-[#c5f135] font-black"
                  : count > 0
                    ? "bg-[#2e3d1a] text-white font-semibold hover:bg-[#3d5220]"
                    : "text-white/50 font-medium hover:bg-[#2e3d1a] hover:text-white"
                }`}
            >
              <span className="text-sm leading-none">{day}</span>
              {count > 0 && (
                <div className="flex gap-0.5 mt-1.5">
                  {Array.from({ length: Math.min(count, 3) }).map((_, j) => (
                    <div key={j} className="w-1 h-1 rounded-full bg-[#c5f135]" />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-center text-[10px] text-white/25 mt-4 tracking-wide">
        Tap any day to schedule a run
      </p>
    </div>
  )
}

export default function ClubManagerPage() {
  const { clubId } = useParams<{ clubId: string }>()
  const router = useRouter()

  const [club, setClub] = useState<Club | null>(null)
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [weeklyGrowth, setWeeklyGrowth] = useState<number | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list")
  const [showPast, setShowPast] = useState(false)

  const [editForm, setEditForm] = useState({ name: "", city: "", location: "", instagram: "" })
  const [showNewsletter, setShowNewsletter] = useState(false)
  const [newsletterSubject, setNewsletterSubject] = useState("")
  const [newsletterMessage, setNewsletterMessage] = useState("")
  const [newsletterSending, setNewsletterSending] = useState(false)
  const [newsletterResult, setNewsletterResult] = useState<{ sent?: number; error?: string } | null>(null)

  useEffect(() => {
    if (!clubId) { setLoading(false); return }

    const load = async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [{ data: clubData }, { data: subData }, { data: runsData }, { data: recentSubData }] = await Promise.all([
        supabase.from("clubs").select("*").eq("id", clubId).maybeSingle(),
        supabase.from("subscriptions").select("id").eq("club_id", clubId),
        supabase.from("runs").select("*").eq("club_id", clubId).order("date", { ascending: true }),
        supabase.from("subscriptions").select("id").eq("club_id", clubId).gte("created_at", weekAgo),
      ])

      if (clubData) {
        setClub(clubData)
        setEditForm({
          name: clubData.name ?? "",
          city: clubData.city ?? "",
          location: clubData.location ?? "",
          instagram: clubData.instagram_handle ?? "",
        })
      }
      setSubscriberCount(subData?.length ?? 0)
      setWeeklyGrowth(recentSubData?.length ?? 0)
      setRuns(runsData ?? [])
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`club-subs-${clubId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `club_id=eq.${clubId}` },
        () => supabase.from("subscriptions").select("id").eq("club_id", clubId).then(({ data }) => setSubscriberCount(data?.length ?? 0))
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [clubId])

  const saveEdit = async () => {
    const rawHandle = editForm.instagram.trim().replace(/^@/, "")
    await supabase.from("clubs").update({
      name: editForm.name,
      city: editForm.city,
      location: editForm.location,
      instagram_handle: rawHandle || null,
    }).eq("id", clubId)
    setClub((c) => c ? { ...c, name: editForm.name, city: editForm.city, location: editForm.location, instagram_handle: rawHandle || null } : c)
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!confirm("Delete this club? This cannot be undone.")) return
    await supabase.from("clubs").delete().eq("id", clubId)
    router.push("/director")
  }

  const toggleClubVisibility = async () => {
    if (!club) return
    const next = !club.is_public
    setClub((c) => c ? { ...c, is_public: next } : c)
    await supabase.from("clubs").update({ is_public: next }).eq("id", clubId)
  }

  const sendNewsletter = async () => {
    if (!newsletterSubject.trim() || !newsletterMessage.trim()) return
    setNewsletterSending(true)
    setNewsletterResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }
      const res = await fetch(`/api/clubs/${clubId}/email-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ subject: newsletterSubject, message: newsletterMessage }),
      })
      const data = await res.json()
      if (!res.ok) setNewsletterResult({ error: data.error ?? "Failed to send" })
      else {
        setNewsletterResult({ sent: data.sent })
        setNewsletterSubject("")
        setNewsletterMessage("")
      }
    } catch {
      setNewsletterResult({ error: "Something went wrong. Try again." })
    } finally {
      setNewsletterSending(false)
    }
  }

  const toggleRunVisibility = async (runId: string, current: boolean) => {
    const next = !current
    setRuns((prev) => prev.map((r) => r.id === runId ? { ...r, is_public: next } : r))
    await supabase.from("runs").update({ is_public: next }).eq("id", runId)
  }

  const deleteRun = async (runId: string) => {
    if (!confirm("Delete this run? This cannot be undone.")) return
    setRuns((prev) => prev.filter((r) => r.id !== runId))
    await supabase.from("runs").delete().eq("id", runId)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (!club) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex flex-col items-center justify-center gap-3">
        <p className="text-white/40 text-sm">Club not found.</p>
        <button onClick={() => router.push("/director")} className="text-[#c5f135] text-sm font-semibold hover:underline">
          ← Back to Director
        </button>
      </div>
    )
  }

  const tier = club.tier ?? "free"
  const todayStr = localDateStr()
  const upcomingRuns = runs.filter((r) => r.date >= todayStr)
  const pastRuns = runs.filter((r) => r.date < todayStr).reverse()

  function formatTime(t: string) {
    const [h, m] = t.split(":").map(Number)
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
  }

  function RunCard({ run }: { run: Run }) {
    const d = new Date(run.date + "T00:00:00")
    const isToday = run.date === todayStr
    const isPast = run.date < todayStr
    return (
      <div className={`rounded-2xl border overflow-hidden ${
        isToday ? "bg-[#c5f135]/5 border-[#c5f135]/25" :
        isPast  ? "bg-[#1a1f12] border-[#242e16] opacity-60" :
                  "bg-[#1e2d12] border-[#2e3d1a]"
      }`}>
        {/* Run info */}
        <div className="flex items-start gap-3 px-4 pt-4 pb-3">
          <div className={`shrink-0 rounded-xl px-2.5 py-1.5 text-center min-w-[50px] ${isToday ? "bg-[#c5f135]/20" : "bg-[#2e3d1a]"}`}>
            <p className={`text-[9px] font-bold uppercase tracking-wider ${isToday ? "text-[#c5f135]" : "text-white/40"}`}>
              {isToday ? "TODAY" : d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
            </p>
            <p className={`text-lg font-black leading-tight ${isToday ? "text-[#c5f135]" : "text-white"}`}>
              {d.getDate()}
            </p>
            <p className={`text-[9px] font-semibold ${isToday ? "text-[#c5f135]/70" : "text-white/30"}`}>
              {d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
            </p>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-white leading-tight">{run.title}</p>
              {!club?.is_public && (
                <button
                  onClick={() => toggleRunVisibility(run.id, run.is_public)}
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full border transition shrink-0
                    ${run.is_public
                      ? "bg-[#c5f135]/10 text-[#c5f135] border-[#c5f135]/30 hover:bg-[#c5f135]/20"
                      : "bg-white/5 text-white/35 border-white/10 hover:bg-white/10"
                    }`}
                >
                  {run.is_public ? "Public" : "Private"}
                </button>
              )}
            </div>
            <p className="text-xs text-white/50 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0" />
              {run.time ? formatTime(run.time) : ""}
              {run.distance && <><span className="text-white/20">·</span><Ruler className="w-3 h-3 shrink-0" />{run.distance}</>}
            </p>
            {run.meeting_point && (
              <p className="text-xs text-white/35 mt-0.5 flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{run.meeting_point}</span>
              </p>
            )}
            {run.tags && run.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {run.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-[#2e3d1a] text-white/40 font-medium">{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action bar */}
        {!isPast && (
          <div className="flex border-t border-[#2e3d1a] divide-x divide-[#2e3d1a]">
            <button
              onClick={() => router.push(`/dashboard/${clubId}/edit-run/${run.id}`)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-white/50 hover:text-[#c5f135] hover:bg-[#c5f135]/5 transition"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit Run
            </button>
            <button
              onClick={() => deleteRun(run.id)}
              className="px-5 flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-400/5 transition"
              title="Delete run"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* ── HEADER ── */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/director")}
            className="w-9 h-9 rounded-full bg-[#1e2d12] border border-[#2e3d1a] flex items-center justify-center text-white/60 hover:text-white transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-white leading-tight">{club.name}</h1>
              <TierBadge tier={tier} />
            </div>
            <p className="text-xs text-white/40 mt-0.5">{club.city}</p>
          </div>
        </div>

        {/* ── STATS ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 text-center">
            <Users className="w-4 h-4 text-[#c5f135] mx-auto mb-1" />
            <p className="text-2xl font-black text-white leading-tight">{subscriberCount}</p>
            <p className="text-[10px] font-bold text-white/30 tracking-widest uppercase mt-0.5">Members</p>
            {weeklyGrowth !== null && weeklyGrowth > 0 && (
              <p className="text-[10px] font-black mt-1.5 text-[#c5f135]">+{weeklyGrowth} this week</p>
            )}
          </div>
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 text-center">
            <CalendarPlus className="w-4 h-4 text-[#c5f135] mx-auto mb-1" />
            <p className="text-2xl font-black text-white leading-tight">{upcomingRuns.length}</p>
            <p className="text-[10px] font-bold text-white/30 tracking-widest uppercase mt-0.5">Upcoming</p>
            {runs.length > upcomingRuns.length && (
              <p className="text-[10px] font-semibold text-white/20 mt-1.5">{runs.length} total</p>
            )}
          </div>
        </div>

        {/* ── SCHEDULE / RUNS ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase">Upcoming Runs</h2>
            <div className="flex items-center gap-2">
              <div className="flex rounded-full bg-[#1e2d12] border border-[#2e3d1a] p-0.5">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-full transition ${viewMode === "list" ? "bg-[#2e3d1a] text-[#c5f135]" : "text-white/30 hover:text-white/60"}`}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("calendar")}
                  className={`p-1.5 rounded-full transition ${viewMode === "calendar" ? "bg-[#2e3d1a] text-[#c5f135]" : "text-white/30 hover:text-white/60"}`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                onClick={() => router.push(`/dashboard/${clubId}/create-run`)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#c5f135] text-[#1a2110] text-xs font-black rounded-full hover:bg-[#d4ff45] transition"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                Schedule Run
              </button>
            </div>
          </div>

          {viewMode === "calendar" ? (
            <CalendarView
              runs={runs}
              onDayClick={(date) => router.push(`/dashboard/${clubId}/create-run?date=${date}`)}
            />
          ) : upcomingRuns.length === 0 ? (
            <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
              <CalendarPlus className="w-9 h-9 text-white/15 mx-auto mb-3" />
              <p className="text-white/50 text-sm font-medium">No upcoming runs scheduled</p>
              <p className="text-white/25 text-xs mt-1 mb-4">Schedule your next run to get members together.</p>
              <button
                onClick={() => router.push(`/dashboard/${clubId}/create-run`)}
                className="px-5 py-2.5 bg-[#c5f135] text-[#1a2110] text-xs font-black rounded-full hover:bg-[#d4ff45] transition"
              >
                + Schedule a Run
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingRuns.map((run) => <RunCard key={run.id} run={run} />)}
            </div>
          )}

          {/* Past runs — collapsed by default */}
          {pastRuns.length > 0 && viewMode === "list" && (
            <div className="mt-4">
              <button
                onClick={() => setShowPast((v) => !v)}
                className="w-full flex items-center justify-between px-1 py-2 text-xs font-bold text-white/25 hover:text-white/40 transition"
              >
                <span className="uppercase tracking-widest">Past Runs ({pastRuns.length})</span>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showPast ? "rotate-90" : ""}`} />
              </button>
              {showPast && (
                <div className="space-y-3 mt-2">
                  {pastRuns.map((run) => <RunCard key={run.id} run={run} />)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── EMAIL MEMBERS ── */}
        <div>
          <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-3">Email Members</h2>
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-4 opacity-50 cursor-not-allowed">
              <div className="w-9 h-9 rounded-xl bg-[#c5f135]/10 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-[#c5f135]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">Send Newsletter</p>
                  <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#c5f135]/15 text-[#c5f135]/70">Coming Soon</span>
                </div>
                <p className="text-xs text-white/35 mt-0.5">Email all your members at once</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── CLUB SETTINGS ── */}
        <div>
          <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-3">Club Settings</h2>
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] overflow-hidden">
            <button
              onClick={toggleClubVisibility}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-[#2e3d1a]/40 transition text-left border-b border-[#2e3d1a]"
            >
              {club.is_public
                ? <Globe className="w-4 h-4 text-[#c5f135] shrink-0" />
                : <Lock className="w-4 h-4 text-white/50 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Club Visibility</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {club.is_public ? "Visible on the discover map" : "Hidden — toggle runs public to share them"}
                </p>
              </div>
              <span className={`text-xs font-black px-2.5 py-1 rounded-full shrink-0
                ${club.is_public
                  ? "bg-[#c5f135]/10 text-[#c5f135] border border-[#c5f135]/30"
                  : "bg-white/5 text-white/40 border border-white/15"
                }`}>
                {club.is_public ? "Public" : "Private"}
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
                {[
                  { label: "Club Name", field: "name" as const, placeholder: "e.g. Boulder Trail Runners" },
                  { label: "City", field: "city" as const, placeholder: "e.g. Boulder, CO" },
                  { label: "Location", field: "location" as const, placeholder: "Meeting address" },
                ].map(({ label, field, placeholder }) => (
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
                  <button onClick={saveEdit} className="flex items-center gap-1.5 px-4 py-2 bg-[#c5f135] text-[#1a2110] rounded-full text-xs font-black">
                    <Check className="w-3 h-3" /> Save
                  </button>
                  <button onClick={() => setEditing(false)} className="flex items-center gap-1.5 px-4 py-2 border border-[#2e3d1a] text-white/50 rounded-full text-xs">
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

      </div>
    </div>
  )
}
