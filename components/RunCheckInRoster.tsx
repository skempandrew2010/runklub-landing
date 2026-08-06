"use client"

import { useEffect, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { supabase } from "@/lib/supabase"

type RosterMember = { user_id: string; display_name: string | null; avatar_url: string | null }
type CheckinInfo = { checkin_method: string; checked_in_at: string }

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

/** Lets a klub owner/coach see who's checked into a run and manually check in anyone who couldn't self check-in. */
export default function RunCheckInRoster({ runId, clubId }: { runId: string; clubId: string }) {
  const [roster, setRoster] = useState<RosterMember[]>([])
  const [checkins, setCheckins] = useState<Record<string, CheckinInfo>>({})
  const [loading, setLoading] = useState(true)
  const [checkingInUserId, setCheckingInUserId] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    Promise.all([
      // subscriptions has no FK relationship configured to profiles in the DB,
      // so an embedded profiles(...) select here errors out silently — fetch
      // profiles separately and merge instead.
      supabase.from("subscriptions").select("user_id").eq("club_id", clubId),
      supabase.from("run_checkins").select("user_id, checkin_method, checked_in_at").eq("run_id", runId),
    ]).then(async ([{ data: subs }, { data: checkinRows }]) => {
      const subRows = (subs as any[]) || []
      const { data: profs } = subRows.length > 0
        ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", subRows.map((s) => s.user_id))
        : { data: [] }
      const profileById = new Map((profs || []).map((p: any) => [p.id, p]))
      setRoster(subRows.filter((s) => profileById.has(s.user_id)).map((s) => ({ user_id: s.user_id, ...profileById.get(s.user_id) })))

      const map: Record<string, CheckinInfo> = {}
      for (const c of (checkinRows as any[]) || []) map[c.user_id] = c
      setCheckins(map)
      setLoading(false)
    })
  }, [runId, clubId])

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

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="w-4 h-4 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (roster.length === 0) {
    return <p className="text-xs text-white/40 py-2">No members yet.</p>
  }

  return (
    <div>
      <div className="space-y-1.5 max-h-52 overflow-y-auto">
        {roster.map((m) => {
          const checkin = checkins[m.user_id]
          const name = m.display_name || "Runner"
          return (
            <div key={m.user_id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-[#0e150a]">
              <div className="w-7 h-7 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0 overflow-hidden">
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] font-bold text-[#c5f135]">{initialsOf(name)}</span>
                )}
              </div>
              <span className="text-xs font-semibold text-white flex-1 truncate">{name}</span>
              {checkin ? (
                <span className="flex items-center gap-1 text-[10px] font-black text-[#c5f135] shrink-0">
                  <CheckCircle2 className="w-3 h-3" /> {checkin.checkin_method === "manual" ? "Checked in (manual)" : "Checked in"}
                </span>
              ) : (
                <button
                  onClick={() => checkInMember(m.user_id)}
                  disabled={checkingInUserId === m.user_id}
                  className="text-[10px] font-black px-2 py-1 rounded-full bg-[#c5f135]/10 border border-[#c5f135]/30 text-[#c5f135] hover:bg-[#c5f135]/20 transition disabled:opacity-40 shrink-0"
                >
                  {checkingInUserId === m.user_id ? "…" : "Check in"}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {error && <p className="text-[10px] text-red-400/80 mt-1.5">{error}</p>}
    </div>
  )
}
