"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { ClipboardList, ChevronRight } from "lucide-react"

type PendingInvite = {
  id: string
  token: string
  name: string | null
  clubs: { name: string; image_url: string | null } | null
}

/**
 * Surfaces any pending coach invite (matched by the signed-in user's email)
 * wherever they land — Member Hub, Director Home, or the Coach dashboard —
 * so they don't have to go dig up the invite email. Tapping it goes straight
 * to the accept flow at /coach-invite/[token].
 */
export default function PendingCoachInviteBanner() {
  const [invites, setInvites] = useState<PendingInvite[]>([])

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch("/api/my-pending-coach-invites", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const json = await res.json()
      setInvites(json.invites ?? [])
    }
    load()
  }, [])

  if (invites.length === 0) return null

  return (
    <div className="space-y-2">
      {invites.map((invite) => (
        <Link
          key={invite.id}
          href={`/coach-invite/${invite.token}`}
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#c5f135]/10 border border-[#c5f135]/30 hover:border-[#c5f135]/60 transition"
        >
          <div className="w-9 h-9 rounded-full bg-[#c5f135]/15 flex items-center justify-center shrink-0">
            <ClipboardList className="w-4 h-4 text-[#c5f135]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">
              You&apos;re invited to coach at {invite.clubs?.name ?? "a klub"}
            </p>
            <p className="text-xs text-white/50 mt-0.5">Tap to accept</p>
          </div>
          <ChevronRight className="w-4 h-4 text-[#c5f135]/60 shrink-0" />
        </Link>
      ))}
    </div>
  )
}
