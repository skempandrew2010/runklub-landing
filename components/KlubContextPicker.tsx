"use client"

import Link from "next/link"
import { Trophy, ClipboardList, PlusCircle } from "lucide-react"

/**
 * Shared dual-role picker — "which klub am I managing?" — used wherever a
 * signed-in user needs to disambiguate between the klub they direct and the
 * klub they coach before landing in a specific view (the /director tab, and
 * Analytics). Names each klub when known; when there's no owned klub yet,
 * the Director option becomes a "Create a Klub" prompt instead of a dead end.
 */
export default function KlubContextPicker({
  eyebrow = "Director tab",
  title = "Which klub are you managing?",
  hasDirectorClub,
  directorClubName,
  coachClubName,
  onPick,
}: {
  eyebrow?: string
  title?: string
  hasDirectorClub: boolean
  directorClubName: string | null
  coachClubName: string | null
  onPick: (context: "director" | "coach") => void
}) {
  return (
    <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1 text-center">{eyebrow}</p>
        <h1 className="text-xl font-black text-white text-center mb-6">{title}</h1>
        <div className="space-y-3">
          {hasDirectorClub ? (
            <button
              onClick={() => onPick("director")}
              className="w-full text-left p-5 rounded-2xl border border-[#2e3d1a] bg-[#1e2d12] hover:border-[#c5f135]/40 transition"
            >
              <Trophy className="w-5 h-5 text-[#c5f135] mb-2" />
              <p className="text-base font-bold text-white">Director</p>
              {directorClubName && (
                <span className="inline-block mt-1.5 px-2.5 py-1 rounded-full bg-[#2e3d1a] text-[10px] font-bold text-[#c5f135]/80 max-w-full truncate">
                  {directorClubName}
                </span>
              )}
            </button>
          ) : (
            <Link
              href="/submit-club"
              className="block w-full text-left p-5 rounded-2xl border border-dashed border-[#2e3d1a] bg-[#1e2d12]/60 hover:border-[#c5f135]/40 transition"
            >
              <Trophy className="w-5 h-5 text-white/30 mb-2" />
              <p className="text-base font-bold text-white/60">Director</p>
              <p className="text-xs text-white/40 mt-0.5">You don&apos;t direct a klub yet</p>
              <span className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full bg-[#c5f135]/10 text-[10px] font-bold text-[#c5f135]">
                <PlusCircle className="w-3 h-3" /> Create a Klub
              </span>
            </Link>
          )}
          <button
            onClick={() => onPick("coach")}
            className="w-full text-left p-5 rounded-2xl border border-[#2e3d1a] bg-[#1e2d12] hover:border-[#c5f135]/40 transition"
          >
            <ClipboardList className="w-5 h-5 text-[#c5f135] mb-2" />
            <p className="text-base font-bold text-white">Coach</p>
            {coachClubName ? (
              <span className="inline-block mt-1.5 px-2.5 py-1 rounded-full bg-[#2e3d1a] text-[10px] font-bold text-[#c5f135]/80 max-w-full truncate">
                {coachClubName}
              </span>
            ) : (
              <p className="text-xs text-white/40 mt-0.5">Manage the pace group you were invited to coach</p>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
