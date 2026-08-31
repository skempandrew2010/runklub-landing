"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export type MessagingContact = { userId: string; name: string; avatarUrl: string | null }

// Shared by the club page and the run page (both need "who can I message
// about this klub" - the director and whichever active coach is scoped to
// the viewer's pace group). Pulled out so the lookup/matching logic only
// lives in one place instead of being copy-pasted per page.
export function useKlubMessaging(
  clubId: string,
  directorUserId: string | null | undefined,
  userId: string | null,
  myPaceGroupId: string | null
) {
  const [director, setDirector] = useState<MessagingContact | null>(null)
  const [coach, setCoach] = useState<MessagingContact | null>(null)

  useEffect(() => {
    if (!directorUserId) { setDirector(null); return }
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", directorUserId)
      .single()
      .then(({ data }) => {
        setDirector({ userId: directorUserId, name: data?.display_name || "Director", avatarUrl: data?.avatar_url ?? null })
      })
  }, [directorUserId])

  // Requires coaches_select_members RLS (a subscriptions row for the club).
  useEffect(() => {
    if (!userId) { setCoach(null); return }
    supabase
      .from("coaches")
      .select("user_id, name, pace_group_ids, status")
      .eq("club_id", clubId)
      .eq("status", "active")
      .then(({ data }) => {
        const coaches = (data ?? []) as { user_id: string; name: string; pace_group_ids: string[] | null }[]
        const match = coaches.find((c) => !c.pace_group_ids?.length || (myPaceGroupId && c.pace_group_ids.includes(myPaceGroupId))) ?? coaches[0] ?? null
        setCoach(match ? { userId: match.user_id, name: match.name, avatarUrl: null } : null)
      })
  }, [clubId, userId, myPaceGroupId])

  return { director, coach }
}
