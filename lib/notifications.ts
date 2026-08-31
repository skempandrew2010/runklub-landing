export type NotificationType = "dm" | "join_request" | "member_subscribed" | "coach_invite_accepted" | "run_reminder" | "newsletter"

export type NotificationRow = {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  club_id: string | null
  avatar_url: string | null
  read_at: string | null
  created_at: string
}

export type NewNotification = {
  user_id: string
  type: NotificationType
  title: string
  body?: string | null
  link?: string | null
  club_id?: string | null
  avatar_url?: string | null
}
