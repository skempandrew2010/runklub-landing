"use client"

import { useEffect, useState } from "react"
import { Trophy } from "lucide-react"
import { getKlubShowdownLeaderboard, type KlubShowdownRow } from "@/lib/challenges"
import { isVerifiedClub } from "@/utils/clubTier"
import VerifiedBadge from "@/components/VerifiedBadge"

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

function KlubRow({ row, isHighlighted }: { row: KlubShowdownRow; isHighlighted: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${isHighlighted ? "bg-[#c5f135]/5 border border-[#c5f135]/25" : ""}`}>
      <RankBadge rank={row.rank} />
      <div className="w-9 h-9 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0 overflow-hidden">
        {row.club_image_url ? (
          <img src={row.club_image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-bold text-[#c5f135]">{initialsOf(row.club_name)}</span>
        )}
      </div>
      <p className="text-sm font-bold text-white truncate flex-1 min-w-0 flex items-center gap-1.5">
        <span className="truncate">{row.club_name}</span>
        {isVerifiedClub(row.club_tier) && <VerifiedBadge compact />}
        {isHighlighted && <span className="text-[#c5f135] font-black shrink-0">(Your Klub)</span>}
      </p>
      <p className="text-sm font-black text-[#c5f135] shrink-0">{row.score}</p>
    </div>
  )
}

/** Klub-vs-klub monthly check-in leaderboard. Pass highlightClubId when embedding on a club's own page. */
export default function KlubShowdownLeaderboard({ highlightClubId }: { highlightClubId?: string }) {
  const [rows, setRows] = useState<KlubShowdownRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getKlubShowdownLeaderboard().then((data) => {
      if (!cancelled) {
        setRows(data)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const visible = rows.slice(0, TOP_N)
  const own = highlightClubId ? rows.find((r) => r.club_id === highlightClubId) : undefined
  const ownVisible = own ? own.rank <= TOP_N : false

  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-3">
        <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-[#c5f135]" /> Klub Showdown
        </h2>
        <span className="text-[10px] font-bold text-white/30 uppercase tracking-wide">This Month</span>
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
          <p className="text-white/40 text-sm">No check-ins yet this month — be the first klub on the board!</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-2 space-y-1">
          {visible.map((row) => (
            <KlubRow key={row.club_id} row={row} isHighlighted={row.club_id === highlightClubId} />
          ))}
          {own && !ownVisible && (
            <>
              <div className="h-px bg-[#2e3d1a] my-1" />
              <KlubRow row={own} isHighlighted />
            </>
          )}
        </div>
      )}
    </div>
  )
}
