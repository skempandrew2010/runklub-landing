"use client"

import { useEffect, useState } from "react"
import type { LeaderboardRow, LeaderboardScope, UserTier } from "@/lib/checkins"
import { getUsersCurrentTiers } from "@/lib/checkins"
import { TIER_ICONS } from "@/components/TierCard"

const TOP_N = 10

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-7 h-7 rounded-full bg-[#c5f135] flex items-center justify-center shrink-0">
        <span className="text-xs font-black text-[#1a2110]">1</span>
      </div>
    )
  }
  if (rank <= 3) {
    return (
      <div className="w-7 h-7 rounded-full bg-[#c5f135]/15 border border-[#c5f135]/40 flex items-center justify-center shrink-0">
        <span className="text-xs font-black text-[#c5f135]">{rank}</span>
      </div>
    )
  }
  return (
    <div className="w-7 h-7 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-white/40">{rank}</span>
    </div>
  )
}

function Avatar({ name, avatarUrl, ring }: { name: string; avatarUrl: string | null; ring: boolean }) {
  return (
    <div className={`w-9 h-9 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0 overflow-hidden ${ring ? "ring-2 ring-[#c5f135]/50" : ""}`}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-xs font-bold text-[#c5f135]">{initialsOf(name)}</span>
      )}
    </div>
  )
}

function TierBadge({ tier }: { tier: UserTier | undefined }) {
  if (!tier?.tier_slug) return null
  const Icon = TIER_ICONS[tier.tier_slug]
  if (!Icon) return null
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/40 shrink-0"
      title={tier.tier_name ?? undefined}
    >
      <Icon className="w-2.5 h-2.5 text-[#c5f135]" />
    </span>
  )
}

function LeaderboardRowItem({ row, isYou, tier }: { row: LeaderboardRow; isYou: boolean; tier?: UserTier }) {
  const name = row.display_name || "Runner"
  const showClubs = row.clubs_visited != null && row.total_clubs != null
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
        isYou ? "bg-[#c5f135]/5 border border-[#c5f135]/25" : ""
      }`}
    >
      <RankBadge rank={row.rank} />
      <Avatar name={name} avatarUrl={row.avatar_url} ring={row.rank <= 3} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
          <span className="truncate">{name}</span>
          <TierBadge tier={tier} />
          {isYou && <span className="text-[#c5f135] font-black shrink-0">(You)</span>}
        </p>
        {showClubs && (
          <p className="text-[10px] text-white/40 mt-0.5">{row.clubs_visited}/{row.total_clubs} klubs visited</p>
        )}
      </div>
      <p className="text-sm font-black text-[#c5f135] shrink-0">{row.checkin_count}</p>
    </div>
  )
}

export default function Leaderboard({
  title,
  userId,
  fetchRows,
  guestCopy = "Sign in to see who's leading.",
  emptyCopy,
}: {
  title: string
  userId: string | null
  fetchRows: (scope: LeaderboardScope) => Promise<{ data: LeaderboardRow[] }>
  guestCopy?: string
  emptyCopy?: (scope: LeaderboardScope) => string
}) {
  const [scope, setScope] = useState<LeaderboardScope>("month")
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [tiers, setTiers] = useState<Map<string, UserTier>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    fetchRows(scope).then(({ data }) => {
      if (cancelled) return
      setRows(data)
      setLoading(false)
      getUsersCurrentTiers(data.map((r) => r.user_id)).then((map) => {
        if (!cancelled) setTiers(map)
      })
    })
    return () => { cancelled = true }
    // fetchRows is expected to be stable-enough (bound over an id primitive) — including it
    // would refire on every parent render since callers pass a fresh closure each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, userId])

  const toggle = (
    <div className="flex bg-[#1e2d12] border border-[#2e3d1a] rounded-full p-0.5 shrink-0">
      {(["month", "all"] as const).map((s) => (
        <button
          key={s}
          onClick={() => setScope(s)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
            scope === s ? "bg-[#c5f135] text-[#1a2110]" : "text-white/50 hover:text-white"
          }`}
        >
          {s === "month" ? "This Month" : "All-Time"}
        </button>
      ))}
    </div>
  )

  if (!userId) {
    return (
      <div>
        <div className="flex items-center justify-between px-1 mb-3">
          <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest">{title}</h2>
        </div>
        <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-6 text-center">
          <p className="text-white/40 text-sm">{guestCopy}</p>
        </div>
      </div>
    )
  }

  const visible = rows.slice(0, TOP_N)
  const own = rows.find((r) => r.user_id === userId)
  const ownVisible = own ? own.rank <= TOP_N : false

  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-3">
        <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest">{title}</h2>
        {toggle}
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
          <p className="text-white/40 text-sm">
            {emptyCopy ? emptyCopy(scope) : scope === "month" ? "No check-ins yet this month — be the first!" : "No check-ins yet."}
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-2 space-y-1">
          {visible.map((row) => (
            <LeaderboardRowItem key={row.user_id} row={row} isYou={row.user_id === userId} tier={tiers.get(row.user_id)} />
          ))}
          {own && !ownVisible && (
            <>
              <div className="h-px bg-[#2e3d1a] my-1" />
              <LeaderboardRowItem row={own} isYou tier={tiers.get(own.user_id)} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
