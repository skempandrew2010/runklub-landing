"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Heart, MapPin, Clock, Users, ArrowLeft, Zap, ShieldCheck } from "lucide-react"
import { getTagStyle } from "@/utils/tagStyle"
import { localDateStr } from "@/utils/dates"

export type Club = {
  id: string
  name: string
  city: string | null
  location: string | null
  description: string | null
  instagram_handle: string | null
  image_url: string | null
  tier: string | null
  is_public: boolean
}

export type Run = {
  id: string
  title: string
  date: string
  time: string
  distance: string | null
  meeting_point: string | null
  tags: string[] | null
}

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

export default function ClubPageClient({
  club,
  runs,
  memberCount: initialMemberCount,
  isClaimed,
}: {
  club: Club
  runs: Run[]
  memberCount: number
  isClaimed: boolean
}) {
  const router = useRouter()
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [memberCount, setMemberCount] = useState(initialMemberCount)
  const [subscribing, setSubscribing] = useState(false)
  const [showClaimForm, setShowClaimForm] = useState(false)
  const [claimInstagram, setClaimInstagram] = useState("")
  const [claimMessage, setClaimMessage] = useState("")
  const [claimSubmitting, setClaimSubmitting] = useState(false)
  const [claimStatus, setClaimStatus] = useState<"idle" | "pending" | "submitted">("idle")

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      setUserId(user?.id ?? null)
      if (user) {
        const [{ data: sub }, { data: existingClaim }] = await Promise.all([
          supabase.from("subscriptions").select("id").eq("user_id", user.id).eq("club_id", club.id).maybeSingle(),
          supabase.from("club_claims").select("id, status").eq("user_id", user.id).eq("club_id", club.id).maybeSingle(),
        ])
        setIsSubscribed(!!sub)
        if (existingClaim) setClaimStatus("pending")
      }
    }
    load()
  }, [club.id])

  const handleFollow = async () => {
    if (!userId) { router.push("/login"); return }
    setSubscribing(true)
    if (isSubscribed) {
      await supabase.from("subscriptions").delete().eq("user_id", userId).eq("club_id", club.id)
      setIsSubscribed(false)
      setMemberCount((p) => Math.max(0, p - 1))
    } else {
      await supabase.from("subscriptions").upsert({ user_id: userId, club_id: club.id }, { onConflict: "user_id,club_id" })
      setIsSubscribed(true)
      setMemberCount((p) => p + 1)
    }
    setSubscribing(false)
  }

  const submitClaim = async () => {
    if (!userId) { router.push("/login"); return }
    setClaimSubmitting(true)
    const { error } = await supabase.from("club_claims").insert({
      club_id: club.id,
      user_id: userId,
      instagram: claimInstagram.trim().replace(/^@/, "") || null,
      message: claimMessage.trim() || null,
    })
    setClaimSubmitting(false)
    if (!error) {
      setClaimStatus("submitted")
      setShowClaimForm(false)
    }
  }

  const initials = club.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
  const gradient = getGradient(club.name)
  const todayStr = localDateStr()
  const upcomingRuns = runs.filter(r => r.date >= todayStr)

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">

      {/* ── HERO HEADER ── */}
      <div className={`relative bg-gradient-to-b ${gradient} border-b border-[#2e3d1a]`}>
        {club.image_url && (
          <div className="absolute inset-0 overflow-hidden">
            <img src={club.image_url} alt="" className="w-full h-full object-cover opacity-20" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#111a0a]/60 to-[#111a0a]" />
          </div>
        )}

        <div className="relative max-w-2xl mx-auto px-5 pt-5 pb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-white/50 hover:text-white transition text-sm font-medium mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex items-end gap-4">
            <div className={`w-20 h-20 rounded-2xl overflow-hidden shrink-0 bg-gradient-to-br ${gradient} flex items-center justify-center border border-white/10`}>
              {club.image_url
                ? <img src={club.image_url} alt={club.name} className="w-full h-full object-cover" />
                : <span className="text-2xl font-black text-white/30">{initials}</span>
              }
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-2xl font-black text-white leading-tight">{club.name}</h1>
                {club.tier === "pro" && (
                  <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110]">
                    <Zap className="w-2.5 h-2.5" /> PRO
                  </span>
                )}
                {club.tier === "verified" && (
                  <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30">
                    <ShieldCheck className="w-2.5 h-2.5" /> VERIFIED
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {club.city && (
                  <p className="text-sm text-white/50 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{club.city}
                  </p>
                )}
                <p className="text-sm text-white/50 flex items-center gap-1">
                  <Users className="w-3 h-3" />{memberCount} {memberCount === 1 ? "member" : "members"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">

        {/* ── FOLLOW + INSTAGRAM ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleFollow}
            disabled={subscribing}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-black transition disabled:opacity-50 ${
              isSubscribed
                ? "bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45]"
                : "bg-[#1e2d12] border border-[#2e3d1a] text-white hover:border-[#c5f135]/50 hover:text-[#c5f135]"
            }`}
          >
            <Heart className={`w-4 h-4 ${isSubscribed ? "fill-[#1a2110]" : ""}`} />
            {subscribing ? "…" : isSubscribed ? "Following" : userId ? "Follow Club" : "Join Club"}
          </button>

          {club.instagram_handle && (
            <a
              href={`https://instagram.com/${club.instagram_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#1e2d12] border border-[#2e3d1a] text-white/60 hover:text-white hover:border-white/30 transition text-sm font-semibold"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
              </svg>
              @{club.instagram_handle}
            </a>
          )}

          {!userId && (
            <p className="text-xs text-white/30 leading-relaxed w-full">
              Sign in to follow this club and get run updates.
            </p>
          )}
        </div>

        {/* Meeting location */}
        {club.location && (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4">
            <div className="flex items-center gap-2 text-sm text-white/70">
              <MapPin className="w-4 h-4 text-[#c5f135] shrink-0" />
              <span>{club.location}</span>
            </div>
          </div>
        )}

        {/* Description */}
        {club.description && (
          <p className="text-sm text-white/60 leading-relaxed">{club.description}</p>
        )}

        {/* ── UPCOMING RUNS ── */}
        <div>
          <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest px-1 mb-3">Upcoming Runs</h2>

          {upcomingRuns.length === 0 ? (
            <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
              <p className="text-white/40 text-sm">No upcoming runs scheduled.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingRuns.map((run) => {
                const d = new Date(run.date + "T00:00:00")
                const isToday = run.date === todayStr
                return (
                  <div
                    key={run.id}
                    className={`rounded-2xl border px-4 py-4 ${isToday ? "bg-[#c5f135]/5 border-[#c5f135]/25" : "bg-[#1e2d12] border-[#2e3d1a]"}`}
                  >
                    <div className="flex items-start gap-3">
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
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── CLAIM THIS CLUB ── */}
        {!isClaimed && userId && claimStatus === "idle" && !showClaimForm && (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-white">Is this your club?</p>
              <p className="text-xs text-white/40 mt-0.5">Claim it to manage runs and connect with members.</p>
            </div>
            <button
              onClick={() => setShowClaimForm(true)}
              className="shrink-0 px-4 py-2 rounded-full border border-[#c5f135]/40 text-[#c5f135] text-xs font-black hover:bg-[#c5f135]/10 transition"
            >
              Claim Club
            </button>
          </div>
        )}

        {!isClaimed && userId && showClaimForm && claimStatus === "idle" && (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">Claim this club</p>
              <button onClick={() => setShowClaimForm(false)} className="text-white/30 hover:text-white/60 transition text-xs">
                Cancel
              </button>
            </div>
            <p className="text-xs text-white/40 leading-relaxed">
              We'll review your claim and link your account as the club manager. We may reach out to verify.
            </p>
            <div>
              <label className="block text-xs font-semibold text-white/50 mb-1.5">Your Instagram handle <span className="font-normal text-white/25">(helps us verify)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm pointer-events-none">@</span>
                <input
                  value={claimInstagram}
                  onChange={(e) => setClaimInstagram(e.target.value.replace(/^@/, ""))}
                  placeholder="yourhandle"
                  className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl pl-7 pr-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/50 mb-1.5">Anything else we should know? <span className="font-normal text-white/25">(optional)</span></label>
              <textarea
                value={claimMessage}
                onChange={(e) => setClaimMessage(e.target.value)}
                placeholder="e.g. I'm the founder, here's our website…"
                rows={3}
                className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition resize-none"
              />
            </div>
            <button
              onClick={submitClaim}
              disabled={claimSubmitting}
              className="w-full py-3 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-xl disabled:opacity-40 hover:bg-[#d4ff45] transition"
            >
              {claimSubmitting ? "Submitting…" : "Submit Claim"}
            </button>
          </div>
        )}

        {(claimStatus === "pending" || claimStatus === "submitted") && (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-5 flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-[#c5f135] shrink-0 mt-1.5" />
            <div>
              <p className="text-sm font-bold text-white">
                {claimStatus === "submitted" ? "Claim submitted!" : "Claim pending review"}
              </p>
              <p className="text-xs text-white/40 mt-0.5">
                We'll review and reach out to link your account as the club manager.
              </p>
            </div>
          </div>
        )}

        {/* CTA for unauthenticated users */}
        {!userId && (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-6 text-center">
            <p className="text-white font-bold text-sm mb-1">Want to join this club?</p>
            <p className="text-white/40 text-xs mb-4">Create a free account to follow runs and connect with members.</p>
            <button
              onClick={() => router.push("/login")}
              className="px-6 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
            >
              Get Started — It&apos;s Free
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
