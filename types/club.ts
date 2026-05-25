export type Club = {
  id: string
  name: string
  city: string | null
  latitude: number | null
  longitude: number | null
  location: string | null
  created_at: number
  image_url?: string | null
  user_id?: string | null
  description?: string | null
  tier?: "free" | "verified" | "pro" | null
  stripe_subscription_id?: string | null
  stripe_subscription_status?: string | null
  tier_expires_at?: string | null
  memberCount?: number
  meeting_day?: string | null
  is_public?: boolean | null
}
