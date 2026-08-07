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
  tier?: "free" | "starter" | "growth" | "enterprise" | null
  stripe_subscription_id?: string | null
  stripe_subscription_status?: string | null
  tier_expires_at?: string | null
  memberCount?: number
  meeting_day?: string | null
  is_public?: boolean | null
  membership_type?: "free" | "optional_paid" | "paid_required" | null
  website?: string | null
  membership_price_cents?: number | null
  stripe_connect_account_id?: string | null
  stripe_connect_charges_enabled?: boolean | null
}
