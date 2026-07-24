import { supabase } from "@/lib/supabase"
import { localDateStr } from "@/utils/dates"

export type CheckInResult = {
  club_first: boolean
  club_count: number
  city_first: boolean
  city_count: number | null
  city_id: string | null
}

export async function checkInToClub(clubId: string) {
  const { data, error } = await supabase.rpc("checkin_to_club", { p_club_id: clubId })
  return { data: data as CheckInResult | null, error }
}

export type CityRow = {
  id: string
  name: string
  state: string | null
  flag_asset_url: string | null
}

export type CityCheckIn = {
  city_id: string
  first_checkin_at: string
  checkin_count: number
}

export type ClubCheckIn = {
  club_id: string
  city_id: string | null
  first_checkin_at: string
  checkin_count: number
  clubs: { name: string; image_url: string | null } | null
}

/** Longest run of consecutive local-calendar days ending today or yesterday. */
export function computeCheckinStreak(checkinDates: string[]): number {
  const distinctDays = Array.from(new Set(checkinDates)).sort((a, b) => b.localeCompare(a))
  if (distinctDays.length === 0) return 0

  const today = localDateStr()
  const yesterday = localDateStr(new Date(Date.now() - 86400000))
  if (distinctDays[0] !== today && distinctDays[0] !== yesterday) return 0

  let streak = 0
  let expected = distinctDays[0]
  for (const day of distinctDays) {
    if (day !== expected) break
    streak++
    const d = new Date(expected + "T00:00:00")
    d.setDate(d.getDate() - 1)
    expected = localDateStr(d)
  }
  return streak
}

export async function getPassportData() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      cities: [] as CityRow[],
      cityCheckIns: [] as CityCheckIn[],
      clubCheckIns: [] as ClubCheckIn[],
      checkinDates: [] as string[],
      totalCheckins: 0,
    }
  }

  const [{ data: cities }, { data: cityCheckIns }, { data: clubCheckIns }, { data: log }] = await Promise.all([
    supabase.from("cities").select("id, name, state, flag_asset_url").order("name"),
    supabase.from("city_checkins").select("city_id, first_checkin_at, checkin_count").eq("user_id", user.id),
    supabase.from("club_checkins").select("club_id, city_id, first_checkin_at, checkin_count, clubs(name, image_url)").eq("user_id", user.id),
    supabase.from("checkin_log").select("checked_in_at").eq("user_id", user.id),
  ])

  const checkinDates = ((log as { checked_in_at: string }[]) || []).map((r) => localDateStr(new Date(r.checked_in_at)))

  return {
    cities: (cities as CityRow[]) || [],
    cityCheckIns: (cityCheckIns as CityCheckIn[]) || [],
    clubCheckIns: (clubCheckIns as unknown as ClubCheckIn[]) || [],
    checkinDates,
    totalCheckins: checkinDates.length,
  }
}
