"use client"

import { useEffect, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { supabase } from "@/lib/supabase"

type RosterMember = { userId: string | null; displayName: string; avatarUrl: string | null }
type CheckinInfo = { checkin_method: string; checked_in_at: string }

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

/** Scoped to the coach's own roster (pace group/branch), unlike RunCheckInRoster which shows every klub subscriber. */
export default function CoachCheckInRoster({ runId, roster }: { runId: string; roster: RosterMember[] }) {
  const [checkins, setCheckins] = useState<Record<string, CheckinInfo>>({})
  const [loading, setLoading] = useState(true)
  const [checkingInUserId, setCheckingInUserId] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.from("run_checkins").select("user_id, checkin_method, checked_in_at").eq("run_id", runId)
      .then(({ data }) => {
        const map: Record<string, CheckinInfo> = {}
        for (const c of (data as any[]) || []) map[c.user_id] = c
        setCheckins(map)
        setLoading(false)
      })
  }, [runId])

  const checkInMember = async (userId: string) => {
    setCheckingInUserId(userId)
    setError("")
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setCheckingInUserId(null); return }
    const res = await fetch("/api/checkin/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ run_id: runId, user_id: userId }),
    })
    setCheckingInUserId(null)
    if (!res.ok) { setError("Couldn't check that member in. Try again."); return }
    setCheckins((prev) => ({ ...prev, [userId]: { checkin_method: "manual", checked_in_at: new Date().toISOString() } }))
  }

  const rosterWithIds = roster.filter((r): r is RosterMember & { userId: string } => !!r.userId)

  if (loading) {
    return <div className="py-6 flex justify-center"><div className="w-5 h-5 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" /></div>
  }

  if (rosterWithIds.length === 0) {
    return <p className="text-xs text-white/40 py-2">No roster members to check in yet.</p>
  }

  return (
    <div className="space-y-1.5">
      {error && <p className="text-xs text-red-400/80">{error}</p>}
      {rosterWithIds.map((m) => {
        const checkedIn = checkins[m.userId]
        return (
          <div key={m.userId} className="flex items-center gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
            <div className="w-7 h-7 rounded-full shrink-0 bg-[#2e3d1a] overflow-hidden flex items-center justify-center">
              {m.avatarUrl
                ? <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                : <span className="text-[10px] font-black text-[#c5f135]">{initialsOf(m.displayName)}</span>
              }
            </div>
            <span className="flex-1 min-w-0 text-sm font-semibold text-white truncate">{m.displayName}</span>
            {checkedIn ? (
              <span className="shrink-0 flex items-center gap-1 text-[10px] font-black text-[#c5f135]">
                <CheckCircle2 className="w-3.5 h-3.5" /> {checkedIn.checkin_method === "manual" ? "Checked in" : "Self check-in"}
              </span>
            ) : (
              <button
                onClick={() => checkInMember(m.userId)}
                disabled={checkingInUserId === m.userId}
                className="shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30 hover:bg-[#c5f135]/25 transition disabled:opacity-50"
              >
                {checkingInUserId === m.userId ? "…" : "Check In"}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
