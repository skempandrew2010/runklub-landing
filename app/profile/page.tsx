"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { Club } from "@/types/club"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, Ruler, Activity, Pencil, Check, X, Trophy, Users, ShieldCheck, Zap, ExternalLink, ChevronRight } from "lucide-react"

type Profile = {
  id: string
  display_name: string | null
  username: string | null
  location: string | null
  avatar_url: string | null
  distance_unit: string
  role: string | null
  notifications_enabled: boolean
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
  const [sessionCount, setSessionCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const [editUsername, setEditUsername] = useState("")
  const [editLocation, setEditLocation] = useState("")
  const [saving, setSaving] = useState(false)
  const [roleChanging, setRoleChanging] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

      const { data: subs } = await supabase.from("subscriptions").select("clubs(*)").eq("user_id", user.id)
      setSubscribedClubs((subs || []).map((s: any) => s.clubs).filter(Boolean))

      // Count runs created by clubs the user coaches
      const clubIds = (clubs || []).map((c: any) => c.id)
      if (clubIds.length > 0) {
        const { count } = await supabase.from("runs").select("*", { count: "exact", head: true }).in("club_id", clubIds)
        setSessionCount(count || 0)
      }

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
  const isCoach = myClubs.length > 0
  const isMember = subscribedClubs.length > 0
  const totalKlubs = myClubs.length + subscribedClubs.length
  const [bgColor, textColor] = getAvatarColors(displayName)
  const initial = displayName[0]?.toUpperCase() || "R"
  const allKlubs = Array.from(
    new Map([
      ...subscribedClubs.map((c) => ({ ...c, role: "MEMBER" as const })),
      ...myClubs.map((c) => ({ ...c, role: "COACH" as const })),
    ].map((c) => [c.id, c])).values()
  )

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
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black overflow-hidden hover:opacity-90 transition"
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
                    {isCoach && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#c5f135]/10 text-[#c5f135] border border-[#c5f135]/30 flex items-center gap-1">
                        <Activity className="w-3 h-3" /> COACH
                      </span>
                    )}
                    {isMember && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/5 text-white/70 border border-white/10">
                        MEMBER
                      </span>
                    )}
                    {!isCoach && !isMember && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/5 text-white/50 border border-white/10">
                        RUNNER
                      </span>
                    )}
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
                <Link href="/" className="text-[#c5f135] hover:underline">discover clubs</Link>
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
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0
                      ${club.role === "COACH"
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
              <Link href="/" className="text-xs text-[#c5f135] font-semibold hover:underline">
                + Discover more klubs
              </Link>
            </div>
          </div>
        </div>

        {/* MANAGE SUBSCRIPTIONS — only shown if user has at least one paid club */}
        {myClubs.some((c) => (c as any).tier && (c as any).tier !== "free") && (
          <div>
            <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-2">Subscriptions</h2>
            <div className="bg-[#1e2d12] rounded-2xl overflow-hidden divide-y divide-[#2e3d1a]">
              {myClubs
                .filter((c) => (c as any).tier && (c as any).tier !== "free")
                .map((club) => {
                  const tier = (club as any).tier as "verified" | "pro"
                  return (
                    <div key={club.id} className="flex items-center gap-3 px-4 py-3.5">
                      {tier === "pro"
                        ? <Zap className="w-4 h-4 text-[#c5f135] shrink-0" />
                        : <ShieldCheck className="w-4 h-4 text-[#c5f135] shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{club.name}</p>
                        <p className="text-xs text-white/40 capitalize">{tier} plan</p>
                      </div>
                      <span className={`text-xs font-black px-2.5 py-1 rounded-full shrink-0
                        ${tier === "pro"
                          ? "bg-[#c5f135] text-[#1a2110]"
                          : "bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30"
                        }`}>
                        {tier.toUpperCase()}
                      </span>
                    </div>
                  )
                })}
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
            </div>
          </div>
        )}

        {/* ACCOUNT TYPE */}
        <div>
          <h2 className="text-xs font-bold text-white/40 tracking-widest uppercase px-1 mb-2">Account Type</h2>
          <div className="bg-[#1e2d12] rounded-2xl p-4">
            <p className="text-xs text-white/40 mb-3 leading-relaxed">
              Switch between running a klub or joining one. This changes your Director tab.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "member", label: "Member", sub: "Join & discover klubs", Icon: Users },
                { key: "manager", label: "Manager", sub: "Run & direct a klub", Icon: Trophy },
              ].map(({ key, label, sub, Icon }) => {
                const active = (profile?.role ?? "member") === key
                return (
                  <button
                    key={key}
                    onClick={() => changeRole(key)}
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
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0
                  ${profile?.notifications_enabled !== false ? "bg-[#c5f135]" : "bg-[#2e3d1a] border border-[#3d5220]"}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
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
