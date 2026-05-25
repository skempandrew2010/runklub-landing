"use client"

import { Club } from "@/types/club"
import { supabase } from "@/lib/supabase"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Heart } from "lucide-react"
import { formatTimeToAMPM } from "@/utils/formatTime"
import { getTagStyle } from "@/utils/tagStyle"
import { localDateStr } from "@/utils/dates"
import Image from "next/image"

type NextRun = {
  id: string
  title: string
  date: string
  time: string
  tags: string[] | null
}

type Props = {
  club: Club & { distance?: number }
  onHover?: (id: string | null) => void
  onSubscriptionChange?: (club: Club, isFav: boolean) => void
  showHeart?: boolean
  userId: string | null
  requireAuth?: (action?: () => void) => void
  isSelected?: boolean
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

function formatRunDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow"
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

export default function ClubCard({
  club,
  onHover,
  onSubscriptionChange,
  showHeart,
  userId,
  requireAuth,
  isSelected,
}: Props) {
  const router = useRouter()
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [nextRun, setNextRun] = useState<NextRun | null | undefined>(undefined)
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null)

  useEffect(() => {
    if (!userId) return
    supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("club_id", club.id)
      .maybeSingle()
      .then(({ data }) => setIsSubscribed(!!data))
  }, [club.id, userId])

  useEffect(() => {
    const today = localDateStr()
    supabase
      .from("runs")
      .select("id, title, date, time, tags")
      .eq("club_id", club.id)
      .eq("is_public", true)
      .gte("date", today)
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setNextRun(data ?? null))
  }, [club.id])

  const handleSubscription = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      if (isSubscribed) {
        await supabase.from("subscriptions").delete().eq("user_id", userId).eq("club_id", club.id)
        setIsSubscribed(false)
        onSubscriptionChange?.(club, false)
        setSubscriberCount((prev) => (prev !== null ? Math.max(prev - 1, 0) : 0))
      } else {
        await supabase.from("subscriptions").upsert({ user_id: userId, club_id: club.id }, { onConflict: "user_id,club_id" })
        setIsSubscribed(true)
        onSubscriptionChange?.(club, true)
        setSubscriberCount((prev) => (prev !== null ? prev + 1 : 1))
        setIsAnimating(true)
        setTimeout(() => setIsAnimating(false), 300)
      }
    } catch {}
  }

  const gradient = getGradient(club.name)
  const initials = club.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()

  return (
    <div
      id={`club-${club.id}`}
      onMouseEnter={() => onHover?.(club.id)}
      onMouseLeave={() => onHover?.(null)}
      onClick={() => router.push(`/clubs/${club.id}`)}
      className={`group cursor-pointer flex items-start gap-4 px-5 py-5 transition-colors duration-150 hover:bg-[#1e2d12]
        ${isSelected ? "border-l-2 border-[#c5f135] !pl-[18px] bg-[#1e2d12]" : "border-l-2 border-transparent"}`}
    >
      {/* Club image */}
      <div className={`relative w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        {club.image_url ? (
          <Image src={club.image_url} alt={club.name} fill sizes="64px" className="object-cover" />
        ) : (
          <span className="text-lg font-black text-white/20 select-none">{initials}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white leading-tight truncate">{club.name}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {club.city && <p className="text-sm text-white/55">{club.city}</p>}
              {club.distance != null && (
                <span className="text-xs text-white/35">{club.distance.toFixed(1)} mi away</span>
              )}
            </div>
          </div>

          {showHeart && (
            <button
              type="button"
              onClick={(e) => requireAuth ? requireAuth(() => handleSubscription(e)) : handleSubscription(e)}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#2e3d1a] transition mt-0.5"
            >
              <Heart
                fill={isSubscribed ? "#ef4444" : "none"}
                className={`w-4 h-4 ${isSubscribed ? "text-red-400" : "text-white/40"} transition-transform duration-300 ${isAnimating ? "scale-125" : ""}`}
              />
            </button>
          )}
        </div>

        {/* Members */}
        {club.memberCount != null && (
          <p className="text-xs text-white/40 mt-1">
            👟 {club.memberCount} {club.memberCount === 1 ? "member" : "members"}
          </p>
        )}

        {/* Next run */}
        <div className="mt-2.5 pt-2.5 border-t border-[#2e3d1a]">
          {nextRun === undefined && (
            <div className="h-3.5 w-32 rounded bg-[#2e3d1a] animate-pulse" />
          )}
          {nextRun === null && (
            <p className="text-xs text-white/30 italic">No runs scheduled</p>
          )}
          {nextRun && (
            <>
              <p className="text-xs text-white/50 font-medium">
                {formatRunDate(nextRun.date)}
                <span className="mx-1.5 text-white/25">·</span>
                {formatTimeToAMPM(nextRun.time)}
              </p>
              <p className="text-sm font-semibold text-white/85 leading-snug truncate mt-0.5">{nextRun.title}</p>
              {nextRun.tags && nextRun.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {nextRun.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getTagStyle(tag)}`}
                    >
                      {tag}
                    </span>
                  ))}
                  {nextRun.tags.length > 3 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#2e3d1a] text-white/30 border border-[#3d5220]">
                      +{nextRun.tags.length - 3}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
