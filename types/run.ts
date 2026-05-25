export type Run = {
  id: string
  club_id: string
  title: string
  date: string
  time: string
  distance: string | null
  meeting_point: string | null
  city: string | null
  run_lat: number | null
  run_lng: number | null
  description: string | null
  created_by: string | null
  created_at: string
  route_url?: string | null
  is_public: boolean
  tags: string[] | null
}
