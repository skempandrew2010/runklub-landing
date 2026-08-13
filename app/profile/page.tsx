"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { Club } from "@/types/club"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, Ruler, Activity, Pencil, Check, X, Trophy, Users, ShieldCheck, Zap, ExternalLink, ChevronRight, Home, ClipboardList } from "lucide-react"
import { isNativeApp } from "@/utils/platform"
import { PLANS, PLAN_ORDER } from "@/lib/plans"
import { getUserTierProgress, type TierProgress } from "@/lib/checkins"
import { TIER_ICONS } from "@/components/TierCard"
import { useViewMode } from "@/hooks/useViewMode"

type Profile = {
  id: string
  display_name: string | null
  username: string | null
  location: string | null
  avatar_url: string | null
  distance_unit: string
  role: string | null
  notifications_enabled: boolean
  home_club_id: string | null
}

const AVATAR_GRADIENTS = [
  ["#2d5a1b", "#c5f135"],
  ["#1b3d5a", "#38bdf8"],
  ["#5a3d1b", "#fb923c"],
  ["#3d1b5a", "#c084fc"],
  ["#1b5a3d", "#34d399"],
]

function getAvatarColors(name: string) {
  const hash = (name || "A").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [myClubs, setMyClubs] = useState<Club[]>([])
  const [subscribedClubs, setSubscribedClubs] = useState<Club[]>([])
  const [paidMemberships, setPaidMemberships] = useState<Club[]>([])
  const [passportTiers, setPassportTiers] = useState<{ tier: number; name: string; monthly_price_cents: number; yearly_price_cents: number; credits_per_month: number }[]>([])
  const [passportSub, setPassportSub] = useState<{ tier: number; billing_interval: string; current_period_end: string | null } | null>(null)
  const [passportInterval, setPassportInterval] = useState<"monthly" | "yearly">("monthly")
  const [passportCreditBalance, setPassportCreditBalance] = useState(0)
  const [coachClubs, setCoachClubs] = useState<Club[]>([])
  const [sessionCount, setSessionCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const [editUsername, setEditUsername] = useState("")
  const [editLocation, setEditLocation] = useState("")
  const [saving, setSaving] = useState(false)
  const [roleChanging, setRoleChanging] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  const isManager = profile?.role === "manager"
  const [isCoach, setIsCoach] = useState(false)
  const { viewMode, setViewMode } = useViewMode(isManager || isCoach)
  const [subscribingClubId, setSubscribingClubId] = useState<string | null>(null)
  const [managingMembershipId, setManagingMembershipId] = useState<string | null>(null)
  const [subscribingPassportTier, setSubscribingPassportTier] = useState<number | null>(null)
  const [openingPassportPortal, setOpeningPassportPortal] = useState(false)
  const [nativeApp, setNativeApp] = useState(false)
  const [tierProgress, setTierProgress] = useState<TierProgress | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setNativeApp(isNativeApp()) }, [])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/login")
        return
      }
      setUser(user)

      // Upsert profile (in case trigger didn't fire yet for existing users)
      const emailPrefix = user.email?.split("@")[0] || "runner"
      await supabase.from("profiles").upsert({
        id: user.id,
        display_name: emailPrefix,
        username: emailPrefix,
      }, { onConflict: "id", ignoreDuplicates: true })

      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single()
      setProfile(prof)
      setEditName(prof?.display_name || "")
      setEditUsername(prof?.username || "")
      setEditLocation(prof?.location || "")

      const { data: clubs } = await supabase.from("clubs").select("id, name, city, image_url, tier, tier_expires_at, stripe_subscription_status").eq("user_id", user.id)
      setMyClubs((clubs || []) as any)

      const { data: subs } = await supabase.from("subscriptions").select("member_type, clubs(*)").eq("user_id", user.id)
      const subRows = (subs || []) as any[]
      setSubscribedClubs(subRows.map((s) => s.clubs).filter(Boolean))
      setPaidMemberships(subRows.filter((s) => s.member_type === "paid" && s.clubs).map((s) => s.clubs))

      const { data: coachRows } = await supabase.from("coaches").select("id, club_id, clubs(*)").eq("user_id", user.id).eq("status", "active")
      setIsCoach((coachRows?.length ?? 0) > 0)
      setCoachClubs(((coachRows ?? []) as any[]).map((r) => r.clubs).filter(Boolean))

      const [{ data: passportTiersData }, { data: passportSubData }] = await Promise.all([
        supabase.from("passport_tiers").select("tier, name, monthly_price_cents, yearly_price_cents, credits_per_month").order("tier"),
        supabase.from("passport_subscriptions").select("tier, billing_interval, current_period_end").eq("user_id", user.id).eq("status", "active").maybeSingle(),
      ])
      setPassportTiers(passportTiersData ?? [])
      setPassportSub(passportSubData ?? null)
      if (passportSubData) {
        const { data: batches } = await supabase
          .from("passport_credit_batches")
          .select("credits_remaining, expires_at")
          .eq("user_id", user.id)
          .eq("status", "active")
          .gt("credits_remaining", 0)
        const now = new Date()
        const balance = (batches ?? [])
          .filter((b) => new Date(b.expires_at) > now)
          .reduce((sum, b) => sum + b.credits_remaining, 0)
        setPassportCreditBalance(balance)
      }

      // Count runs created by clubs the user coaches
      const clubIds = (clubs || []).map((c: any) => c.id)
      if (clubIds.length > 0) {
        const { count } = await supabase.from("runs").select("*", { count: "exact", head: true }).in("club_id", clubIds)
        setSessionCount(count || 0)
      }

      getUserTierProgress().then(setTierProgress)

      setLoading(false)
    }
    load()
  }, [router])

  const saveProfile = async () => {
    if (!user) return
    setSaving(true)
    await supabase.from("profiles").update({
      display_name: editName,
      username: editUsername,
      location: editLocation,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id)
    setProfile((p) => p ? { ...p, display_name: editName, username: editUsername, location: editLocation } : p)
    setSaving(false)
    setEditing(false)
  }

  const startCheckout = async (clubId: string) => {
    setSubscribingClubId(clubId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ clubId, tier: "starter", interval: "monthly" }),
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error ?? "Could not start checkout")
        setSubscribingClubId(null)
      }
    } catch {
      alert("Could not start checkout. Try again.")
      setSubscribingClubId(null)
    }
  }

  const openBillingPortal = async () => {
    setOpeningPortal(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }

      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ returnPath: "/profile" }),
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error ?? "Could not open billing portal")
        setOpeningPortal(false)
      }
    } catch {
      alert("Could not open billing portal. Try again.")
      setOpeningPortal(false)
    }
  }

  const manageMembership = async (clubId: string) => {
    setManagingMembershipId(clubId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }

      const res = await fetch(`/api/clubs/${clubId}/billing-portal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error ?? "Could not open billing portal")
        setManagingMembershipId(null)
      }
    } catch {
      alert("Could not open billing portal. Try again.")
      setManagingMembershipId(null)
    }
  }

  const subscribeToPassportTier = async (tier: number) => {
    setSubscribingPassportTier(tier)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }

      const res = await fetch("/api/passport/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ tier, interval: passportInterval }),
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error ?? "Could not start checkout")
        setSubscribingPassportTier(null)
      }
    } catch {
      alert("Could not start checkout. Try again.")
      setSubscribingPassportTier(null)
    }
  }

  const managePassportBilling = async () => {
    setOpeningPassportPortal(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }

      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ returnPath: "/profile" }),
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error ?? "Could not open billing portal")
        setOpeningPassportPortal(false)
      }
    } catch {
      alert("Could not open billing portal. Try again.")
      setOpeningPassportPortal(false)
    }
  }

  const changeDistanceUnit = async (unit: string) => {
    if (!user || profile?.distance_unit === unit) return
    setProfile((p) => p ? { ...p, distance_unit: unit } : p)
    await supabase.from("profiles").update({ distance_unit: unit, updated_at: new Date().toISOString() }).eq("id", user.id)
  }

  const toggleNotifications = async () => {
    if (!user) return
    const next = !(profile?.notifications_enabled ?? true)
    setProfile((p) => p ? { ...p, notifications_enabled: next } : p)
    await supabase.from("profiles").update({ notifications_enabled: next, updated_at: new Date().toISOString() }).eq("id", user.id)
  }

  const changeRole = async (newRole: string) => {
    if (!user || profile?.role === newRole) return
    setRoleChanging(true)
    await supabase.from("profiles").update({ role: newRole, updated_at: new Date().toISOString() }).eq("id", user.id)
    setProfile((p) => p ? { ...p, role: newRole } : p)
    setRoleChanging(false)
  }

  const setHomeClub = async (clubId: string) => {
    if (!user) return
    const next = profile?.home_club_id === clubId ? null : clubId
    setProfile((p) => p ? { ...p, home_club_id: next } : p)
    await supabase.from("profiles").update({ home_club_id: next, updated_at: new Date().toISOString() }).eq("id", user.id)
  }

  const uploadAvatar = async (file: File) => {
    if (!user) return
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB")
      return
    }
    const ext = file.name.split(".").pop()
    const path = `${user.id}/avatar.${ext}`
    const { error } = await supabase.storage.from("club-images").upload(path, file, { upsert: true })
    if (error) return
    const { data: { publicUrl } } = supabase.storage.from("club-images").getPublicUrl(path)
    await supabase.from("profiles").update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq("id", user.id)
    setProfile((p) => p ? { ...p, avatar_url: publicUrl } : p)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "Runner"
  const username = profile?.username || displayName.toLowerCase()
  const location = profile?.location
  const ownsKlub = myClubs.length > 0
  const isMember = subscribedClubs.length > 0
  const [bgColor, textColor] = getAvatarColors(displayName)
  const initial = displayName[0]?.toUpperCase() || "R"
  const allKlubs = Array.from(
    new Map([
      ...subscribedClubs.map((c) => ({ ...c, role: "MEMBER" as const })),
      ...myClubs.map((c) => ({ ...c, role: "DIRECTOR" as const })),
      ...coachClubs.map((c) => ({ ...c, role: "COACH" as const })),
    ].map((c) => [c.id, c])).values()
  )
  const totalKlubs = allKlubs.length

  return (
    <div className="min-h-screen bg-[#1a2110]">
      {/* Strava toast */}
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

        {/* HEADER CARD */}
        <div className="bg-[#1e2d12] rounded-2xl p-6">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="relative shrink-0">
              <button
                onClick={() => fileRef.current?.click()}
                className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black overflow-hidden hover:opacity-90 transition"
                style={{ background: `linear-gradient(135deg, ${bgColor}, #1a2110)` }}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span style={{ color: textColor }}>{initial}</span>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Display name"
                    className="w-full bg-[#2e3d1a] border border-[#3d5220] rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#c5f135]"
                  />
                  <input
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    placeholder="username"
                    className="w-full bg-[#2e3d1a] border border-[#3d5220] rounded-lg px-3 py-1.5 text-white/70 text-sm focus:outline-none focus:border-[#c5f135]"
                  />
                  <input
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="City, State"
                    className="w-full bg-[#2e3d1a] border border-[#3d5220] rounded-lg px-3 py-1.5 text-white/70 text-sm focus:outline-none focus:border-[#c5f135]"
                  />
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveProfile} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#c5f135] text-[#1a2110] rounded-full text-xs font-bold">
                      <Check className="w-3 h-3" />{saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditing(false)} className="flex items-center gap-1.5 px-3 py-1.5 border border-[#2e3d1a] text-white/60 rounded-full text-xs">
                      <X className="w-3 h-3" />Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-black text-white leading-tight">{displayName}</h1>
                    <button onClick={() => setEditing(true)} className="text-white/30 hover:text-[#c5f135] transition">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-sm text-white/50 mt-0.5">
                    @{username}{location && <span> · {location}</span>}
                  </p>
                  <div className="flex gap-2 mt-3">
                    {ownsKlub && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#c5f135]/10 text-[#c5f135] border border-[#c5f135]/30 flex items-center gap-1">
                        <Activity className="w-3 h-3" /> DIRECTOR
                      </span>
                    )}
                    {isCoach && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-400/10 text-amber-400 border border-amber-400/30 flex items-center gap-1">
                        <Activity className="w-3 h-3" /> COACH
                      </span>
                    )}
                    {isMember && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/5 text-white/70 border border-white/10">
                        MEMBER
                      </span>
                    )}
                    {!ownsKlub && !isCoach && !isMember && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/5 text-white/50 border border-white/10">
                        RUNNER
                      </span>
                    )}
                    {tierProgress?.current_tier_slug && (() => {
                      const TierIcon = TIER_ICONS[tierProgress.current_tier_slug!]
                      return (
                        <Link
                          href="/passport/tiers"
                          className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#c5f135]/10 text-[#c5f135] border border-[#c5f135]/30 flex items-center gap-1 hover:bg-[#c5f135]/20 transition"
                        >
                          {TierIcon && <TierIcon className="w-3 h-3" />} {tierProgress.current_tier}
                        </Link>
                      )
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* STATS */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { value: "–", label: "MILES '26" },
              { value: totalKlubs, label: "KLUBS" },
              { value: sessionCount, label: "SESSIONS" },
            ].map(({ value, label }) => (
              <div key={label} className="bg-[#1a2110] rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-white">{value}</div>
                <div className="text-[10px] font-bold text-white/40 tracking-widest mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* MY KLUBS */}
        <div>
          <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-2">My Klubs</h2>
          <div className="bg-[#1e2d12] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
            {allKlubs.length === 0 ? (
              <div className="px-4 py-5 text-sm text-white/40 text-center">
                No klubs yet —{" "}
                <Link href="/explore" className="text-[#c5f135] hover:underline">discover klubs</Link>
              </div>
            ) : (
              allKlubs.map((club) => {
                const [bg] = getAvatarColors(club.name)
                const abbr = club.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
                return (
                  <div key={club.id} className="flex items-center gap-3 px-4 py-3.5">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0"
                      style={{ background: `linear-gradient(135deg, ${bg}, #1a2110)` }}
                    >
                      {(club as any).image_url ? (
                        <img src={(club as any).image_url} alt="" className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        <span className="text-white/80">{abbr}</span>
                      )}
                    </div>
                    <span className="flex-1 text-sm font-semibold text-white truncate">{club.name}</span>
                    <button
                      onClick={() => setHomeClub(club.id)}
                      title={profile?.home_club_id === club.id ? "Home klub" : "Set as home klub"}
                      className={`shrink-0 p-1.5 rounded-lg transition ${
                        profile?.home_club_id === club.id
                          ? "text-[#c5f135] bg-[#c5f135]/10"
                          : "text-white/20 hover:text-white/50 hover:bg-white/5"
                      }`}
                    >
                      <Home className="w-3.5 h-3.5" />
                    </button>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0
                      ${club.role !== "MEMBER"
                        ? "bg-[#c5f135]/10 text-[#c5f135] border border-[#c5f135]/30"
                        : "bg-white/5 text-white/50 border border-white/10"
                      }`}>
                      {club.role}
                    </span>
                  </div>
                )
              })
            )}
            <div className="px-4 py-3">
              <Link href="/explore" className="text-xs text-[#c5f135] font-semibold hover:underline">
                + Discover more klubs
              </Link>
            </div>
          </div>
        </div>

        {/* ACCOUNT TYPE */}
        <div>
          <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-2">Account Type</h2>
          <div className="bg-[#1e2d12] rounded-2xl p-4">
            <p className="text-xs text-white/40 mb-3 leading-relaxed">
              {isManager || isCoach
                ? "Switch your view between the Director tab and browsing as a member — this doesn't change your account."
                : "Switch between running a klub or joining one. This changes your Director tab."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: "member", label: "Member", sub: "Join & discover klubs", Icon: Users },
                {
                  key: "director",
                  label: isManager ? "Director" : "Coach",
                  sub: isManager ? "Run & direct a klub" : isCoach ? "Coach a pace group you're invited to" : "Run & direct a klub",
                  Icon: isManager ? Trophy : ClipboardList,
                },
              ] as { key: "member" | "director"; label: string; sub: string; Icon: typeof Users }[]).map(({ key, label, sub, Icon }) => {
                const active = viewMode === key
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (key === "director" && !isManager && !isCoach) { changeRole("manager"); return }
                      setViewMode(key)
                    }}
                    disabled={roleChanging}
                    className={`rounded-xl p-3.5 text-left border transition-all disabled:opacity-60
                      ${active
                        ? "bg-[#c5f135]/10 border-[#c5f135] shadow-[0_0_0_1px_#c5f135]"
                        : "bg-[#1a2110] border-[#2e3d1a] hover:border-white/20"
                      }`}
                  >
                    <Icon className={`w-5 h-5 mb-2 ${active ? "text-[#c5f135]" : "text-white/30"}`} />
                    <p className={`text-sm font-bold ${active ? "text-white" : "text-white/50"}`}>{label}</p>
                    <p className={`text-xs mt-0.5 ${active ? "text-white/50" : "text-white/25"}`}>{sub}</p>
                    {active && <Check className="w-3.5 h-3.5 text-[#c5f135] mt-1.5" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* KLUB MEMBERSHIP — paid membership(s) as a runner, kept separate from the director plan below */}
        {paidMemberships.length > 0 && (
          <div>
            <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-2">Klub Membership</h2>
            <div className="bg-[#1e2d12] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
              {paidMemberships.map((club) => (
                <div key={club.id} className="flex items-center gap-3 px-4 py-3.5">
                  <Users className="w-4 h-4 text-[#c5f135] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{club.name}</p>
                    <p className="text-xs text-white/40">Paid member</p>
                  </div>
                  {!nativeApp && (
                    <button
                      onClick={() => manageMembership(club.id)}
                      disabled={managingMembershipId === club.id}
                      className="text-xs font-black px-3 py-1.5 rounded-full shrink-0 bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30 hover:bg-[#c5f135]/25 transition disabled:opacity-50"
                    >
                      {managingMembershipId === club.id ? "Opening…" : "Manage"}
                    </button>
                  )}
                </div>
              ))}
              {nativeApp && (
                <p className="px-4 py-3.5 text-xs text-white/40">
                  Manage billing & subscriptions at{" "}
                  <span className="text-[#c5f135] font-semibold">runklub.fit</span> on the web.
                </p>
              )}
            </div>
          </div>
        )}

        {/* MANAGE SUBSCRIPTIONS — shown for anyone who owns/manages a klub, even on Free */}
        {myClubs.length > 0 && (
          <div>
            <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-2">Subscriptions</h2>
            <div className="bg-[#1e2d12] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
              {myClubs.map((club) => {
                const tier = ((club as any).tier as string) || "free"
                const isFree = tier === "free"
                const isPremium = tier === "growth" || tier === "enterprise"
                return (
                  <div key={club.id} className="flex items-center gap-3 px-4 py-3.5">
                    {isPremium
                      ? <Zap className="w-4 h-4 text-[#c5f135] shrink-0" />
                      : <ShieldCheck className="w-4 h-4 text-white/30 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{club.name}</p>
                      <p className="text-xs text-white/40 capitalize">{tier} plan</p>
                    </div>
                    {isFree ? (
                      !nativeApp && (
                        <button
                          onClick={() => startCheckout(club.id)}
                          disabled={subscribingClubId === club.id}
                          className="text-xs font-black px-3 py-1.5 rounded-full shrink-0 bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition disabled:opacity-50"
                        >
                          {subscribingClubId === club.id ? "Redirecting…" : "Subscribe"}
                        </button>
                      )
                    ) : (
                      <span className={`text-xs font-black px-2.5 py-1 rounded-full shrink-0
                        ${isPremium
                          ? "bg-[#c5f135] text-[#1a2110]"
                          : "bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30"
                        }`}>
                        {tier.toUpperCase()}
                      </span>
                    )}
                  </div>
                )
              })}
              {nativeApp ? (
                <p className="px-4 py-3.5 text-xs text-white/40">
                  Manage billing & subscriptions at{" "}
                  <span className="text-[#c5f135] font-semibold">runklub.fit</span> on the web.
                </p>
              ) : (
                <button
                  onClick={openBillingPortal}
                  disabled={openingPortal}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#2e3d1a]/40 transition text-left disabled:opacity-50"
                >
                  <ExternalLink className="w-4 h-4 text-white/40 shrink-0" />
                  <span className="flex-1 text-sm font-medium text-white/70">
                    {openingPortal ? "Opening portal…" : "Manage billing & subscriptions"}
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/25 shrink-0" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* SUBSCRIPTION TIERS — director view only, so directors see what each klub plan unlocks */}
        {isManager && viewMode === "director" && (
          <div>
            <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-2">Subscription Tiers</h2>
            <div className="bg-[#1e2d12] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
              {PLAN_ORDER.map((id) => {
                const plan = PLANS[id]
                const isCurrent = myClubs.some((c) => ((c as any).tier || "free") === id)
                return (
                  <div key={id} className="px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{plan.name}</span>
                        {isCurrent && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110]">CURRENT</span>
                        )}
                      </div>
                      <span className="text-sm font-black text-[#c5f135] shrink-0">
                        {plan.price ? `$${plan.price.monthly}/mo` : "Free"}
                      </span>
                    </div>
                    {plan.tagline && <p className="text-xs text-white/40 mt-0.5">{plan.tagline}</p>}
                    <ul className="mt-2 space-y-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-1.5 text-xs text-white/60">
                          <Check className="w-3 h-3 text-[#c5f135] shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
            <p className="px-1 mt-2 text-xs text-white/30">
              Full comparison at <Link href="/pricing" className="text-[#c5f135] hover:underline">runklub.fit/pricing</Link>.
            </p>
          </div>
        )}

        {/* PASSPORT CREDITS — member view only. Real Stripe checkout/portal now
            that the credit program is functional, not just a preview. */}
        {viewMode === "member" && (
          <div>
            <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-2">Passport Credits</h2>
            <div className="bg-[#1e2d12] rounded-2xl overflow-hidden">
              {passportSub ? (
                <div className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        {passportTiers.find((t) => t.tier === passportSub.tier)?.name ?? `Tier ${passportSub.tier}`}
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30">
                        {passportSub.billing_interval === "yearly" ? "YEARLY" : "MONTHLY"}
                      </span>
                    </div>
                    <span className="text-sm font-black text-[#c5f135] shrink-0">{passportCreditBalance} credits</span>
                  </div>
                  <p className="text-xs text-white/40 mt-2 leading-relaxed">
                    Spend credits checking in at partner klubs beyond your home klub — unspent credits expire 45 days after they're issued.
                  </p>
                  {!nativeApp && (
                    <button
                      onClick={managePassportBilling}
                      disabled={openingPassportPortal}
                      className="mt-3 w-full text-xs font-black px-3 py-2 rounded-full bg-[#2e3d1a] text-[#c5f135] border border-[#3d5220] hover:bg-[#3d5220] transition disabled:opacity-50"
                    >
                      {openingPassportPortal ? "Opening…" : "Manage billing"}
                    </button>
                  )}
                </div>
              ) : (
                <div className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white">Passport Credits</span>
                    <div className="flex items-center gap-1.5 rounded-full bg-[#1a2110] p-0.5 border border-[#2e3d1a] shrink-0">
                      {(["monthly", "yearly"] as const).map((interval) => (
                        <button
                          key={interval}
                          onClick={() => setPassportInterval(interval)}
                          className={`relative px-2.5 py-1 rounded-full text-[10px] font-bold capitalize transition ${
                            passportInterval === interval ? "bg-[#c5f135] text-[#1a2110]" : "text-white/40"
                          }`}
                        >
                          {interval}
                          {interval === "yearly" && (
                            <span className={`absolute -top-2.5 -right-2 text-[8px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                              passportInterval === "yearly" ? "bg-white text-[#1a2110]" : "bg-[#c5f135] text-[#1a2110]"
                            }`}>
                              SAVE 10%
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 flex items-start gap-2 bg-[#c5f135]/10 border border-[#c5f135]/30 rounded-xl px-3 py-2.5">
                    <Zap className="w-3.5 h-3.5 text-[#c5f135] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#c5f135] leading-relaxed">
                      <span className="font-black">Pay yearly, save 10%</span> vs. paying monthly — and credits still land every month, not all at once.
                    </p>
                  </div>

                  {passportTiers.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {passportTiers.map((t) => {
                        const effectiveMonthlyCents = t.yearly_price_cents / 12
                        return (
                          <button
                            key={t.tier}
                            onClick={() => subscribeToPassportTier(t.tier)}
                            disabled={subscribingPassportTier === t.tier}
                            className="bg-[#1a2110] border border-[#2e3d1a] hover:border-[#c5f135]/40 rounded-xl px-3 py-2.5 text-center transition disabled:opacity-50"
                          >
                            {passportInterval === "yearly" ? (
                              <>
                                <p className="text-[10px] text-white/30 line-through">${(t.monthly_price_cents / 100).toFixed(2)}/mo</p>
                                <p className="text-xs font-black text-white">${(effectiveMonthlyCents / 100).toFixed(2)}/mo</p>
                                <p className="text-[9px] text-white/40">billed ${(t.yearly_price_cents / 100).toFixed(0)}/yr</p>
                              </>
                            ) : (
                              <p className="text-xs font-black text-white">${(t.monthly_price_cents / 100).toFixed(0)}/mo</p>
                            )}
                            <p className="text-[10px] text-white/40">{t.credits_per_month} credits/mo</p>
                            <p className="text-[10px] font-bold text-[#c5f135] mt-1">
                              {subscribingPassportTier === t.tier ? "Redirecting…" : "Subscribe"}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PREFERENCES */}
        <div>
          <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-2">Preferences</h2>
          <div className="bg-[#1e2d12] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">

            {/* Notifications toggle */}
            <div className="flex items-center px-4 py-4 gap-3">
              <Bell className={`w-5 h-5 shrink-0 ${profile?.notifications_enabled !== false ? "text-[#c5f135]" : "text-white/30"}`} />
              <span className="flex-1 text-sm font-medium text-white">Notifications</span>
              <button
                onClick={toggleNotifications}
                className={`relative w-11 h-6 rounded-full transition-colors duration-300 ease-out shrink-0
                  ${profile?.notifications_enabled !== false ? "bg-[#c5f135]" : "bg-[#2e3d1a] border border-[#3d5220]"}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                  ${profile?.notifications_enabled !== false ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>

            {/* Distance unit toggle */}
            <div className="flex items-center px-4 py-4 gap-3">
              <Ruler className="w-5 h-5 text-white/50 shrink-0" />
              <span className="flex-1 text-sm font-medium text-white">Distance Units</span>
              <div className="flex rounded-full bg-[#1a2110] p-0.5 border border-[#2e3d1a] shrink-0">
                {(["miles", "km"] as const).map((unit) => {
                  const active = (profile?.distance_unit || "miles") === unit
                  return (
                    <button
                      key={unit}
                      onClick={() => changeDistanceUnit(unit)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all capitalize
                        ${active ? "bg-[#c5f135] text-[#1a2110]" : "text-white/40 hover:text-white/70"}`}
                    >
                      {unit}
                    </button>
                  )
                })}
              </div>
            </div>

          </div>
        </div>

        {/* LEGAL */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-1">
          <Link href="/terms" className="text-xs text-white/25 hover:text-white/50 transition">Terms of Service</Link>
          <Link href="/privacy" className="text-xs text-white/25 hover:text-white/50 transition">Privacy Policy</Link>
          <Link href="/community" className="text-xs text-white/25 hover:text-white/50 transition">Community Guidelines</Link>
        </div>

        {/* SIGN OUT */}
        <div className="bg-[#1e2d12] rounded-2xl overflow-hidden">
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              router.push("/login")
            }}
            className="w-full px-4 py-4 text-sm font-semibold text-red-400 hover:bg-red-500/10 transition text-left"
          >
            Sign out
          </button>
        </div>

        <div className="h-8" />
      </div>
    </div>
  )
}
