"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { CLUB_ID } from "@/lib/clubModel/constants"
import { useClubModelAccess } from "@/lib/clubModel/access"

type Run = {
  id: string
  title: string
  date: string
  time: string
  distance: string | null
  meeting_point: string | null
}

// Deliberately queries `runs` with the normal authenticated browser client
// (anon key + whatever session is logged in) rather than the service-role
// club-model API — this is the only way to see exactly what the "Gated
// club runs visible to owner, active members, admins" RLS policy allows
// for the currently signed-in account.
export default function MemberViewPage() {
  const ready = useClubModelAccess("tester")
  const [email, setEmail] = useState<string | null>(null)
  const [runs, setRuns] = useState<Run[] | null>(null)

  useEffect(() => {
    if (!ready) return
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setEmail(user?.email ?? null)

      const { data } = await supabase
        .from("runs")
        .select("id, title, date, time, distance, meeting_point")
        .eq("club_id", CLUB_ID)
        .order("date")
      setRuns(data ?? [])
    }
    load()
  }, [ready])

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] py-10 px-6">
      <div className="max-w-xl mx-auto">
        <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">Admin prototype</p>
        <h1 className="text-2xl font-black text-white mb-1">Runs visible to you</h1>
        <p className="text-sm text-white/60 mb-6">
          Signed in as <span className="font-bold text-white/70">{email ?? "…"}</span>. This is exactly what the
          database&rsquo;s row-level security lets this account see for the test club — not a cached or
          admin-bypassed view.
        </p>

        <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-6">
          {runs === null ? (
            <p className="text-sm text-white/50">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-white/50">
              No runs visible. Either none exist yet, or this account isn&rsquo;t an active member /
              owner / admin for this club.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <div key={r.id} className="bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
                  <p className="text-sm font-bold text-white">{r.title}</p>
                  <p className="text-xs text-white/60">{r.date} at {r.time} {r.distance && `· ${r.distance}`}</p>
                  {r.meeting_point && <p className="text-xs text-white/50">{r.meeting_point}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <Link href="/admin/club-model/join" className="block text-center text-xs text-white/50 hover:text-white/70 mt-4">
          ← Back to join simulator
        </Link>
      </div>
    </div>
  )
}
