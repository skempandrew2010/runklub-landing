"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { localDateStr } from "@/utils/dates"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Trophy, Users, CalendarPlus,
  MessageSquare, MapPin,
  Zap, ShieldCheck,
  Globe, Lock, Check, X, Link2, Pencil, Trash2,
  ChevronDown, ChevronRight, Repeat2,
} from "lucide-react"
import RegionsLocationsTab from "@/app/admin/club-model/manager/RegionsLocationsTab"
import PaceGroupsTab from "@/app/admin/club-model/manager/PaceGroupsTab"
import WorkoutsTab from "@/app/admin/club-model/manager/WorkoutsTab"
import { Card, SectionTitle, Button, Input } from "@/app/admin/club-model/manager/ui"
import { isNativeApp } from "@/utils/platform"
import RunFormPanel from "./RunFormPanel"
import RunChatPanel from "@/components/RunChatPanel"
import { PLANS } from "@/lib/plans"

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
  workout_type_id: string | null
  description: string | null
  is_in_person: boolean
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

function clubAbbr(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

// ── Manager View ───────────────────────────────────────────────────────────────

const ALL_TABS = [
  { key: "setup",       label: "Setup",       free: false, starter: false, growth: true },
  { key: "members",     label: "Members",     free: false, starter: true,  growth: true },
  { key: "runs",        label: "Runs",        free: true,  starter: true,  growth: true },
  { key: "communicate", label: "Communicate", free: true,  starter: true,  growth: true },
  { key: "settings",   label: "Settings",    free: true,  starter: true,  growth: true },
] as const

type TabKey = (typeof ALL_TABS)[number]["key"]

function ManagerView({ userId }: { userId: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>("runs")
  const [runPanel, setRunPanel] = useState<null | "create" | "create-weekly" | string>(null)
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
  const [scheduleSending, setScheduleSending] = useState(false)
  const [scheduleResult, setScheduleResult] = useState<{ sent: number; skipped: number; total: number } | null>(null)
  const [scheduleError, setScheduleError] = useState("")
  const [upgrading, setUpgrading] = useState(false)
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly")
  const [nativeApp, setNativeApp] = useState(false)
  const [tierOverride, setTierOverride] = useState<"free" | "starter" | "growth" | "enterprise" | null>(null)
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [members, setMembers] = useState<{ id: string; user_id: string; created_at: string; member_type: string; profiles: { display_name: string | null; avatar_url: string | null } | null }[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [clubCoaches, setClubCoaches] = useState<{ id: string; name: string; user_id: string | null }[]>([])
  const [pendingRequests, setPendingRequests] = useState<{ id: string; created_at: string; user_id: string; profiles: { display_name: string | null; avatar_url: string | null } | null }[]>([])
  const [pendingInvites, setPendingInvites] = useState<{ id: string; email: string; name: string | null; created_at: string }[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteName, setInviteName] = useState("")
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteError, setInviteError] = useState("")
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [addEmail, setAddEmail] = useState("")
  const [addSending, setAddSending] = useState(false)
  const [addError, setAddError] = useState("")
  const [addSuccess, setAddSuccess] = useState("")
  const [addRegionId, setAddRegionId] = useState("")
  const [inviteRegionId, setInviteRegionId] = useState("")
  const [clubRegions, setClubRegions] = useState<{ id: string; name: string }[]>([])
  const [generating, setGenerating] = useState(false)
  const [generateStatus, setGenerateStatus] = useState("")
  const [selectedChatBranch, setSelectedChatBranch] = useState<string | null>(null)
  const [selectedRunsBranch, setSelectedRunsBranch] = useState<string | null>(null)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [memberRunWorkoutTypes, setMemberRunWorkoutTypes] = useState<{ id: string; title: string }[]>([])
  const [runDrafts, setRunDrafts] = useState<Record<string, { title: string; time: string; distance: string; meeting_point: string; route_url: string; workout_type_id: string; description: string; is_in_person: boolean }>>({})
  const [runSaving, setRunSaving] = useState<Set<string>>(new Set())
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    setNativeApp(isNativeApp())
    setIsAdminMode(typeof window !== "undefined" && new URLSearchParams(window.location.search).has("admin"))
  }, [])

  const loadRuns = useCallback(async (clubIds: string[]) => {
    if (clubIds.length === 0) { setAllRuns([]); return }
    const today = localDateStr()
    const { data: runs } = await supabase.from("runs")
      .select("*, members_only, clubs(name, image_url)")
      .in("club_id", clubIds).eq("kind", "run").gte("date", today).order("date").order("time")
    if (!runs || runs.length === 0) { setAllRuns([]); return }
    const runIds = runs.map((r: any) => r.id)
    const [{ data: chats }, { data: checkins }] = await Promise.all([
      supabase.from("run_chats").select("*, profiles(display_name, avatar_url)")
        .in("run_id", runIds).order("created_at", { ascending: false }),
      supabase.from("run_checkins").select("run_id").in("run_id", runIds),
    ])
    const chatsByRun: Record<string, ChatMessage[]> = {}
    for (const msg of (chats || []) as ChatMessage[]) {
      if (!chatsByRun[msg.run_id]) chatsByRun[msg.run_id] = []
      chatsByRun[msg.run_id].push(msg)
    }
    const counts: Record<string, number> = {}
    for (const c of (checkins || []) as { run_id: string }[]) {
      counts[c.run_id] = (counts[c.run_id] || 0) + 1
    }
    setAttendanceCounts(counts)
    setAllRuns((runs as RunWithClub[]).map((r) => ({
      ...r,
      message_count: chatsByRun[r.id]?.length || 0,
      last_message: chatsByRun[r.id]?.[0] || null,
    })))
  }, [])

  useEffect(() => {
    if (tab !== "members" || !selectedClubId) return
    setMembersLoading(true)
    Promise.all([
      supabase.from("subscriptions").select("id, user_id, created_at, member_type, profiles(display_name, avatar_url)").eq("club_id", selectedClubId).order("created_at", { ascending: false }),
      supabase.from("membership_requests").select("id, created_at, user_id, profiles(display_name, avatar_url)").eq("club_id", selectedClubId).eq("status", "pending").order("created_at", { ascending: true }),
      supabase.from("member_invites").select("id, email, name, created_at").eq("club_id", selectedClubId).eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("coaches").select("id, name, user_id").eq("club_id", selectedClubId),
    ]).then(([{ data: subs }, { data: reqs }, { data: invites }, { data: coachRows }]) => {
      setMembers((subs as any[]) || [])
      setPendingRequests((reqs as any[]) || [])
      setPendingInvites((invites as any[]) || [])
      setClubCoaches((coachRows as any[]) || [])
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
      const counts = await Promise.all(clubIds.map((id: string) =>
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("club_id", id)
      ))
      const clubsWithCounts: ClubWithCount[] = rawClubs.map((c: any, i: number) => ({ ...c, member_count: counts[i].count ?? 0 }))
      setMyClubs(clubsWithCounts)
      if (clubsWithCounts.length > 0) setSelectedClubId(clubsWithCounts[0].id)
      await loadRuns(clubIds)
      setLoading(false)
    }
    load()
  }, [userId, loadRuns])

  useEffect(() => {
    const club = myClubs.find((c) => c.id === selectedClubId)
    if (!club) return
    setEditForm({ name: club.name ?? "", city: club.city ?? "", location: club.location ?? "", day: club.meeting_day ?? "", time: club.meeting_time ?? "", instagram: club.instagram_handle ?? "", website: club.website ?? "", membership: club.membership_type ?? "free" })
    setEditing(false)
  }, [selectedClubId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate members-only runs whenever the Runs tab is active and data is ready.
  useEffect(() => {
    if (loading || tab !== "runs" || !selectedClubId) return
    generateMembersRuns(selectedClubId)
  }, [tab, selectedClubId, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedClubId) return
    supabase.from("runs").select("id, title").eq("club_id", selectedClubId).eq("kind", "workout").order("title")
      .then(({ data }) => setMemberRunWorkoutTypes(data ?? []))
    setSelectedChatBranch(null)
    setSelectedRunsBranch(null)
    setAddRegionId("")
    setInviteRegionId("")
    supabase.from("regions").select("id, name").eq("club_id", selectedClubId).order("name")
      .then(({ data }) => setClubRegions(data ?? []))
  }, [selectedClubId])

  useEffect(() => { setSelectedChatBranch(null); setSelectedRunsBranch(null) }, [tab])

  const deleteRun = async (runId: string) => {
    if (!confirm("Delete this run? This cannot be undone.")) return
    setAllRuns((prev) => prev.filter((r) => r.id !== runId))
    await supabase.from("runs").delete().eq("id", runId)
  }

  const saveRun = async (runId: string) => {
    const draft = runDrafts[runId]
    if (!draft) return
    setRunSaving((prev) => new Set(prev).add(runId))
    await supabase.from("runs").update({
      title: draft.title,
      time: draft.time,
      distance: draft.distance || null,
      meeting_point: draft.meeting_point || null,
      route_url: draft.route_url || null,
      workout_type_id: draft.workout_type_id || null,
      description: draft.description || null,
      is_in_person: draft.is_in_person,
    }).eq("id", runId)
    setRunSaving((prev) => { const s = new Set(prev); s.delete(runId); return s })
    await loadRuns(myClubs.map((c) => c.id))
    setExpandedRunId(null)
  }

  const handleRunSaved = async () => {
    const clubIds = myClubs.map((c) => c.id)
    await loadRuns(clubIds)
  }

  const generateMembersRuns = async (clubIdOverride?: string) => {
    const clubId = clubIdOverride ?? selectedClubId
    if (!clubId) { setGenerateStatus("No klub selected"); return }

    setGenerating(true)
    setGenerateStatus("")
    try {
      // Fetch tier directly from DB to avoid stale closure issues
      const { data: clubRow } = await supabase.from("clubs").select("tier").eq("id", clubId).single()
      const effectiveTier = tierOverride ?? clubRow?.tier
      if (effectiveTier !== "growth" && effectiveTier !== "enterprise") {
        setGenerateStatus(`Tier is "${effectiveTier}" — upgrade to Growth or Enterprise to generate runs`)
        return
      }

      const [{ data: regions, error: regErr }, { data: paceGroups, error: pgErr }] = await Promise.all([
        supabase.from("regions").select("id, name").eq("club_id", clubId),
        supabase.from("pace_groups").select("id, name").eq("club_id", clubId).order("pace_min"),
      ])
      if (regErr) throw regErr
      if (pgErr) throw pgErr
      if (!regions?.length) { setGenerateStatus("No branches configured in Setup"); return }
      if (!paceGroups?.length) { setGenerateStatus("No pace groups configured in Setup"); return }

      const { data: regionDays, error: rdErr } = await supabase
        .from("region_days").select("id, region_id, day_of_week")
        .in("region_id", regions.map((r) => r.id)).eq("meets", true)
      if (rdErr) throw rdErr
      if (!regionDays?.length) { setGenerateStatus("No days selected in Setup — toggle the days your klub meets"); return }

      // Fetch configured meeting times for each active day
      const rdIds = regionDays.map((rd) => rd.id)
      const { data: rdTimes } = rdIds.length > 0
        ? await supabase.from("region_day_times").select("region_day_id, time").in("region_day_id", rdIds)
        : { data: [] as { region_day_id: string; time: string | null }[] }
      const timesForDay: Record<string, string[]> = {}
      for (const dt of rdTimes ?? []) {
        if (!dt.time) continue
        const t = dt.time.slice(0, 5)
        if (!timesForDay[dt.region_day_id]) timesForDay[dt.region_day_id] = []
        timesForDay[dt.region_day_id].push(t)
      }
      for (const k of Object.keys(timesForDay)) timesForDay[k].sort()

      // Map each day name to the next upcoming occurrence of that day (>= today)
      const DAY_INDEX: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 }
      const today = new Date()
      const todayDayIdx = today.getDay()
      const weekDates: Record<string, string> = {}
      for (const [dayName, dayIdx] of Object.entries(DAY_INDEX)) {
        const daysUntil = (dayIdx - todayDayIdx + 7) % 7
        const d = new Date(today)
        d.setDate(today.getDate() + daysUntil)
        weekDates[dayName] = localDateStr(d)
      }

      // Query DB directly for existing members-only runs in the next 7 days
      const dates = Object.values(weekDates)
      const { data: existingRuns } = await supabase
        .from("runs").select("date, title, time")
        .eq("club_id", clubId).eq("members_only", true).in("date", dates)
      const existingKeys = new Set(existingRuns?.map((r) => `${r.date}|${r.title}|${(r.time ?? "").slice(0, 5)}`) ?? [])

      const toInsert = []
      for (const rd of regionDays) {
        const date = weekDates[rd.day_of_week]
        if (!date) continue
        const region = regions.find((r) => r.id === rd.region_id)
        if (!region) continue
        const times = timesForDay[rd.id]?.length ? timesForDay[rd.id] : ["06:00"]
        for (const pg of paceGroups) {
          const title = regions.length > 1 ? `${pg.name} · ${region.name}` : pg.name
          for (const time of times) {
            if (existingKeys.has(`${date}|${title}|${time}`)) continue
            toInsert.push({
              club_id: clubId,
              created_by: userId,
              kind: "run",
              members_only: true,
              is_public: false,
              title,
              date,
              time,
            })
          }
        }
      }

      if (toInsert.length === 0) {
        setGenerateStatus("All runs already exist for this week")
        return
      }

      const { error: insertErr } = await supabase.from("runs").insert(toInsert)
      if (insertErr) throw insertErr
      setGenerateStatus(`Generated ${toInsert.length} run${toInsert.length === 1 ? "" : "s"}`)
      await loadRuns(myClubs.map((c) => c.id))
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      setGenerateStatus(`Error: ${msg}`)
      console.error("generateMembersRuns failed:", err)
    } finally {
      setGenerating(false)
    }
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

  const sendTrainingSchedule = async () => {
    if (!selectedClubId) return
    setScheduleSending(true)
    setScheduleError("")
    setScheduleResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      // Compute this week's Monday in the user's local timezone so the server
      // doesn't drift onto the wrong week for non-UTC directors.
      const today = new Date()
      const dayOfWeek = today.getDay()
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const mon = new Date(today)
      mon.setDate(today.getDate() + diff)
      const weekMonday = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`
      const res = await fetch("/api/director/send-training-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ club_id: selectedClubId, week_monday: weekMonday }),
      })
      const json = await res.json()
      if (!res.ok) {
        setScheduleError(json.error ?? "Something went wrong. Please try again.")
      } else {
        setScheduleResult({ sent: json.sent, skipped: json.skipped, total: json.total })
      }
    } catch {
      setScheduleError("Network error. Please try again.")
    } finally {
      setScheduleSending(false)
    }
  }

  const startCheckout = async (tier: "starter" | "growth" | "enterprise", interval: "monthly" | "yearly" = "monthly") => {
    if (!selectedClubId) return
    setUpgrading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ clubId: selectedClubId, tier, interval }),
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
    if (clubRegions.length > 0 && !inviteRegionId) return
    setInviteSending(true)
    setInviteError("")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch("/api/director/invite-member", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ club_id: selectedClubId, email: inviteEmail.trim(), name: inviteName.trim() || undefined, region_id: inviteRegionId || undefined }),
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
        const { data } = await supabase.from("subscriptions").select("id, user_id, created_at, member_type, profiles(display_name, avatar_url)").eq("club_id", selectedClubId).order("created_at", { ascending: false })
        setMembers((data as any[]) || [])
      }
    }
  }

  const makeCoach = async (m: { user_id: string; profiles: { display_name: string | null } | null }) => {
    const name = m.profiles?.display_name || "Coach"
    const { data } = await supabase.from("coaches").insert({ club_id: selectedClubId, name, user_id: m.user_id }).select("id, name, user_id").single()
    if (data) setClubCoaches((prev) => [...prev, data as any])
  }

  const removeCoach = async (coachId: string) => {
    await supabase.from("coaches").delete().eq("id", coachId)
    setClubCoaches((prev) => prev.filter((c) => c.id !== coachId))
  }

  const addMember = async () => {
    if (!addEmail.trim() || !selectedClubId) return
    if (clubRegions.length > 0 && !addRegionId) return
    setAddSending(true)
    setAddError("")
    setAddSuccess("")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch("/api/director/add-member", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ club_id: selectedClubId, email: addEmail.trim(), region_id: addRegionId || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setAddError(json.error ?? "Something went wrong"); return }
      setAddSuccess(`${json.profile?.display_name || addEmail} added!`)
      setAddEmail("")
      const { data } = await supabase.from("subscriptions").select("id, user_id, created_at, member_type, profiles(display_name, avatar_url)").eq("club_id", selectedClubId).order("created_at", { ascending: false })
      setMembers((data as any[]) || [])
      setTimeout(() => setAddSuccess(""), 3000)
    } finally {
      setAddSending(false)
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

    const currentClub = myClubs.find((c) => c.id === selectedClubId)
    const locationChanged = editForm.location.trim() && editForm.location.trim() !== (currentClub?.location ?? "").trim()
    if (locationChanged) {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(editForm.location.trim())}.json?access_token=${token}&limit=1`)
        const geo = await res.json()
        const [lng, lat] = geo?.features?.[0]?.center ?? []
        if (lat != null && lng != null) { updates.latitude = lat; updates.longitude = lng }
      } catch { /* non-fatal — save location text without coords */ }
    }

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
    if (!confirm(`Delete ${club?.name ?? "this klub"}? This cannot be undone.`)) return
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
    return (
      <RunChatPanel
        target={{
          type: "run",
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
          <p className="text-white/80 text-base font-semibold">No klubs yet</p>
          <p className="text-white/30 text-sm mt-1 mb-6">Create your first run klub to get started.</p>
          <Link href="/submit-club" className="px-6 py-3 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition">
            + Create a Klub
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
    starter:    { name: "Starter",    price: "$24.99/mo", trial: true,  headline: "More tools for your klub",  features: ["Private member-only runs", "Weekly email reminders", "Charge members to join", "Workout library", "Verified badge"] },
    growth:     { name: "Growth",     price: "$49.99/mo", trial: false, headline: "Scale up your klub",        features: ["Everything in Starter", "One branch + unlimited locations", "Up to 10 coaches", "Priority placement"] },
    enterprise: { name: "Enterprise", price: "$99.99/mo", trial: false, headline: "Take your klub to the top", features: ["Everything in Growth", "Unlimited branches", "First in city search", "Event payments at 1%"] },
  }

  const makeUpgradeCard = (targetTier: "starter" | "growth" | "enterprise", highlighted: boolean) => {
    const info = UPSELL_INFO[targetTier]
    return (
      <div key={targetTier} className={`border rounded-2xl p-5 ${highlighted ? "bg-[#1a2110] border-[#c5f135]/20" : "bg-[#141f0d] border-[#2e3d1a]"}`}>
        <p className="text-[10px] font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">{info.name} — {info.price}</p>
        <p className="text-sm font-black text-white mb-3">{info.headline}</p>
        <ul className="space-y-1.5 mb-4">
          {info.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-white/80">
              <span className="text-[#c5f135] mt-0.5 shrink-0">✓</span>{f}
            </li>
          ))}
        </ul>
        {nativeApp ? (
          <p className="text-xs text-white/80">Upgrade at <span className="text-[#c5f135] font-semibold">runklub.fit</span> on the web.</p>
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

  const clubRuns = allRuns.filter((r) => r.club_id === selectedClubId)
  const communityRuns = clubRuns.filter((r) => !r.members_only)
  const membersOnlyRuns = clubRuns.filter((r) => r.members_only)
  const runsWithMessages = [...allRuns].filter((r) => r.message_count > 0).sort((a, b) => {
    const aT = a.last_message?.created_at ?? a.date
    const bT = b.last_message?.created_at ?? b.date
    return new Date(bT).getTime() - new Date(aT).getTime()
  })
  const runsNoMessages = allRuns.filter((r) => r.message_count === 0)
  const hasUnread = runsWithMessages.length > 0

  const RunCard = ({ run }: { run: RunChatPreview }) => {
    const todayStr = localDateStr()
    const isToday = run.date === todayStr
    const d = new Date(run.date + "T00:00:00")
    const dayLabel = isToday ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" })
    const dayNum = d.getDate()
    const isExpanded = expandedRunId === run.id
    const initDraft = () => ({ title: run.title, time: run.time ?? "06:00", distance: run.distance ?? "", meeting_point: run.meeting_point ?? "", route_url: run.route_url ?? "", workout_type_id: run.workout_type_id ?? "", description: run.description ?? "", is_in_person: run.is_in_person ?? true })
    const draft = runDrafts[run.id] ?? initDraft()
    const toggleExpand = () => {
      if (isExpanded) {
        setExpandedRunId(null)
      } else {
        setExpandedRunId(run.id)
        if (!runDrafts[run.id]) setRunDrafts((prev) => ({ ...prev, [run.id]: initDraft() }))
      }
    }
    return (
      <div className={`bg-[#111a0a] border border-[#2e3d1a] rounded-xl overflow-hidden ${isExpanded ? "border-[#c5f135]/20" : ""}`}>
        <div className="flex items-center gap-3 px-3 py-3">
          <div className={`w-9 shrink-0 flex flex-col items-center ${isToday ? "text-[#c5f135]" : "text-white/80"}`}>
            <span className="text-[9px] font-black uppercase tracking-wide leading-snug">{dayLabel}</span>
            <span className="text-lg font-black leading-tight">{dayNum}</span>
          </div>
          <div className="w-px h-8 bg-[#2e3d1a] shrink-0" />
          <button onClick={toggleExpand} className="flex-1 min-w-0 text-left">
            <p className="text-sm font-bold text-white truncate">{run.title}</p>
            <p className="text-xs text-white/60 mt-0.5 truncate">
              {formatTime(run.time)}
              {run.distance ? ` · ${run.distance}` : ""}
              {run.meeting_point ? ` · ${run.meeting_point}` : ""}
            </p>
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            {(attendanceCounts[run.id] ?? 0) > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/25">
                <Users className="w-2.5 h-2.5 text-[#c5f135]" />
                <span className="text-[10px] font-black text-[#c5f135]">{attendanceCounts[run.id]}</span>
              </div>
            )}
            <button onClick={toggleExpand} className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-[#2e3d1a] transition">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => deleteRun(run.id)} className="p-1.5 rounded-lg text-white/60 hover:text-red-400 hover:bg-red-400/10 transition">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {isExpanded && (
          <div className="border-t border-[#2e3d1a] px-4 py-3 space-y-2.5">
            <input
              placeholder="Title"
              value={draft.title}
              onChange={(e) => setRunDrafts((prev) => ({ ...prev, [run.id]: { ...draft, title: e.target.value } }))}
              className="w-full bg-[#0e150a] border border-[#2e3d1a] rounded-lg px-3 py-1.5 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#c5f135]/50"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="time"
                value={draft.time}
                onChange={(e) => setRunDrafts((prev) => ({ ...prev, [run.id]: { ...draft, time: e.target.value } }))}
                className="bg-[#0e150a] border border-[#2e3d1a] rounded-lg px-2 py-1.5 text-xs text-white/70 focus:outline-none focus:border-[#c5f135]/50 [color-scheme:dark]"
              />
              <input
                placeholder="Distance, e.g. 5K"
                value={draft.distance}
                onChange={(e) => setRunDrafts((prev) => ({ ...prev, [run.id]: { ...draft, distance: e.target.value } }))}
                className="flex-1 min-w-[90px] bg-[#0e150a] border border-[#2e3d1a] rounded-lg px-2 py-1.5 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#c5f135]/50"
              />
              <select
                value={draft.workout_type_id}
                onChange={(e) => setRunDrafts((prev) => ({ ...prev, [run.id]: { ...draft, workout_type_id: e.target.value } }))}
                className="flex-1 min-w-[120px] bg-[#0e150a] border border-[#2e3d1a] rounded-lg px-2 py-1.5 text-xs text-white/70 focus:outline-none focus:border-[#c5f135]/50"
              >
                <option value="">No workout type</option>
                {memberRunWorkoutTypes.map((wt) => <option key={wt.id} value={wt.id}>{wt.title}</option>)}
              </select>
            </div>
            <input
              placeholder="Meeting point"
              value={draft.meeting_point}
              onChange={(e) => setRunDrafts((prev) => ({ ...prev, [run.id]: { ...draft, meeting_point: e.target.value } }))}
              className="w-full bg-[#0e150a] border border-[#2e3d1a] rounded-lg px-3 py-1.5 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#c5f135]/50"
            />
            <textarea
              placeholder="Details, e.g. 6 × 800m @ 5k pace"
              rows={2}
              value={draft.description}
              onChange={(e) => setRunDrafts((prev) => ({ ...prev, [run.id]: { ...draft, description: e.target.value } }))}
              className="w-full bg-[#0e150a] border border-[#2e3d1a] rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#c5f135]/50 resize-none"
            />
            <input
              placeholder="Route URL"
              value={draft.route_url}
              onChange={(e) => setRunDrafts((prev) => ({ ...prev, [run.id]: { ...draft, route_url: e.target.value } }))}
              className="w-full bg-[#0e150a] border border-[#2e3d1a] rounded-lg px-3 py-1.5 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#c5f135]/50"
            />
            <label className="flex items-center gap-1.5 text-xs font-bold text-white/50 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.is_in_person}
                onChange={(e) => setRunDrafts((prev) => ({ ...prev, [run.id]: { ...draft, is_in_person: e.target.checked } }))}
                className="accent-[#c5f135]"
              />
              In person
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveRun(run.id)}
                disabled={runSaving.has(run.id)}
                className="px-3 py-1.5 rounded-full text-xs font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] disabled:opacity-40 transition"
              >
                {runSaving.has(run.id) ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setExpandedRunId(null)}
                className="px-3 py-1.5 rounded-full text-xs font-bold border border-[#2e3d1a] text-white/50 hover:text-white transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">

      {/* Club switcher */}
      {myClubs.length > 1 && (
        <div className="bg-[#111a0a] border-b border-[#2e3d1a] px-4 py-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest shrink-0 mr-1">My Klubs</p>
          {myClubs.map((club) => (
            <button key={club.id} onClick={() => setSelectedClubId(club.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition ${
                selectedClubId === club.id ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] text-white/80 border border-[#2e3d1a] hover:border-[#c5f135]/30 hover:text-white"
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
            <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest">Klub Manager</p>
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
              {selectedClub.city && <p className="text-xs text-white/80 flex items-center gap-1"><MapPin className="w-3 h-3" />{selectedClub.city}</p>}
              {selectedClub.member_count >= 2 && <p className="text-xs text-white/80 flex items-center gap-1"><Users className="w-3 h-3" />{selectedClub.member_count} members</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { const link = `${window.location.origin}/clubs/${selectedClub.id}?join=1`; navigator.clipboard.writeText(link); setCopiedJoinLink(true); setTimeout(() => setCopiedJoinLink(false), 2500) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-[#2e3d1a] text-white/80 hover:text-[#c5f135] hover:border-[#c5f135]/30 transition"
            >
              {copiedJoinLink ? <><Check className="w-3 h-3 text-[#c5f135]" /><span className="text-[#c5f135]">Copied!</span></> : <><Link2 className="w-3 h-3" />Join link</>}
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar + Content */}
      <div className="max-w-5xl mx-auto px-6 py-8 flex gap-8 items-start">

        {/* Sidebar */}
        <aside className="w-44 shrink-0 sticky top-4">
          <nav className="space-y-0.5">
            {ALL_TABS.map((t) => {
              const enabled = tabEnabled(t)
              const active = tab === t.key && runPanel === null
              return (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setRunPanel(null) }}
                  className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-bold transition
                    ${active ? "bg-[#c5f135]/10 text-[#c5f135]" : ""}
                    ${enabled && !active ? "text-white hover:text-white hover:bg-[#2e3d1a]/50" : ""}
                    ${!enabled ? "text-white/35" : ""}`}
                >
                  <span className="truncate">{t.label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {t.key === "communicate" && hasUnread && !active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#c5f135]" />
                    )}
                    {!enabled && <Lock className="w-2.5 h-2.5 opacity-40" />}
                  </div>
                </button>
              )
            })}
          </nav>

          {/* Tier preview — admin mode only (append ?admin=1 to URL) */}
          {isAdminMode && (() => {
            const TIER_PLANS: Record<"free" | "starter" | "growth" | "enterprise", { price: string; features: string[] }> = {
              free:       { price: "Free",        features: ["Public klub listing", "Unlimited run posts", "Run chat for members", "Basic analytics"] },
              starter:    { price: "$24.99/mo",   features: ["1-month free trial", "Private member-only runs", "Weekly email reminders", "Charge members to join", "Workout library", "Verified badge + invite by email"] },
              growth:     { price: "$49.99/mo",   features: ["Everything in Starter", "One branch + unlimited locations", "Pace groups", "Up to 10 coaches", "Priority placement in search"] },
              enterprise: { price: "$99.99/mo",   features: ["Everything in Growth", "Unlimited branches", "First in city search", "Training schedules", "Event payments at 1% fee"] },
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
                          ${active ? "bg-[#c5f135]/10 text-[#c5f135]" : "text-white/30 hover:text-white/80 hover:bg-[#2e3d1a]/40"}`}
                      >
                        <span>{t === "free" ? "Free" : t.charAt(0).toUpperCase() + t.slice(1)}</span>
                        {active && <span className="ml-1 font-normal opacity-60">{tierOverride !== null ? "· preview" : "· live"}</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="mx-3 rounded-xl border border-[#2e3d1a] bg-[#141f0d] p-3">
                  <div className="flex items-baseline justify-between gap-1 mb-2">
                    <p className="text-xs font-black text-white capitalize">{activeTier}</p>
                    <p className="text-xs font-bold text-[#c5f135]">{plan.price}</p>
                  </div>
                  <ul className="space-y-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-[11px] text-white/80 leading-snug">
                        <span className="text-[#c5f135] shrink-0 mt-px">✓</span>{f}
                      </li>
                    ))}
                  </ul>
                  {tierOverride !== null && (
                    <button onClick={() => setTierOverride(null)} className="mt-2.5 text-[10px] text-white/25 hover:text-white/80 transition">
                      ↩ back to live tier
                    </button>
                  )}
                </div>
              </div>
            )
          })()}
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* ── RUN FORM PANEL ── */}
          {runPanel !== null && (
            <RunFormPanel
              clubId={selectedClubId ?? ""}
              userId={userId}
              runId={runPanel === "create" || runPanel === "create-weekly" ? null : runPanel}
              tier={tier}
              quickMode={runPanel === "create-weekly"}
              onClose={() => setRunPanel(null)}
              onSaved={handleRunSaved}
              onGoToSetup={() => { setRunPanel(null); setTab("setup") }}
              onToggleQuickMode={() => setRunPanel(runPanel === "create-weekly" ? "create" : "create-weekly")}
            />
          )}

          {/* ── RUNS ── */}
          {tab === "runs" && runPanel === null && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setRunPanel("create")}
                  className="flex-1 flex items-center justify-between px-5 py-4 rounded-2xl bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition"
                >
                  <span className="text-sm font-black">Schedule a Run</span>
                  <CalendarPlus className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setRunPanel("create-weekly")}
                  className="flex items-center justify-between gap-2 px-5 py-4 rounded-2xl bg-[#1e2d12] border border-[#2e3d1a] text-white/80 hover:border-[#c5f135]/40 hover:text-white transition"
                >
                  <span className="text-sm font-black">Weekly Run</span>
                  <Repeat2 className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-3.5 h-3.5 text-white/80 shrink-0" />
                  <h2 className="text-xs font-bold text-white uppercase tracking-widest">Community Runs</h2>
                </div>
                <p className="text-xs text-white/80 mb-4">Open to everyone · visible on the discover map</p>
                {communityRuns.length === 0 ? (
                  <p className="text-sm text-white/80">No upcoming community runs.</p>
                ) : (
                  <div className="space-y-2">
                    {communityRuns.map((run) => <RunCard key={run.id} run={run} />)}
                  </div>
                )}
              </div>

              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-white/80 shrink-0" />
                    <h2 className="text-xs font-bold text-white uppercase tracking-widest">Members Only Runs</h2>
                  </div>
                  {isPaid
                    ? (isGrowth || isEnterprise) && (
                        <button onClick={() => generateMembersRuns(selectedClubId ?? undefined)} disabled={generating}
                          className="px-3 py-1 rounded-full text-[10px] font-black bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30 hover:bg-[#c5f135]/25 disabled:opacity-40 transition">
                          {generating ? "Generating…" : "Generate This Week"}
                        </button>
                      )
                    : <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110]">STARTER+</span>
                  }
                </div>
                <p className="text-xs text-white/80 mb-1">Only visible to paying members</p>
                {generateStatus && (
                  <p className={`text-xs mb-3 ${generateStatus.startsWith("Error") || generateStatus.includes("—") ? "text-red-400" : "text-[#c5f135]/80"}`}>
                    {generateStatus}
                  </p>
                )}
                {!isPaid ? (
                  <p className="text-sm text-white">Upgrade to Starter to create members-only runs.</p>
                ) : (
                  <>
                    {membersOnlyRuns.length === 0 ? (
                      <p className="text-sm text-white/50">No members-only runs yet — click Generate This Week above.</p>
                    ) : (
                      <div>{(() => {
                          const hasMultiBranch = membersOnlyRuns.some((r) => r.title.includes(" · "))
                          const splitTitle = (title: string) => {
                            const idx = title.lastIndexOf(" · ")
                            return idx === -1 ? { paceGroup: title, branch: null } : { paceGroup: title.slice(0, idx), branch: title.slice(idx + 3) }
                          }
                          const byBranch: Record<string, typeof membersOnlyRuns> = {}
                          for (const r of membersOnlyRuns) {
                            const key = splitTitle(r.title).branch ?? "__single__"
                            if (!byBranch[key]) byBranch[key] = []
                            byBranch[key].push(r)
                          }
                          const groupByPaceGroup = (runs: typeof membersOnlyRuns) => {
                            const map: Record<string, typeof membersOnlyRuns> = {}
                            for (const r of runs) {
                              const pg = splitTitle(r.title).paceGroup
                              if (!map[pg]) map[pg] = []
                              map[pg].push(r)
                            }
                            return map
                          }
                          const todayStr = localDateStr()
                          const renderRunRow = (run: typeof membersOnlyRuns[number]) => {
                            const d = new Date(run.date + "T00:00:00")
                            const isToday = run.date === todayStr
                            const dayLabel = d.toLocaleDateString("en-US", { weekday: "long" })
                            const dateLabel = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
                            const isExpanded = expandedRunId === run.id
                            const initDraft = () => ({ title: run.title, time: run.time ?? "06:00", distance: run.distance ?? "", meeting_point: run.meeting_point ?? "", route_url: run.route_url ?? "", workout_type_id: run.workout_type_id ?? "", description: run.description ?? "", is_in_person: run.is_in_person ?? true })
                            const draft = runDrafts[run.id] ?? initDraft()
                            return (
                              <div key={run.id} className={isExpanded ? "bg-[#0e150a]" : isToday ? "bg-[#c5f135]/5" : ""}>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      if (isExpanded) { setExpandedRunId(null) }
                                      else { setExpandedRunId(run.id); if (!runDrafts[run.id]) setRunDrafts((prev) => ({ ...prev, [run.id]: initDraft() })) }
                                    }}
                                    className="flex items-center gap-3 flex-1 min-w-0 px-4 py-3 text-left hover:bg-[#1e2d12] transition"
                                  >
                                    {isExpanded
                                      ? <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${isToday ? "text-[#c5f135]/60" : "text-white/25"}`} />
                                      : <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isToday ? "text-[#c5f135]/60" : "text-white/25"}`} />
                                    }
                                    <div className="min-w-0">
                                      <p className={`text-sm font-bold ${isToday ? "text-[#c5f135]" : "text-white"}`}>{dayLabel}s</p>
                                      <p className="text-xs text-white/40">{dateLabel} · {formatTime(run.time)}</p>
                                    </div>
                                  </button>
                                  {(attendanceCounts[run.id] ?? 0) > 0 && (
                                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/25 mr-1 shrink-0">
                                      <Users className="w-2.5 h-2.5 text-[#c5f135]" />
                                      <span className="text-[10px] font-black text-[#c5f135]">{attendanceCounts[run.id]}</span>
                                    </div>
                                  )}
                                  <button onClick={() => deleteRun(run.id)} className="p-2 mr-2 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-400/10 transition shrink-0">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {isExpanded && (
                                  <div className="border-t border-[#2e3d1a] px-4 py-3 space-y-3">
                                    <div className="flex items-center gap-4 flex-wrap">
                                      <label className="flex items-center gap-1.5 text-xs font-bold text-white/50 cursor-pointer">
                                        <input type="checkbox" checked={draft.is_in_person}
                                          onChange={(e) => setRunDrafts((prev) => ({ ...prev, [run.id]: { ...draft, is_in_person: e.target.checked } }))}
                                          className="accent-[#c5f135]" />
                                        In person
                                      </label>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <input type="time" value={draft.time}
                                        onChange={(e) => setRunDrafts((prev) => ({ ...prev, [run.id]: { ...draft, time: e.target.value } }))}
                                        className="bg-[#111a0a] border border-[#2e3d1a] rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-[#c5f135]/50 [color-scheme:dark]" />
                                      <select value={draft.workout_type_id}
                                        onChange={(e) => setRunDrafts((prev) => ({ ...prev, [run.id]: { ...draft, workout_type_id: e.target.value } }))}
                                        className="flex-1 min-w-[140px] bg-[#111a0a] border border-[#2e3d1a] rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-[#c5f135]/50">
                                        <option value="">No workout type</option>
                                        {memberRunWorkoutTypes.map((wt) => <option key={wt.id} value={wt.id}>{wt.title}</option>)}
                                      </select>
                                    </div>
                                    <textarea placeholder="Details, e.g. 6 × 800m @ 5k pace" rows={2} value={draft.description}
                                      onChange={(e) => setRunDrafts((prev) => ({ ...prev, [run.id]: { ...draft, description: e.target.value } }))}
                                      className="w-full bg-[#111a0a] border border-[#2e3d1a] rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-[#c5f135]/50 resize-none" />
                                    <div className="flex items-center gap-2">
                                      <button onClick={() => saveRun(run.id)} disabled={runSaving.has(run.id)}
                                        className="px-3 py-1.5 rounded-full text-xs font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] disabled:opacity-40 transition">
                                        {runSaving.has(run.id) ? "Saving…" : "Save"}
                                      </button>
                                      <button onClick={() => setExpandedRunId(null)}
                                        className="px-3 py-1.5 rounded-full text-xs font-bold border border-[#2e3d1a] text-white/50 hover:text-white transition">
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          }
                          const renderPaceGroups = (runs: typeof membersOnlyRuns) => (
                            <div className="space-y-5">
                              {Object.entries(groupByPaceGroup(runs)).map(([pg, pgRuns]) => (
                                <div key={pg}>
                                  <p className="text-base font-black text-white mb-2">{pg}</p>
                                  <div className="bg-[#111a0a] border border-[#2e3d1a] rounded-xl overflow-hidden divide-y divide-[#2e3d1a]">
                                    {pgRuns.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map(renderRunRow)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                          if (hasMultiBranch && !selectedRunsBranch) {
                            return (
                              <div className="space-y-2">
                                {Object.keys(byBranch).sort().map((branch) => (
                                  <button key={branch} onClick={() => setSelectedRunsBranch(branch)}
                                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#111a0a] border border-[#2e3d1a] hover:border-[#c5f135]/20 transition text-left">
                                    <p className="text-sm font-bold text-white">{branch}</p>
                                    <ChevronRight className="w-4 h-4 text-white/30" />
                                  </button>
                                ))}
                              </div>
                            )
                          }
                          return (
                            <div>
                              {hasMultiBranch && selectedRunsBranch && (
                                <button onClick={() => setSelectedRunsBranch(null)}
                                  className="flex items-center gap-1.5 text-xs font-bold text-white/50 hover:text-white mb-4 transition">
                                  <ArrowLeft className="w-3.5 h-3.5" /> All branches
                                </button>
                              )}
                              {renderPaceGroups(hasMultiBranch && selectedRunsBranch ? (byBranch[selectedRunsBranch] ?? []) : membersOnlyRuns)}
                            </div>
                          )
                        })()}</div>
                    )}
                  </>
                )}
              </div>

              {/* Workout Library */}
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-xs font-bold text-[#c5f135]/70 uppercase tracking-widest">Workout Library</h2>
                  {!isPaid && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110]">STARTER+</span>}
                </div>
                <p className="text-xs text-white/35 mb-4">Reusable workout types you can attach to any run</p>
                {isPaid
                  ? <WorkoutsTab clubId={selectedClubId ?? ""} />
                  : <p className="text-sm text-white/80">Upgrade to Starter to build a workout library.</p>
                }
              </div>
            </div>
          )}

          {/* ── MEMBERS ── */}
          {tab === "members" && runPanel === null && (() => {
            if (isFree) return (
              <div className="space-y-4">
                <p className="text-sm font-bold text-white/80 uppercase tracking-widest">Members</p>
                <p className="text-sm text-white/80">Unlock member management with Starter or above.</p>
                {makeUpgradeCard("starter", true)}
                {makeUpgradeCard("growth", false)}
                {makeUpgradeCard("enterprise", false)}
              </div>
            )

            const paidMembers = members.filter((m) => m.member_type === "paid")
            const communityMembers = members.filter((m) => m.member_type !== "paid")
            const showSplit = selectedClub.membership_type !== "free" && selectedClub.is_public

            const MemberRow = ({ m }: { m: typeof members[number] }) => {
              const coachEntry = clubCoaches.find((c) => c.user_id === m.user_id)
              return (
                <div className="flex items-center gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
                  <div className="w-8 h-8 rounded-full shrink-0 bg-[#2e3d1a] overflow-hidden flex items-center justify-center">
                    {m.profiles?.avatar_url
                      ? <img src={m.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-sm font-black text-[#c5f135]">{(m.profiles?.display_name || "?")[0].toUpperCase()}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{m.profiles?.display_name || "Runner"}</p>
                    <p className="text-xs text-white/80">Joined {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                  </div>
                  {showSplit && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${m.member_type === "paid" ? "bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30" : "bg-white/5 text-white/30 border border-white/10"}`}>
                      {m.member_type === "paid" ? "Paid" : "Free"}
                    </span>
                  )}
                  {coachEntry ? (
                    <button
                      onClick={() => removeCoach(coachEntry.id)}
                      className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30 hover:bg-red-400/10 hover:text-red-400 hover:border-red-400/30 transition"
                    >
                      Coach ✕
                    </button>
                  ) : (
                    <button
                      onClick={() => makeCoach(m)}
                      className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-white/30 border border-white/10 hover:bg-[#c5f135]/10 hover:text-[#c5f135]/70 hover:border-[#c5f135]/20 transition"
                    >
                      + Coach
                    </button>
                  )}
                </div>
              )
            }

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
                            <p className="text-xs text-white/80">Requested {new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
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
                  <SectionTitle>Add member</SectionTitle>
                  <p className="text-xs text-white/80 mb-3">Add someone who already has a RunKlub account.</p>
                  {clubRegions.length > 0 && (
                    <div className="mb-3">
                      <label className="text-xs font-bold text-white/60 block mb-1">Branch</label>
                      <select
                        value={addRegionId}
                        onChange={(e) => setAddRegionId(e.target.value)}
                        className="w-full bg-[#111a0a] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c5f135]/50"
                      >
                        <option value="">Select a branch…</option>
                        {clubRegions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input type="email" placeholder="Their email address" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMember()} />
                    </div>
                    <Button disabled={addSending || !addEmail.trim() || (clubRegions.length > 0 && !addRegionId)} onClick={addMember}>
                      {addSending ? "Adding…" : "Add"}
                    </Button>
                  </div>
                  {clubRegions.length > 0 && !addRegionId && (
                    <p className="text-xs text-white/40 mt-2">Select a branch above to enable adding</p>
                  )}
                  {addError && <p className="text-red-400 text-xs mt-2">{addError}</p>}
                  {addSuccess && <p className="text-[#c5f135] text-xs mt-2">{addSuccess}</p>}
                </Card>

                <Card>
                  <SectionTitle>Invite a member</SectionTitle>
                  <p className="text-xs text-white/80 mb-3">Send an email invite to someone who doesn&apos;t have an account yet.</p>
                  {clubRegions.length > 0 && (
                    <div className="mb-3">
                      <label className="text-xs font-bold text-white/60 block mb-1">Branch</label>
                      <select
                        value={inviteRegionId}
                        onChange={(e) => setInviteRegionId(e.target.value)}
                        className="w-full bg-[#111a0a] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c5f135]/50"
                      >
                        <option value="">Select a branch…</option>
                        {clubRegions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                  )}
                  {clubRegions.length > 0 && !inviteRegionId && (
                    <p className="text-xs text-white/40 mb-2">Select a branch above to enable sending</p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <div className="flex-1 min-w-[120px]">
                      <Input placeholder="Name (optional)" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <Input type="email" placeholder="Email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendInvite()} />
                    </div>
                    <Button disabled={inviteSending || !inviteEmail.trim() || (clubRegions.length > 0 && !inviteRegionId)} onClick={sendInvite}>
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
                            {inv.name && <p className="text-xs text-white/80">{inv.email}</p>}
                            <p className="text-xs text-white/80">Sent {new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                          </div>
                          <Button variant="danger" onClick={() => revokeInvite(inv.id)}>Revoke</Button>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {membersLoading ? (
                  <Card>
                    <div className="flex justify-center py-6">
                      <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
                    </div>
                  </Card>
                ) : members.length === 0 ? (
                  <Card>
                    <SectionTitle>Members</SectionTitle>
                    <p className="text-sm text-white/80">No members yet. Invite someone above or share your join link.</p>
                  </Card>
                ) : !showSplit ? (
                  <Card>
                    <div className="flex items-center justify-between mb-3">
                      <SectionTitle>Members</SectionTitle>
                      <span className="text-xs font-semibold text-white/30">{members.length}</span>
                    </div>
                    <div className="space-y-2">{members.map((m) => <MemberRow key={m.id} m={m} />)}</div>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    <Card>
                      <div className="flex items-center justify-between mb-3">
                        <SectionTitle>Paying Members</SectionTitle>
                        <span className="text-xs font-semibold text-white/30">{paidMembers.length}</span>
                      </div>
                      {paidMembers.length === 0
                        ? <p className="text-sm text-white/80">No paying members yet.</p>
                        : <div className="space-y-2">{paidMembers.map((m) => <MemberRow key={m.id} m={m} />)}</div>
                      }
                    </Card>
                    <Card>
                      <div className="flex items-center justify-between mb-3">
                        <SectionTitle>Community Members</SectionTitle>
                        <span className="text-xs font-semibold text-white/30">{communityMembers.length}</span>
                      </div>
                      {communityMembers.length === 0
                        ? <p className="text-sm text-white/80">No free followers yet.</p>
                        : <div className="space-y-2">{communityMembers.map((m) => <MemberRow key={m.id} m={m} />)}</div>
                      }
                    </Card>
                  </div>
                )}

                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <SectionTitle>Coaches</SectionTitle>
                    <span className="text-xs font-semibold text-white/30">{clubCoaches.length}</span>
                  </div>
                  <p className="text-xs text-white/80 mb-3">Designate coaches from your member list above.</p>
                  {clubCoaches.length === 0 ? (
                    <p className="text-sm text-white/80">No coaches yet. Use the "+ Coach" button on any member.</p>
                  ) : (
                    <div className="space-y-2">
                      {clubCoaches.map((coach) => {
                        const member = members.find((m) => m.user_id === coach.user_id)
                        return (
                          <div key={coach.id} className="flex items-center gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
                            <div className="w-8 h-8 rounded-full shrink-0 bg-[#2e3d1a] overflow-hidden flex items-center justify-center">
                              {member?.profiles?.avatar_url
                                ? <img src={member.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                                : <span className="text-sm font-black text-[#c5f135]">{coach.name[0]?.toUpperCase() || "C"}</span>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{coach.name}</p>
                            </div>
                            <button
                              onClick={() => removeCoach(coach.id)}
                              className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30 hover:bg-red-400/10 hover:text-red-400 hover:border-red-400/30 transition"
                            >
                              Coach ✕
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Card>

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

          {/* ── COMMUNICATE ── */}
          {tab === "communicate" && runPanel === null && (() => {
            const communityChats = clubRuns.filter((r) => !r.members_only).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
            const membersChats = clubRuns.filter((r) => r.members_only).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
            const hasMultiBranch = membersChats.some((r) => r.title.includes(" · "))
            const splitTitle = (title: string) => {
              const idx = title.lastIndexOf(" · ")
              return idx === -1 ? { paceGroup: title, branch: null } : { paceGroup: title.slice(0, idx), branch: title.slice(idx + 3) }
            }
            const groupByBranch = () => {
              const map: Record<string, RunChatPreview[]> = {}
              for (const run of membersChats) {
                const { branch } = splitTitle(run.title)
                const key = branch ?? ""
                if (!map[key]) map[key] = []
                map[key].push(run)
              }
              return map
            }
            const groupByPaceGroup = (runs: RunChatPreview[]) => {
              const map: Record<string, RunChatPreview[]> = {}
              for (const run of runs) {
                const { paceGroup } = splitTitle(run.title)
                if (!map[paceGroup]) map[paceGroup] = []
                map[paceGroup].push(run)
              }
              return map
            }
            const renderPaceGroups = (runs: RunChatPreview[]) => Object.entries(groupByPaceGroup(runs)).map(([pg, pgRuns]) => (
              <div key={pg} className="space-y-1">
                <p className="text-xs font-black text-white/50 px-1 pt-1">{pg}</p>
                {pgRuns.sort((a, b) => a.date.localeCompare(b.date)).map((run) => (
                  <button key={run.id} onClick={() => setSelectedRun(run)}
                    className="w-full flex items-center gap-4 px-3 py-2.5 rounded-xl bg-[#1a2110] border border-[#2e3d1a] hover:border-[#c5f135]/20 transition text-left">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold text-white truncate ${run.message_count === 0 ? "opacity-60" : ""}`}>{formatDay(run.date)}</p>
                      <p className="text-xs text-white/50">{formatTime(run.time)}</p>
                      {run.last_message && (
                        <p className="text-xs text-white/60 truncate mt-0.5">
                          <span className="text-white/80 font-medium">{run.last_message.profiles?.display_name || "Runner"}:</span>{" "}{run.last_message.message}
                        </p>
                      )}
                    </div>
                    {run.message_count > 0
                      ? <div className="shrink-0 w-6 h-6 rounded-full bg-[#c5f135] flex items-center justify-center"><span className="text-[9px] font-black text-[#1a2110]">{run.message_count > 9 ? "9+" : run.message_count}</span></div>
                      : <MessageSquare className="w-4 h-4 text-white/25 shrink-0" />
                    }
                  </button>
                ))}
              </div>
            ))
            const chatTitle = (run: RunChatPreview) => {
              if (run.members_only) return run.title
              const d = new Date(run.date + "T00:00:00")
              const dateStr = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
              return run.title || `Community Run on ${dateStr}`
            }
            const ChatRow = ({ run }: { run: RunChatPreview }) => (
              <button onClick={() => setSelectedRun(run)}
                className="w-full flex items-center gap-4 px-3 py-3 rounded-xl bg-[#1a2110] border border-[#2e3d1a] hover:border-[#c5f135]/20 transition text-left">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold text-white truncate mb-0.5 ${run.message_count === 0 ? "opacity-70" : ""}`}>{chatTitle(run)}</p>
                  <p className="text-xs text-white/60">{formatDay(run.date)} at {formatTime(run.time)}</p>
                  {run.last_message && (
                    <p className="text-xs text-white/60 truncate mt-1">
                      <span className="text-white/80 font-medium">{run.last_message.profiles?.display_name || "Runner"}:</span>{" "}{run.last_message.message}
                    </p>
                  )}
                </div>
                {run.message_count > 0
                  ? <div className="shrink-0 w-6 h-6 rounded-full bg-[#c5f135] flex items-center justify-center"><span className="text-[9px] font-black text-[#1a2110]">{run.message_count > 9 ? "9+" : run.message_count}</span></div>
                  : <MessageSquare className="w-4 h-4 text-white/25 shrink-0" />
                }
              </button>
            )
            return (
              <div className="space-y-6">
                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <SectionTitle>
                      Send Newsletter
                      {!isGrowth && !isEnterprise && <span className="ml-2 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110] align-middle">GROWTH+</span>}
                    </SectionTitle>
                    {!newsletterOpen && (
                      <Button onClick={() => { setNewsletterOpen(true); setNewsletterError(""); setNewsletterResult(null) }}>Compose</Button>
                    )}
                  </div>
                  {!newsletterOpen && (
                    <p className="text-sm text-white">Email all {selectedClub?.member_count ?? 0} follower{selectedClub?.member_count === 1 ? "" : "s"}</p>
                  )}
                  {newsletterOpen && !isGrowth && !isEnterprise && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                          <Lock className="w-4 h-4 text-white/80" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">Newsletters require Growth or above</p>
                          <p className="text-xs text-white/80 mt-0.5">Upgrade to Growth to email your followers directly.</p>
                        </div>
                      </div>
                      {!nativeApp && <Button onClick={() => startCheckout("growth")} disabled={upgrading}>{upgrading ? "Redirecting…" : "Upgrade to Growth"}</Button>}
                    </div>
                  )}
                  {newsletterOpen && (isGrowth || isEnterprise) && (
                    <div className="space-y-3">
                      {newsletterResult ? (
                        <div className="flex items-center gap-3 py-2">
                          <div className="w-8 h-8 rounded-full bg-[#c5f135]/15 flex items-center justify-center shrink-0">
                            <Check className="w-4 h-4 text-[#c5f135]" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">Newsletter sent!</p>
                            <p className="text-xs text-white/80 mt-0.5">Delivered to {newsletterResult.sent} of {newsletterResult.total} subscribers</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="block text-[10px] font-bold text-white/80 uppercase tracking-widest mb-1.5">Subject</label>
                            <Input type="text" value={newsletterSubject} onChange={(e) => setNewsletterSubject(e.target.value)} placeholder="e.g. This weekend's run details" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-white/80 uppercase tracking-widest mb-1.5">Message</label>
                            <textarea value={newsletterBody} onChange={(e) => setNewsletterBody(e.target.value)} placeholder="Write your message to klub followers…" rows={5}
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
                  <div className="flex items-center justify-between mb-3">
                    <SectionTitle>
                      Send Training Schedule
                      {!isGrowth && !isEnterprise && <span className="ml-2 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110] align-middle">GROWTH+</span>}
                    </SectionTitle>
                  </div>
                  {!isGrowth && !isEnterprise ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                          <Lock className="w-4 h-4 text-white/80" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">Training schedule emails require Growth or above</p>
                          <p className="text-xs text-white/80 mt-0.5">Upgrade to send each member their personalized weekly schedule.</p>
                        </div>
                      </div>
                      {!nativeApp && <Button onClick={() => startCheckout("growth")} disabled={upgrading}>{upgrading ? "Redirecting…" : "Upgrade to Growth"}</Button>}
                    </div>
                  ) : scheduleResult ? (
                    <div className="flex items-center gap-3 py-1">
                      <div className="w-8 h-8 rounded-full bg-[#c5f135]/15 flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4 text-[#c5f135]" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">Training schedules sent!</p>
                        <p className="text-xs text-white/80 mt-0.5">Delivered to {scheduleResult.sent} of {scheduleResult.total} active members{scheduleResult.skipped > 0 ? ` (${scheduleResult.skipped} skipped — no pace group assigned)` : ""}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-white/80">Sends each active member their personalized runs for this week, matched to their pace group and branch.</p>
                      {scheduleError && <p className="text-red-400/80 text-xs">{scheduleError}</p>}
                      <Button onClick={sendTrainingSchedule} disabled={scheduleSending}>
                        {scheduleSending ? "Sending…" : "Send this week's schedule"}
                      </Button>
                    </div>
                  )}
                </Card>

                <Card>
                  <SectionTitle>Run Chats</SectionTitle>
                  {clubRuns.length === 0 ? (
                    <p className="text-sm text-white/60">No upcoming runs. Schedule a run to see chats here.</p>
                  ) : (
                    <div className="space-y-2">
                      {communityChats.length > 0 && (
                        <>
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Community Runs</p>
                          {communityChats.map((run) => <ChatRow key={run.id} run={run} />)}
                        </>
                      )}
                      {membersChats.length > 0 && (
                        <div className={communityChats.length > 0 ? "mt-4" : ""}>
                          {hasMultiBranch && !selectedChatBranch ? (
                            <>
                              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Members Only — Branches</p>
                              <div className="space-y-1.5">
                                {Object.entries(groupByBranch()).sort(([a], [b]) => a.localeCompare(b)).map(([branch, branchRuns]) => {
                                  const activeCount = branchRuns.filter((r) => r.message_count > 0).length
                                  return (
                                    <button key={branch} onClick={() => setSelectedChatBranch(branch)}
                                      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#1a2110] border border-[#2e3d1a] hover:border-[#c5f135]/20 transition text-left">
                                      <p className="text-sm font-bold text-white">{branch}</p>
                                      <div className="flex items-center gap-2 shrink-0">
                                        {activeCount > 0 && (
                                          <div className="w-5 h-5 rounded-full bg-[#c5f135] flex items-center justify-center">
                                            <span className="text-[9px] font-black text-[#1a2110]">{activeCount > 9 ? "9+" : activeCount}</span>
                                          </div>
                                        )}
                                        <ChevronRight className="w-4 h-4 text-white/30" />
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 mb-2">
                                {hasMultiBranch && selectedChatBranch && (
                                  <button onClick={() => setSelectedChatBranch(null)} className="flex items-center gap-1 text-[10px] font-bold text-white/40 hover:text-white/70 transition">
                                    <ArrowLeft className="w-3 h-3" />
                                  </button>
                                )}
                                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                  {hasMultiBranch && selectedChatBranch ? `Members Only — ${selectedChatBranch}` : "Members Only"}
                                </p>
                              </div>
                              <div className="space-y-3">
                                {renderPaceGroups(hasMultiBranch && selectedChatBranch ? (groupByBranch()[selectedChatBranch] ?? []) : membersChats)}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      {communityChats.length === 0 && membersChats.length === 0 && (
                        <p className="text-sm text-white/60">No messages yet.</p>
                      )}
                    </div>
                  )}
                </Card>
              </div>
            )
          })()}

          {/* ── SETUP ── */}
          {tab === "setup" && runPanel === null && (
            isGrowth || isEnterprise ? (
              <div className="space-y-8">
                <div>
                  <h2 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-4">Branches & Locations</h2>
                  <RegionsLocationsTab clubId={selectedClubId ?? ""} />
                </div>
                <div className="border-t border-[#2e3d1a] pt-8">
                  <h2 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-4">Pace Groups</h2>
                  <PaceGroupsTab clubId={selectedClubId ?? ""} />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-bold text-white/80 uppercase tracking-widest">Setup</p>
                <p className="text-sm text-white/80">Unlock branches, locations, and pace groups with Growth or above.</p>
                {makeUpgradeCard("growth", true)}
                {makeUpgradeCard("enterprise", false)}
              </div>
            )
          )}

          {/* ── SETTINGS ── */}
          {tab === "settings" && runPanel === null && (
            <div className="space-y-6">
              <Card>
                <SectionTitle>Klub Visibility</SectionTitle>
                <button onClick={toggleClubVisibility}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#1a2110] border border-[#2e3d1a] hover:border-[#c5f135]/20 transition text-left">
                  {selectedClub.is_public ? <Globe className="w-4 h-4 text-[#c5f135] shrink-0" /> : <Lock className="w-4 h-4 text-white/80 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">Klub Visibility</p>
                    <p className="text-xs text-white/80 mt-0.5">{selectedClub.is_public ? "Visible on the discover map" : "Hidden — only members can find you"}</p>
                  </div>
                  <span className={`text-xs font-black px-2.5 py-1 rounded-full shrink-0 ${selectedClub.is_public ? "bg-[#c5f135]/10 text-[#c5f135] border border-[#c5f135]/30" : "bg-white/5 text-white/80 border border-white/15"}`}>
                    {selectedClub.is_public ? "Public" : "Private"}
                  </span>
                </button>
              </Card>

              <Card>
                <div className="flex items-center justify-between mb-3">
                  <SectionTitle>Klub Details</SectionTitle>
                  <button onClick={() => setEditing(!editing)} className="text-xs font-bold text-white/80 hover:text-white transition">{editing ? "Cancel" : "Edit"}</button>
                </div>
                {editing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1.5">Klub Photo</label>
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
                          className="w-full h-20 rounded-xl border-2 border-dashed border-[#2e3d1a] hover:border-[#c5f135]/40 flex items-center justify-center text-white/30 hover:text-white/80 transition text-xs font-medium">
                          Upload new photo
                        </button>
                      )}
                    </div>
                    {([
                      { label: "Klub Name", field: "name" as const, placeholder: "e.g. Boulder Trail Runners" },
                      { label: "City", field: "city" as const, placeholder: "e.g. Boulder, CO" },
                      { label: "Location", field: "location" as const, placeholder: "Meeting address or landmark" },
                      { label: "Meeting Day", field: "day" as const, placeholder: "e.g. Saturday" },
                    ]).map(({ label, field, placeholder }) => (
                      <div key={field}>
                        <label className="block text-xs font-semibold text-white/80 mb-1">{label}</label>
                        <Input value={editForm[field]} onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })} placeholder={placeholder} />
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1">Meeting Time</label>
                      <input type="time" value={editForm.time} onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                        className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c5f135]/50 transition" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1">Instagram <span className="font-normal text-white/25">(optional)</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm pointer-events-none">@</span>
                        <input value={editForm.instagram} onChange={(e) => setEditForm({ ...editForm, instagram: e.target.value.replace(/^@/, "") })} placeholder="yourklubhandle"
                          className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl pl-7 pr-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1">Website <span className="font-normal text-white/25">(optional)</span></label>
                      <Input value={editForm.website} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} placeholder="https://yourklub.com" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1.5">Membership</label>
                      <div className="space-y-1.5">
                        {([
                          { value: "free", label: "Free to Join" },
                          { value: "optional_paid", label: "Free + Paid Options" },
                          { value: "paid_required", label: "Membership Required" },
                        ] as { value: MembershipType; label: string }[]).map(({ value, label }) => (
                          <button key={value} type="button" onClick={() => setEditForm({ ...editForm, membership: value })}
                            className={`w-full text-left px-3 py-2 rounded-xl border text-sm transition ${editForm.membership === value ? "bg-[#c5f135]/10 border-[#c5f135]/40 text-[#c5f135] font-semibold" : "bg-[#1a2110] border-[#2e3d1a] text-white/80 hover:border-[#c5f135]/20"}`}>
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
                  <div className="space-y-2 text-sm text-white/80">
                    {selectedClub.city && <p><span className="text-white/30 text-xs uppercase tracking-widest font-bold">City</span><br />{selectedClub.city}</p>}
                    {selectedClub.location && <p><span className="text-white/30 text-xs uppercase tracking-widest font-bold">Location</span><br />{selectedClub.location}</p>}
                    {selectedClub.meeting_day && <p><span className="text-white/30 text-xs uppercase tracking-widest font-bold">Meets</span><br />{[selectedClub.meeting_day, selectedClub.meeting_time ? formatTime(selectedClub.meeting_time) : null].filter(Boolean).join(" · ")}</p>}
                  </div>
                )}
              </Card>

              <Card>
                <SectionTitle>Plan & Billing</SectionTitle>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm text-white/80">Current plan:</span>
                  <span className="text-sm font-bold text-white capitalize">{selectedClub.tier || "Free"}</span>
                </div>
                {!nativeApp ? (
                  <>
                    {!isEnterprise && (() => {
                      const nextTier = isGrowth ? "enterprise" : isStarter ? "growth" : "starter"
                      const nextPlan = PLANS[nextTier]
                      const price = billingInterval === "monthly" ? nextPlan.price?.monthly : nextPlan.price?.yearly
                      return (
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex bg-[#1a2110] border border-[#2e3d1a] rounded-full p-0.5">
                            {(["monthly", "yearly"] as const).map((iv) => (
                              <button
                                key={iv}
                                onClick={() => setBillingInterval(iv)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition capitalize ${
                                  billingInterval === iv ? "bg-[#c5f135] text-[#1a2110]" : "text-white/50 hover:text-white"
                                }`}
                              >
                                {iv}
                              </button>
                            ))}
                          </div>
                          {price != null && (
                            <span className="text-xs text-white/50">
                              ${price}/{billingInterval === "monthly" ? "mo" : "yr"} for {nextPlan.name}
                            </span>
                          )}
                        </div>
                      )
                    })()}
                    <div className="flex gap-2 flex-wrap">
                      {!isEnterprise && (
                        <Button onClick={() => startCheckout(isGrowth ? "enterprise" : isStarter ? "growth" : "starter", billingInterval)} disabled={upgrading}>
                          {upgrading ? "Redirecting…" : isGrowth ? "Upgrade to Enterprise" : isStarter ? "Upgrade to Growth" : "Start free trial"}
                        </Button>
                      )}
                      <Link href="/profile">
                        <Button variant="ghost">Manage subscription</Button>
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-white/80">Manage your subscription at <span className="text-[#c5f135] font-semibold">runklub.fit</span> on the web.</p>
                )}
              </Card>

              <div className="border border-red-500/20 rounded-2xl p-5 bg-red-500/5">
                <p className="text-xs font-bold text-red-400/70 uppercase tracking-widest mb-3">Danger Zone</p>
                <p className="text-xs text-white/80 mb-4">Deleting your klub is permanent and cannot be undone. All runs, members, and data will be lost.</p>
                <Button variant="danger" onClick={handleDelete}>Delete this klub</Button>
              </div>
            </div>
          )}

        </div>{/* end content */}
      </div>{/* end sidebar+content */}
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
      // Director dashboard is manager-only — members' chats now live in the Hub
      if (prof?.role !== "manager") { router.replace("/"); return }
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

  if (!user || !profile) return null

  return <ManagerView userId={user.id} />
}
