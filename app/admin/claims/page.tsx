"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Check, X, Clock, ExternalLink, Send, RotateCcw, Search, Ban, Trash2, AlertTriangle, ChevronDown, ChevronUp, Globe, Mail } from "lucide-react"

type Claim = {
  id: string
  club_id: string | null
  user_id: string | null
  instagram: string | null
  message: string | null
  status: string
  created_at: string
  clubs: { name: string; city: string | null; instagram_handle: string | null } | null
  profiles: { display_name: string | null } | null
  club_name: string | null
  contact_name: string | null
  contact_email: string | null
  city: string | null
  website: string | null
  referral_source: string | null
  claimed_at: string | null
}

type UnclaimedClub = {
  id: string
  name: string
  city: string | null
  contact_email: string | null
  claim_token: string | null
  claim_token_used_at: string | null
  invite_sent_at: string | null
  instagram_handle: string | null
  bad_contact: boolean | null
}

type EditableClub = {
  id: string
  name: string
  city: string | null
  description: string | null
  instagram_handle: string | null
  contact_email: string | null
  website: string | null
  meeting_day: string | null
  meeting_time: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  is_public: boolean
  bad_contact: boolean
}

type ReminderClub = {
  id: string
  name: string
  city: string | null
  contact_email: string | null
  invite_sent_at: string
  invite_link_clicked_at: string | null
  claim_token: string | null
  reminder_sent_at: string | null
}

type OwnedClub = {
  id: string
  name: string
  city: string | null
  user_id: string
}

type FunnelClub = {
  id: string
  name: string
  city: string | null
  contact_email: string | null
  invite_sent_at: string | null
  ig_invite_sent_at: string | null
  invite_link_clicked_at: string | null
  claim_token_used_at: string | null
  user_id: string | null
}

export default function AdminClaimsPage() {
  const router = useRouter()
  const [claims, setClaims] = useState<Claim[]>([])
  const [unclaimedClubs, setUnclaimedClubs] = useState<UnclaimedClub[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [tab, setTab] = useState<"claims" | "invite" | "sent" | "funnel" | "clubs" | "reminders">("claims")
  const [inviteEmails, setInviteEmails] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({})
  const [claimsSearch, setClaimsSearch] = useState("")
  const [claimsFilter, setClaimsFilter] = useState<"all" | "pending" | "approved" | "rejected">("all")
  const [inviteSearch, setInviteSearch] = useState("")
  const [inviteInstagrams, setInviteInstagrams] = useState<Record<string, string>>({})
  const [copiedIg, setCopiedIg] = useState<string | null>(null)
  const [markingSent, setMarkingSent] = useState<string | null>(null)
  const [markingBadContact, setMarkingBadContact] = useState<string | null>(null)
  const [ownedClubs, setOwnedClubs] = useState<OwnedClub[]>([])
  const [editableClubs, setEditableClubs] = useState<EditableClub[]>([])
  const [editableClubsLoaded, setEditableClubsLoaded] = useState(false)
  const [editSearch, setEditSearch] = useState("")
  const [expandedClub, setExpandedClub] = useState<string | null>(null)
  const [editState, setEditState] = useState<Partial<EditableClub>>({})
  const [savingClub, setSavingClub] = useState<string | null>(null)
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  const [reminderClubs, setReminderClubs] = useState<ReminderClub[]>([])
  const [reminderClubsLoaded, setReminderClubsLoaded] = useState(false)
  const [reminderSearch, setReminderSearch] = useState("")
  const [sendingReminder, setSendingReminder] = useState<string | null>(null)
  const [reminderSent, setReminderSent] = useState<Set<string>>(new Set())
  const [reminderErrors, setReminderErrors] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [deleting, setDeleting] = useState(false)

  const openDelete = (club: { id: string; name: string }) => {
    setDeleteTarget(club)
    setDeletePassword("")
    setDeleteError("")
  }
  const closeDelete = () => {
    setDeleteTarget(null)
    setDeletePassword("")
    setDeleteError("")
  }
  const handleDelete = async () => {
    if (!deleteTarget || !deletePassword) return
    setDeleting(true)
    setDeleteError("")
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/admin/delete-club", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ club_id: deleteTarget.id, password: deletePassword }),
    })
    if (res.ok) {
      const id = deleteTarget.id
      setUnclaimedClubs((prev) => prev.filter((c) => c.id !== id))
      setOwnedClubs((prev) => prev.filter((c) => c.id !== id))
      setClaims((prev) => prev.filter((c) => c.club_id !== id))
      setFunnelClubs((prev) => prev.filter((c) => c.id !== id))
      closeDelete()
    } else {
      const json = await res.json().catch(() => ({}))
      setDeleteError(json.error ?? "Failed to delete")
    }
    setDeleting(false)
  }

  const markIgSent = async (clubId: string) => {
    setMarkingSent(clubId)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/admin/mark-ig-sent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ club_id: clubId }),
    })
    if (res.ok) {
      const now = new Date().toISOString()
      setUnclaimedClubs((prev) => prev.map((c) => c.id === clubId ? { ...c, invite_sent_at: now } : c))
    }
    setMarkingSent(null)
  }

  const markBadContact = async (clubId: string) => {
    setMarkingBadContact(clubId)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/admin/mark-bad-contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ club_id: clubId }),
    })
    if (res.ok) {
      setUnclaimedClubs((prev) => prev.map((c) => c.id === clubId ? { ...c, bad_contact: true } : c))
    }
    setMarkingBadContact(null)
  }

  const loadEditableClubs = async () => {
    const { data } = await supabase
      .from("clubs")
      .select("id, name, city, description, instagram_handle, contact_email, website, meeting_day, meeting_time, location, latitude, longitude, is_public, bad_contact")
      .order("name")
    setEditableClubs((data as EditableClub[]) ?? [])
    setEditableClubsLoaded(true)
  }

  const saveClub = async (clubId: string) => {
    setSavingClub(clubId)
    setSaveErrors((prev) => { const n = { ...prev }; delete n[clubId]; return n })
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/admin/update-club", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ club_id: clubId, updates: editState }),
    })
    if (res.ok) {
      setEditableClubs((prev) => prev.map((c) => c.id === clubId ? { ...c, ...editState } : c))
      setExpandedClub(null)
      setEditState({})
    } else {
      const json = await res.json().catch(() => ({}))
      setSaveErrors((prev) => ({ ...prev, [clubId]: json.error ?? "Failed to save." }))
    }
    setSavingClub(null)
  }

  const loadReminderClubs = async () => {
    const { data } = await supabase
      .from("clubs")
      .select("id, name, city, contact_email, invite_sent_at, invite_link_clicked_at, claim_token, reminder_sent_at")
      .not("invite_sent_at", "is", null)
      .is("claim_token_used_at", null)
      .is("user_id", null)
      .order("invite_sent_at", { ascending: false })
    setReminderClubs((data as ReminderClub[]) ?? [])
    setReminderClubsLoaded(true)
  }

  const sendReminder = async (clubId: string) => {
    setSendingReminder(clubId)
    setReminderErrors((prev) => { const n = { ...prev }; delete n[clubId]; return n })
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/admin/send-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ club_id: clubId }),
    })
    if (res.ok) {
      const now = new Date().toISOString()
      setReminderSent((prev) => new Set(prev).add(clubId))
      setReminderClubs((prev) => prev.map((c) => c.id === clubId ? { ...c, reminder_sent_at: now } : c))
    } else {
      const json = await res.json().catch(() => ({}))
      setReminderErrors((prev) => ({ ...prev, [clubId]: json.error ?? "Failed to send." }))
    }
    setSendingReminder(null)
  }

  const buildIgMessage = (club: UnclaimedClub) => {
    const city = club.city ?? "your city"
    const link = `https://www.runklub.fit/welcome?t=${club.claim_token}`
    return `Hey ${club.name}! I run RunKlub — a free platform for run clubs in ${city}. Your club is already listed and I'd love to get you set up so more runners can find you.\n\nClaim your page: ${link}\n\nHappy to jump on a call too if that's easier!`
  }

  const handleIgClick = async (club: UnclaimedClub, igHandle: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/admin/generate-ig-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ club_id: club.id, instagram_handle: igHandle }),
    })
    if (!res.ok) return
    const { link, claim_token: freshToken } = await res.json()
    setUnclaimedClubs((prev) => prev.map((c) => c.id === club.id
      ? { ...c, instagram_handle: igHandle, claim_token: freshToken }
      : c
    ))
    try { await navigator.clipboard.writeText(buildIgMessage({ ...club, claim_token: freshToken, instagram_handle: igHandle })) } catch {}
    setCopiedIg(club.id)
    setTimeout(() => setCopiedIg((prev) => prev === club.id ? null : prev), 2000)
    window.open(`https://instagram.com/${igHandle}`, "_blank")
  }
  const [funnelClubs, setFunnelClubs] = useState<FunnelClub[]>([])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single()
      if (profile?.role !== "admin") { router.push("/"); return }

      const { data, error: claimsError } = await supabase
        .from("club_claims")
        .select("*, clubs(name, city, instagram_handle), profiles!club_claims_user_id_profiles_fkey(display_name), club_name, contact_name, contact_email, city, website, referral_source, claimed_at")
        .order("created_at", { ascending: false })

      if (claimsError) console.error("club_claims query error:", claimsError)
      setClaims((data as Claim[]) ?? [])

      const { data: clubs } = await supabase
        .from("clubs")
        .select("id, name, city, contact_email, claim_token, claim_token_used_at, invite_sent_at, instagram_handle, bad_contact")
        .is("claim_token_used_at", null)
        .order("name")
      setUnclaimedClubs((clubs as UnclaimedClub[]) ?? [])

      const { data: funnel } = await supabase
        .from("clubs")
        .select("id, name, city, contact_email, invite_sent_at, ig_invite_sent_at, invite_link_clicked_at, claim_token_used_at, user_id")
        .not("invite_sent_at", "is", null)
        .order("invite_sent_at", { ascending: false })
      setFunnelClubs((funnel as FunnelClub[]) ?? [])

      // Clubs that have an owner but no club_claims record — surfaces edge cases
      const claimedClubIds = new Set(
        ((data ?? []) as Claim[]).filter(c => c.club_id).map(c => c.club_id!)
      )
      const { data: owned } = await supabase
        .from("clubs")
        .select("id, name, city, user_id")
        .not("user_id", "is", null)
        .order("name")
      setOwnedClubs(
        ((owned ?? []) as OwnedClub[]).filter(c => !claimedClubIds.has(c.id))
      )

      setLoading(false)
    }
    load()
  }, [])

  const sendInvite = async (clubId: string, isResend = false) => {
    const email = inviteEmails[clubId]?.trim()
    const club = unclaimedClubs.find((c) => c.id === clubId)
    const sendTo = email || club?.contact_email
    if (!sendTo) return
    setSending(clubId)
    setInviteErrors((prev) => { const n = { ...prev }; delete n[clubId]; return n })
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/admin/send-claim-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ club_id: clubId, email: sendTo, resend: isResend }),
    })
    setSending(null)
    if (res.ok) {
      setSent((prev) => new Set(prev).add(clubId))
      setUnclaimedClubs((prev) =>
        prev.map((c) => c.id === clubId
          ? { ...c, contact_email: email || c.contact_email, invite_sent_at: new Date().toISOString() }
          : c
        )
      )
    } else {
      const json = await res.json().catch(() => ({}))
      setInviteErrors((prev) => ({ ...prev, [clubId]: json.error ?? "Failed to send — check console." }))
    }
  }

  const cancelInvite = async (clubId: string) => {
    setCancelling(clubId)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/admin/cancel-claim-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ club_id: clubId }),
    })
    setCancelling(null)
    if (res.ok) {
      // Move club back to "Not Yet Contacted"
      setUnclaimedClubs((prev) =>
        prev.map((c) => c.id === clubId ? { ...c, invite_sent_at: null } : c)
      )
      setSent((prev) => { const n = new Set(prev); n.delete(clubId); return n })
    } else {
      const json = await res.json().catch(() => ({}))
      setInviteErrors((prev) => ({ ...prev, [clubId]: json.error ?? "Failed to cancel." }))
    }
  }

  const act = async (claimId: string, action: "approve" | "reject") => {
    setActing(claimId)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/admin/claims/${claimId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action }),
    })
    setClaims((prev) =>
      prev.map((c) => c.id === claimId ? { ...c, status: action === "approve" ? "approved" : "rejected" } : c)
    )
    // After rejecting, refresh unclaimed clubs so the club reappears in Send Invites
    if (action === "reject") {
      const { data: clubs } = await supabase
        .from("clubs")
        .select("id, name, city, contact_email, claim_token, claim_token_used_at, invite_sent_at, instagram_handle, bad_contact")
        .is("claim_token_used_at", null)
        .order("name")
      setUnclaimedClubs((clubs as UnclaimedClub[]) ?? [])
    }
    setActing(null)
  }

  const searchLower = claimsSearch.toLowerCase()
  const matchesClaim = (c: Claim) => {
    if (!searchLower) return true
    return [
      c.clubs?.name, c.club_name, c.clubs?.city, c.city,
      c.contact_name, c.profiles?.display_name, c.contact_email,
    ].some((v) => v?.toLowerCase().includes(searchLower))
  }
  const filteredClaims = claims.filter((c) =>
    matchesClaim(c) && (claimsFilter === "all" || c.status === claimsFilter)
  )
  const pending = filteredClaims.filter((c) => c.status === "pending")
  const resolved = filteredClaims.filter((c) => c.status !== "pending")
  const invitedClubs = unclaimedClubs.filter((c) => c.invite_sent_at)
  const notInvitedClubs = unclaimedClubs.filter((c) => !c.invite_sent_at && !c.bad_contact)
  const inviteSearchLower = inviteSearch.toLowerCase()
  const filteredInvitedClubs = inviteSearch
    ? invitedClubs.filter((c) => c.name.toLowerCase().includes(inviteSearchLower) || (c.city ?? "").toLowerCase().includes(inviteSearchLower))
    : invitedClubs
  const filteredNotInvitedClubs = inviteSearch
    ? notInvitedClubs.filter((c) => c.name.toLowerCase().includes(inviteSearchLower) || (c.city ?? "").toLowerCase().includes(inviteSearchLower))
    : notInvitedClubs

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <div className="mb-6">
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-black text-white">Club Management</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setTab("claims")}
            className={`px-4 py-2 rounded-full text-sm font-bold transition ${tab === "claims" ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] border border-[#2e3d1a] text-white/50 hover:text-white"}`}
          >
            Claims {pending.length > 0 && <span className="ml-1 text-xs">({pending.length})</span>}
          </button>
          <button
            onClick={() => setTab("invite")}
            className={`px-4 py-2 rounded-full text-sm font-bold transition ${tab === "invite" ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] border border-[#2e3d1a] text-white/50 hover:text-white"}`}
          >
            Send Invites {notInvitedClubs.length > 0 && <span className="ml-1 text-xs">({notInvitedClubs.length})</span>}
          </button>
          <button
            onClick={() => setTab("sent")}
            className={`px-4 py-2 rounded-full text-sm font-bold transition ${tab === "sent" ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] border border-[#2e3d1a] text-white/50 hover:text-white"}`}
          >
            Invites Sent {invitedClubs.length > 0 && <span className="ml-1 text-xs">({invitedClubs.length})</span>}
          </button>
          <button
            onClick={() => setTab("funnel")}
            className={`px-4 py-2 rounded-full text-sm font-bold transition ${tab === "funnel" ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] border border-[#2e3d1a] text-white/50 hover:text-white"}`}
          >
            Funnel
          </button>
          <button
            onClick={() => { setTab("clubs"); if (!editableClubsLoaded) loadEditableClubs() }}
            className={`px-4 py-2 rounded-full text-sm font-bold transition ${tab === "clubs" ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] border border-[#2e3d1a] text-white/50 hover:text-white"}`}
          >
            Clubs
          </button>
          <button
            onClick={() => { setTab("reminders"); if (!reminderClubsLoaded) loadReminderClubs() }}
            className={`px-4 py-2 rounded-full text-sm font-bold transition ${tab === "reminders" ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] border border-[#2e3d1a] text-white/50 hover:text-white"}`}
          >
            Reminders
          </button>
        </div>

        {/* ── CLAIMS TAB ── */}
        {tab === "claims" && (
          <>
            {/* Search + filter */}
            <div className="space-y-3 mb-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by club, city, name or email…"
                  value={claimsSearch}
                  onChange={(e) => setClaimsSearch(e.target.value)}
                  className="w-full bg-[#1e2d12] border border-[#2e3d1a] rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {(["all", "pending", "approved", "rejected"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setClaimsFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-bold capitalize transition ${
                      claimsFilter === f
                        ? "bg-[#c5f135] text-[#1a2110]"
                        : "bg-[#1e2d12] border border-[#2e3d1a] text-white/40 hover:text-white"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {pending.length === 0 && claimsFilter !== "pending" && !claimsSearch && (
              <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center mb-8">
                <Clock className="w-8 h-8 text-white/15 mx-auto mb-2" />
                <p className="text-white/40 text-sm">No pending claims.</p>
              </div>
            )}
            {filteredClaims.length === 0 && (claimsSearch || claimsFilter !== "all") && (
              <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center mb-8">
                <p className="text-white/40 text-sm">No claims match your search.</p>
              </div>
            )}

            {pending.length > 0 && (
              <div className="space-y-3 mb-10">
                {pending.map((claim) => (
                  <ClaimCard key={claim.id} claim={claim} acting={acting} onAct={act} onDelete={openDelete} />
                ))}
              </div>
            )}

            {resolved.length > 0 && (
              <>
                <h2 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3">Resolved</h2>
                <div className="space-y-3">
                  {resolved.map((claim) => (
                    <ClaimCard key={claim.id} claim={claim} acting={acting} onAct={act} resolved onDelete={openDelete} />
                  ))}
                </div>
              </>
            )}

            {ownedClubs.length > 0 && (claimsFilter === "all" || claimsFilter === "approved") && (
              <>
                <h2 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3 mt-10">Owned (no claim record)</h2>
                <div className="space-y-2">
                  {ownedClubs.map((club) => (
                    <div key={club.id} className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] px-5 py-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{club.name}</p>
                        {club.city && <p className="text-xs text-white/40">{club.city}</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#c5f135]">Owned</span>
                        <a
                          href={`/clubs/${club.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-white/30 hover:text-white/70 transition"
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          onClick={() => openDelete({ id: club.id, name: club.name })}
                          className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/10 transition"
                          title="Delete club"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── INVITES SENT TAB ── */}
        {tab === "sent" && (
          <>
            <div className="relative mb-5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by club or city…"
                value={inviteSearch}
                onChange={(e) => setInviteSearch(e.target.value)}
                className="w-full bg-[#1e2d12] border border-[#2e3d1a] rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
              />
            </div>
            {filteredInvitedClubs.length === 0 && (
              <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
                <p className="text-white/40 text-sm">{inviteSearch ? "No clubs match your search." : "No invites sent yet."}</p>
              </div>
            )}
            {filteredInvitedClubs.length > 0 && (
              <div className="space-y-3">
                {filteredInvitedClubs.map((club) => {
                  const isSending = sending === club.id
                  const isCancelling = cancelling === club.id
                  const justSent = sent.has(club.id)
                  const igHandle = (inviteInstagrams[club.id] ?? club.instagram_handle ?? "").replace(/^@/, "").trim()
                  return (
                    <div key={club.id} className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-white">{club.name}</p>
                          {club.city && <p className="text-xs text-white/40">{club.city}</p>}
                        </div>
                        <div className="flex items-start gap-2 shrink-0">
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-[#c5f135]/50 uppercase tracking-wider">Invite sent</p>
                            <p className="text-xs text-white/30 mt-0.5">
                              {new Date(club.invite_sent_at!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                          <button
                            onClick={() => openDelete({ id: club.id, name: club.name })}
                            className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/10 transition"
                            title="Delete club"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {club.contact_email && (
                        <p className="text-xs text-white/40">Sent to: <span className="text-white/60">{club.contact_email}</span></p>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="email"
                          placeholder="Send to a different address…"
                          value={inviteEmails[club.id] ?? ""}
                          onChange={(e) => setInviteEmails((prev) => ({ ...prev, [club.id]: e.target.value }))}
                          className="flex-1 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                        />
                        <button
                          onClick={() => sendInvite(club.id, true)}
                          disabled={isSending || isCancelling}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition disabled:opacity-40 shrink-0 bg-[#1a2110] border border-[#2e3d1a] text-white/60 hover:text-white hover:border-[#c5f135]/40"
                        >
                          {justSent ? <><Check className="w-3.5 h-3.5 text-[#c5f135]" /> Sent</> : isSending ? "…" : <><RotateCcw className="w-3.5 h-3.5" /> Resend</>}
                        </button>
                        <button
                          onClick={() => cancelInvite(club.id)}
                          disabled={isSending || isCancelling}
                          title="Cancel invite — invalidates the link"
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition disabled:opacity-40 shrink-0 bg-[#1a2110] border border-[#2e3d1a] text-white/30 hover:text-red-400 hover:border-red-400/30"
                        >
                          {isCancelling ? "…" : <Ban className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm pointer-events-none">@</span>
                          <input
                            type="text"
                            placeholder="instagram_handle"
                            value={inviteInstagrams[club.id] ?? club.instagram_handle ?? ""}
                            onChange={(e) => setInviteInstagrams((prev) => ({ ...prev, [club.id]: e.target.value.replace(/^@/, "") }))}
                            className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl pl-7 pr-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                          />
                        </div>
                        <button
                          disabled={!igHandle}
                          onClick={() => handleIgClick(club, igHandle)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition disabled:opacity-30 shrink-0 bg-[#1a2110] border border-[#2e3d1a] text-white/60 hover:text-white hover:border-[#c5f135]/40"
                        >
                          {copiedIg === club.id ? <><Check className="w-3.5 h-3.5 text-[#c5f135]" /> Copied!</> : <><ExternalLink className="w-3.5 h-3.5" /> Instagram</>}
                        </button>
                      </div>
                      <button
                        onClick={() => markBadContact(club.id)}
                        disabled={markingBadContact === club.id}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition disabled:opacity-40 border border-red-500/20 text-red-400/50 hover:text-red-400 hover:border-red-400/40"
                      >
                        {markingBadContact === club.id ? "…" : <><AlertTriangle className="w-3.5 h-3.5" /> Mark contact info as incorrect</>}
                      </button>
                      {inviteErrors[club.id] && (
                        <p className="text-red-400 text-xs px-1">{inviteErrors[club.id]}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── SEND INVITES TAB ── */}
        {tab === "invite" && (
          <>
            <div className="relative mb-5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by club or city…"
                value={inviteSearch}
                onChange={(e) => setInviteSearch(e.target.value)}
                className="w-full bg-[#1e2d12] border border-[#2e3d1a] rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
              />
            </div>
            {filteredNotInvitedClubs.length === 0 && (
              <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
                <p className="text-white/40 text-sm">{inviteSearch ? "No clubs match your search." : "All unclaimed clubs have been contacted."}</p>
              </div>
            )}
            {filteredNotInvitedClubs.length > 0 && (
              <div className="space-y-3">
                {filteredNotInvitedClubs.map((club) => {
                  const isSent = sent.has(club.id)
                  const isSending = sending === club.id
                  const email = inviteEmails[club.id] ?? club.contact_email ?? ""
                  const igHandle = (inviteInstagrams[club.id] ?? club.instagram_handle ?? "").replace(/^@/, "").trim()
                  return (
                    <div key={club.id} className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-white">{club.name}</p>
                          {club.city && <p className="text-xs text-white/40">{club.city}</p>}
                        </div>
                        <button
                          onClick={() => openDelete({ id: club.id, name: club.name })}
                          className="shrink-0 p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/10 transition"
                          title="Delete club"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="director@theirclub.com, another@email.com"
                          value={inviteEmails[club.id] ?? (club.contact_email || "")}
                          onChange={(e) => setInviteEmails((prev) => ({ ...prev, [club.id]: e.target.value }))}
                          disabled={isSent}
                          className="flex-1 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition disabled:opacity-40"
                        />
                        <button
                          onClick={() => sendInvite(club.id)}
                          disabled={isSent || isSending || !email}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition disabled:opacity-40 shrink-0 bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45]"
                        >
                          {isSent ? <><Check className="w-3.5 h-3.5" /> Sent</> : isSending ? "…" : <><Send className="w-3.5 h-3.5" /> Send</>}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm pointer-events-none">@</span>
                          <input
                            type="text"
                            placeholder="instagram_handle"
                            value={inviteInstagrams[club.id] ?? club.instagram_handle ?? ""}
                            onChange={(e) => setInviteInstagrams((prev) => ({ ...prev, [club.id]: e.target.value.replace(/^@/, "") }))}
                            className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl pl-7 pr-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                          />
                        </div>
                        <button
                          disabled={!igHandle}
                          onClick={() => handleIgClick(club, igHandle)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition disabled:opacity-30 shrink-0 bg-[#1a2110] border border-[#2e3d1a] text-white/60 hover:text-white hover:border-[#c5f135]/40"
                        >
                          {copiedIg === club.id ? <><Check className="w-3.5 h-3.5 text-[#c5f135]" /> Copied!</> : <><ExternalLink className="w-3.5 h-3.5" /> Instagram</>}
                        </button>
                      </div>
                      <button
                        onClick={() => markIgSent(club.id)}
                        disabled={markingSent === club.id}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition disabled:opacity-40 border border-[#2e3d1a] text-white/40 hover:text-[#c5f135] hover:border-[#c5f135]/40"
                      >
                        {markingSent === club.id ? "…" : <><Check className="w-3.5 h-3.5" /> Mark as DM sent</>}
                      </button>
                      <button
                        onClick={() => markBadContact(club.id)}
                        disabled={markingBadContact === club.id}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition disabled:opacity-40 border border-red-500/20 text-red-400/50 hover:text-red-400 hover:border-red-400/40"
                      >
                        {markingBadContact === club.id ? "…" : <><AlertTriangle className="w-3.5 h-3.5" /> Mark contact info as incorrect</>}
                      </button>
                      {inviteErrors[club.id] && (
                        <p className="text-red-400 text-xs px-1">{inviteErrors[club.id]}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
        {/* ── FUNNEL TAB ── */}
        {tab === "funnel" && (() => {
          const total = funnelClubs.length
          const clicked = funnelClubs.filter(c => c.invite_link_clicked_at).length
          const submitted = funnelClubs.filter(c => c.claim_token_used_at).length
          const activated = funnelClubs.filter(c => c.user_id).length
          const pct = (n: number, d: number) => d === 0 ? "—" : `${Math.round((n / d) * 100)}%`

          const stages = [
            { label: "Invited",         count: total,     from: null,      color: "bg-white/10" },
            { label: "Link Opened",     count: clicked,   from: total,     color: "bg-[#c5f135]/20" },
            { label: "Form Submitted",  count: submitted, from: clicked,   color: "bg-[#c5f135]/40" },
            { label: "Account Created", count: activated, from: submitted, color: "bg-[#c5f135]" },
          ]

          return (
            <div className="space-y-6">
              {/* Stage summary */}
              <div className="grid grid-cols-2 gap-3">
                {stages.map((s) => (
                  <div key={s.label} className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4">
                    <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1">{s.label}</p>
                    <p className="text-3xl font-black text-white">{s.count}</p>
                    {s.from !== null && (
                      <p className="text-xs text-[#c5f135]/70 mt-0.5 font-semibold">
                        {pct(s.count, s.from)} of previous
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              {total > 0 && (
                <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-2">
                  <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Conversion</p>
                  {stages.slice(1).map((s) => (
                    <div key={s.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white/50">{s.label}</span>
                        <span className="text-white/70 font-bold">{pct(s.count, total)} of invited</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#c5f135] rounded-full transition-all"
                          style={{ width: total > 0 ? `${(s.count / total) * 100}%` : "0%" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Per-club breakdown */}
              {total === 0 ? (
                <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
                  <p className="text-white/40 text-sm">No invites sent yet.</p>
                </div>
              ) : (
                <div>
                  <h2 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3">Per Club</h2>
                  <div className="space-y-2">
                    {funnelClubs.map((club) => {
                      const stage =
                        club.user_id             ? { label: "Account Created", color: "text-[#c5f135]" } :
                        club.claim_token_used_at ? { label: "Form Submitted",  color: "text-[#c5f135]/60" } :
                        club.invite_link_clicked_at ? { label: "Link Opened",  color: "text-white/50" } :
                        { label: "Invited", color: "text-white/25" }

                      const wasIg    = !!club.ig_invite_sent_at
                      const wasEmail = !!club.invite_sent_at && club.invite_sent_at !== club.ig_invite_sent_at
                      const channel  = wasIg && wasEmail ? "Email + IG" : wasIg ? "Instagram" : "Email"
                      const channelColor = wasIg && wasEmail ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                         : wasIg            ? "bg-pink-500/20 text-pink-300 border-pink-500/30"
                                         :                    "bg-blue-500/20 text-blue-300 border-blue-500/30"

                      return (
                        <div key={club.id} className="bg-[#1e2d12] rounded-xl border border-[#2e3d1a] px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{club.name}</p>
                            {club.city && <p className="text-xs text-white/30 truncate">{club.city}</p>}
                            <span className={`inline-block mt-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${channelColor}`}>
                              {channel}
                            </span>
                          </div>
                          <span className={`text-xs font-black uppercase tracking-wider shrink-0 ${stage.color}`}>
                            {stage.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── CLUBS TAB ── */}
        {tab === "clubs" && (
          <>
            <div className="relative mb-5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by club or city…"
                value={editSearch}
                onChange={(e) => setEditSearch(e.target.value)}
                className="w-full bg-[#1e2d12] border border-[#2e3d1a] rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
              />
            </div>
            {!editableClubsLoaded ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {editableClubs
                  .filter((c) => {
                    if (!editSearch) return true
                    const s = editSearch.toLowerCase()
                    return c.name.toLowerCase().includes(s) || (c.city ?? "").toLowerCase().includes(s)
                  })
                  .map((club) => {
                    const isExpanded = expandedClub === club.id
                    const isSaving = savingClub === club.id
                    const openEdit = () => {
                      setExpandedClub(isExpanded ? null : club.id)
                      setEditState({ ...club })
                      setSaveErrors((prev) => { const n = { ...prev }; delete n[club.id]; return n })
                    }
                    const field = (key: keyof EditableClub, label: string, type: "text" | "textarea" | "number" | "toggle" = "text") => {
                      const val = editState[key]
                      if (type === "toggle") {
                        return (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-xs text-white/50 font-semibold">{label}</span>
                            <button
                              onClick={() => setEditState((p) => ({ ...p, [key]: !p[key] }))}
                              className={`relative w-10 h-5 rounded-full transition ${val ? "bg-[#c5f135]" : "bg-white/10"}`}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${val ? "left-5" : "left-0.5"}`} />
                            </button>
                          </div>
                        )
                      }
                      if (type === "textarea") {
                        return (
                          <div key={key}>
                            <label className="text-xs text-white/50 font-semibold block mb-1">{label}</label>
                            <textarea
                              rows={3}
                              value={(val as string) ?? ""}
                              onChange={(e) => setEditState((p) => ({ ...p, [key]: e.target.value || null }))}
                              className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition resize-none"
                            />
                          </div>
                        )
                      }
                      return (
                        <div key={key}>
                          <label className="text-xs text-white/50 font-semibold block mb-1">{label}</label>
                          <input
                            type={type}
                            value={(val as string | number) ?? ""}
                            onChange={(e) => setEditState((p) => ({ ...p, [key]: type === "number" ? (e.target.value ? parseFloat(e.target.value) : null) : (e.target.value || null) }))}
                            className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                          />
                        </div>
                      )
                    }
                    return (
                      <div key={club.id} className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] overflow-hidden">
                        <button
                          onClick={openEdit}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.02] transition"
                        >
                          <div className="text-left min-w-0">
                            <p className="text-sm font-bold text-white truncate">{club.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {club.city && <span className="text-xs text-white/30">{club.city}</span>}
                              {club.instagram_handle && <span className="text-xs text-white/20">@{club.instagram_handle}</span>}
                              <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${club.is_public ? "bg-[#c5f135]/10 text-[#c5f135]/70 border-[#c5f135]/20" : "bg-white/5 text-white/25 border-white/10"}`}>
                                {club.is_public ? "Public" : "Hidden"}
                              </span>
                              {club.bad_contact && (
                                <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border bg-red-500/10 text-red-400/70 border-red-500/20">
                                  Bad Contact
                                </span>
                              )}
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />}
                        </button>
                        {isExpanded && (
                          <div className="border-t border-[#2e3d1a] px-4 py-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              {field("name", "Name")}
                              {field("city", "City")}
                            </div>
                            {field("description", "Description", "textarea")}
                            <div className="grid grid-cols-2 gap-3">
                              {field("instagram_handle", "Instagram")}
                              {field("contact_email", "Contact Email")}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {field("website", "Website")}
                              {field("location", "Location (venue)")}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {field("meeting_day", "Meeting Day")}
                              {field("meeting_time", "Meeting Time")}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {field("latitude", "Latitude", "number")}
                              {field("longitude", "Longitude", "number")}
                            </div>
                            {field("is_public", "Public", "toggle")}
                            {saveErrors[club.id] && (
                              <p className="text-red-400 text-xs">{saveErrors[club.id]}</p>
                            )}
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => { setExpandedClub(null); setEditState({}) }}
                                className="flex-1 py-2 rounded-xl text-xs font-bold border border-[#2e3d1a] text-white/40 hover:text-white transition"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveClub(club.id)}
                                disabled={isSaving}
                                className="flex-1 py-2 rounded-xl text-xs font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] disabled:opacity-40 transition"
                              >
                                {isSaving ? "Saving…" : "Save"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </>
        )}

        {/* ── REMINDERS TAB ── */}
        {tab === "reminders" && (
          <>
            <div className="relative mb-5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by club or city…"
                value={reminderSearch}
                onChange={(e) => setReminderSearch(e.target.value)}
                className="w-full bg-[#1e2d12] border border-[#2e3d1a] rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
              />
            </div>
            {!reminderClubsLoaded ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
              </div>
            ) : (() => {
              const searchLow = reminderSearch.toLowerCase()
              const filtered = reminderClubs.filter((c) =>
                !reminderSearch || c.name.toLowerCase().includes(searchLow) || (c.city ?? "").toLowerCase().includes(searchLow)
              )
              const warm = filtered.filter((c) => c.invite_link_clicked_at)
              const cold = filtered.filter((c) => !c.invite_link_clicked_at)

              const ReminderCard = ({ club }: { club: ReminderClub }) => {
                const isSending = sendingReminder === club.id
                const wasSent = reminderSent.has(club.id)
                const noEmail = !club.contact_email
                const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                return (
                  <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{club.name}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {club.city && <span className="text-xs text-white/30">{club.city}</span>}
                        {club.contact_email
                          ? <span className="text-xs text-white/20 truncate">{club.contact_email}</span>
                          : <span className="text-[10px] font-bold text-red-400/60 uppercase tracking-wider">No email</span>
                        }
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-white/20">Invited {fmtDate(club.invite_sent_at)}</span>
                        {club.reminder_sent_at && (
                          <span className="text-[10px] text-[#c5f135]/40">Reminded {fmtDate(club.reminder_sent_at)}</span>
                        )}
                      </div>
                      {reminderErrors[club.id] && (
                        <p className="text-red-400 text-xs mt-1">{reminderErrors[club.id]}</p>
                      )}
                    </div>
                    <button
                      onClick={() => sendReminder(club.id)}
                      disabled={isSending || wasSent || noEmail}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition disabled:opacity-40 bg-[#1a2110] border border-[#2e3d1a] text-white/50 hover:text-[#c5f135] hover:border-[#c5f135]/40"
                    >
                      {wasSent ? <><Check className="w-3.5 h-3.5 text-[#c5f135]" /> Sent</> : isSending ? "…" : <><Send className="w-3.5 h-3.5" /> Remind</>}
                    </button>
                  </div>
                )
              }

              if (filtered.length === 0) return (
                <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
                  <p className="text-white/40 text-sm">{reminderSearch ? "No clubs match your search." : "No outstanding signups to follow up on."}</p>
                </div>
              )

              return (
                <div className="space-y-6">
                  {warm.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h2 className="text-xs font-bold text-white/30 uppercase tracking-widest">Opened but didn't submit</h2>
                        <span className="text-xs font-black text-[#c5f135]/60">{warm.length}</span>
                      </div>
                      <p className="text-xs text-white/25 mb-3 -mt-1">These clubs visited their claim page but didn't complete signup — warm leads.</p>
                      <div className="space-y-2">
                        {warm.map((club) => <ReminderCard key={club.id} club={club} />)}
                      </div>
                    </div>
                  )}
                  {cold.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h2 className="text-xs font-bold text-white/30 uppercase tracking-widest">Invited, haven't opened</h2>
                        <span className="text-xs font-black text-white/20">{cold.length}</span>
                      </div>
                      <p className="text-xs text-white/25 mb-3 -mt-1">These clubs received an invite but haven't clicked the link yet.</p>
                      <div className="space-y-2">
                        {cold.map((club) => <ReminderCard key={club.id} club={club} />)}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </>
        )}

      </div>

    {/* Delete confirmation modal */}
    {deleteTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeDelete} />
        <div className="relative bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-6 w-full max-w-sm space-y-4">
          <div>
            <p className="text-xs font-bold text-red-400/70 uppercase tracking-widest mb-1">Delete Club</p>
            <p className="text-lg font-black text-white">{deleteTarget.name}</p>
            <p className="text-xs text-white/40 mt-1">This permanently deletes the club and all its runs. This cannot be undone.</p>
          </div>
          <div>
            <label className="text-xs text-white/50 font-semibold mb-1.5 block">Enter your password to confirm</label>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDelete()}
              placeholder="Your password"
              autoFocus
              className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-red-400/50 transition"
            />
            {deleteError && <p className="text-red-400 text-xs mt-2">{deleteError}</p>}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={closeDelete}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-[#2e3d1a] text-white/50 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting || !deletePassword}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-black bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-40 transition"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  )
}

function ClaimCard({
  claim,
  acting,
  onAct,
  resolved = false,
  onDelete,
}: {
  claim: Claim
  acting: string | null
  onAct: (id: string, action: "approve" | "reject") => void
  resolved?: boolean
  onDelete?: (club: { id: string; name: string }) => void
}) {
  const isActing = acting === claim.id
  const statusColor =
    claim.status === "approved" ? "text-[#c5f135]" :
    claim.status === "rejected" ? "text-red-400/70" :
    "text-white/40"

  return (
    <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-white">
              {claim.clubs?.name ?? claim.club_name ?? claim.club_id ?? "—"}
            </p>
            {!claim.club_id && (
              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#c5f135]/10 text-[#c5f135]/70 border border-[#c5f135]/20">
                Public form
              </span>
            )}
          </div>
          {(claim.clubs?.city ?? claim.city) && (
            <p className="text-xs text-white/40">{claim.clubs?.city ?? claim.city}</p>
          )}
        </div>
        <span className={`text-[10px] font-black uppercase tracking-wider shrink-0 ${statusColor}`}>
          {claim.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-white/30 font-semibold mb-0.5">
            {claim.contact_name ? "Contact" : "Claimant"}
          </p>
          <p className="text-white/70">
            {claim.contact_name ?? claim.profiles?.display_name ?? "—"}
          </p>
        </div>

        {claim.contact_email && (
          <div>
            <p className="text-white/30 font-semibold mb-0.5">Email</p>
            <a
              href={`mailto:${claim.contact_email}`}
              className="text-[#c5f135]/80 hover:underline truncate block"
            >
              {claim.contact_email}
            </a>
          </div>
        )}

        <div>
          <p className="text-white/30 font-semibold mb-0.5">Instagram</p>
          {claim.instagram ? (
            <a
              href={`https://instagram.com/${claim.instagram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#c5f135] flex items-center gap-1 hover:underline"
            >
              @{claim.instagram} <ExternalLink className="w-3 h-3" />
            </a>
          ) : <p className="text-white/30">—</p>}
        </div>

        {claim.clubs?.instagram_handle && (
          <div>
            <p className="text-white/30 font-semibold mb-0.5">Club Instagram</p>
            <a
              href={`https://instagram.com/${claim.clubs.instagram_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 flex items-center gap-1 hover:underline"
            >
              @{claim.clubs.instagram_handle} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {claim.website && (
          <div>
            <p className="text-white/30 font-semibold mb-0.5">Website</p>
            <a
              href={claim.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 flex items-center gap-1 hover:underline truncate"
            >
              {claim.website.replace(/^https?:\/\//, "")} <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        )}

        {claim.referral_source && (
          <div>
            <p className="text-white/30 font-semibold mb-0.5">How they heard</p>
            <p className="text-white/50">{claim.referral_source}</p>
          </div>
        )}

        <div>
          <p className="text-white/30 font-semibold mb-0.5">Submitted</p>
          <p className="text-white/50">
            {new Date(claim.claimed_at ?? claim.created_at).toLocaleDateString("en-US", {
              month: "short", day: "numeric", year: "numeric",
            })}
          </p>
        </div>
      </div>

      {claim.message && (
        <div className="bg-[#1a2110] rounded-xl px-3 py-2.5">
          <p className="text-xs text-white/50 leading-relaxed">{claim.message}</p>
        </div>
      )}

      {(!resolved || (claim.club_id && onDelete)) && (
        <div className="flex gap-2 pt-1 flex-wrap">
          {!resolved && (
            <>
              <button
                onClick={() => onAct(claim.id, "approve")}
                disabled={isActing}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#c5f135] text-[#1a2110] rounded-full text-xs font-black disabled:opacity-40 hover:bg-[#d4ff45] transition"
              >
                <Check className="w-3.5 h-3.5" />
                {isActing ? "…" : "Approve"}
              </button>
              <button
                onClick={() => onAct(claim.id, "reject")}
                disabled={isActing}
                className="flex items-center gap-1.5 px-4 py-2 border border-[#2e3d1a] text-white/50 rounded-full text-xs font-semibold disabled:opacity-40 hover:text-red-400 hover:border-red-400/30 transition"
              >
                <X className="w-3.5 h-3.5" />
                Reject
              </button>
              {claim.club_id && (
                <a
                  href={`/clubs/${claim.club_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 border border-[#2e3d1a] text-white/30 rounded-full text-xs font-semibold hover:text-white/60 transition ml-auto"
                >
                  View club <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {claim.club_id && onDelete && (
                <button
                  onClick={() => onDelete({ id: claim.club_id!, name: claim.clubs?.name ?? claim.club_name ?? "this club" })}
                  className="p-2 rounded-full border border-[#2e3d1a] text-white/20 hover:text-red-400 hover:border-red-400/30 transition"
                  title="Delete club"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
          {resolved && claim.club_id && onDelete && (
            <>
              <a
                href={`/clubs/${claim.club_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 border border-[#2e3d1a] text-white/30 rounded-full text-xs font-semibold hover:text-white/60 transition"
              >
                View club <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={() => onDelete({ id: claim.club_id!, name: claim.clubs?.name ?? claim.club_name ?? "this club" })}
                className="flex items-center gap-1.5 px-4 py-2 border border-red-400/20 text-red-400/50 rounded-full text-xs font-semibold hover:text-red-400 hover:border-red-400/40 transition ml-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
