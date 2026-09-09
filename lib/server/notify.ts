import type { SupabaseClient } from "@supabase/supabase-js"

type NotifyType = "dm" | "join_request" | "member_subscribed" | "coach_invite_accepted" | "run_reminder" | "newsletter"

type NotifyInput = {
  userId: string
  type: NotifyType
  title: string
  body?: string | null
  link?: string | null
  clubId?: string | null
  avatarUrl?: string | null
}

// profiles.notifications_enabled is the one "Notifications" toggle on the
// profile page - a literal off switch, so it gates the in-app bell entry
// itself, not just whether a push also goes out. Returns whether the
// notification was actually created, so callers that also send a push (only
// run-reminders today) know whether to bother.
export async function notifyUser(
  admin: SupabaseClient<any, any, any>,
  { userId, type, title, body, link, clubId, avatarUrl }: NotifyInput
): Promise<boolean> {
  const { data: profile } = await admin.from("profiles").select("notifications_enabled").eq("id", userId).maybeSingle()
  if (profile && (profile as { notifications_enabled: boolean }).notifications_enabled === false) return false

  await admin.from("notifications").insert({
    user_id: userId,
    type,
    title,
    body: body ?? null,
    link: link ?? null,
    club_id: clubId ?? null,
    avatar_url: avatarUrl ?? null,
  })
  return true
}

// Bulk variant for fan-out sends (newsletters) - one query for everyone's
// preference instead of N. Returns the userIds actually notified.
export async function notifyUsers(
  admin: SupabaseClient<any, any, any>,
  userIds: string[],
  { type, title, body, link, clubId }: Omit<NotifyInput, "userId" | "avatarUrl">
): Promise<string[]> {
  if (userIds.length === 0) return []
  const { data: profiles } = await admin.from("profiles").select("id, notifications_enabled").in("id", userIds)
  const allowed = userIds.filter((id) => {
    const p = (profiles ?? []).find((row) => (row as { id: string }).id === id) as { notifications_enabled: boolean } | undefined
    return p?.notifications_enabled !== false
  })
  if (allowed.length === 0) return []

  await admin.from("notifications").insert(
    allowed.map((user_id) => ({
      user_id,
      type,
      title,
      body: body ?? null,
      link: link ?? null,
      club_id: clubId ?? null,
    }))
  )
  return allowed
}
