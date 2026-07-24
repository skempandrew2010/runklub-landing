import { supabase } from "@/lib/supabase"
import { localDateStr } from "@/utils/dates"

export type CheckInResult = {
  club_first: boolean
  club_count: number
  city_first: boolean
  city_count: number | null
  city_id: string | null
  is_home: boolean
}

export async function checkInToClub(clubId: string) {
  const { data, error } = await supabase.rpc("checkin_to_club", { p_club_id: clubId })
  return { data: data as CheckInResult | null, error }
}

export type LeaderboardScope = "month" | "all"

export type LeaderboardRow = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  checkin_count: number
  first_checkin_at: string
  rank: number
  // Only populated by the city-scoped leaderboard — a club-scoped row is
  // implicitly "1 of 1" so it's omitted rather than always 1/1.
  clubs_visited?: number
  total_clubs?: number
}

export async function getClubLeaderboard(clubId: string, scope: LeaderboardScope) {
  const { data, error } = await supabase.rpc("get_club_leaderboard", { p_club_id: clubId, p_scope: scope })
  return { data: (data as LeaderboardRow[]) || [], error }
}

export async function getCityLeaderboard(cityId: string, scope: LeaderboardScope) {
  const { data, error } = await supabase.rpc("get_city_leaderboard", { p_city_id: cityId, p_scope: scope })
  return { data: (data as LeaderboardRow[]) || [], error }
}

export type CityProgress = {
  city_id: string
  city_name: string
  city_state: string | null
  flag_asset_url: string | null
  total_clubs: number
  stamped_clubs: number
  remaining: number
  is_complete: boolean
  is_home_city: boolean
  is_nearest_incomplete: boolean
}

export async function getUserPassportProgress() {
  const { data } = await supabase.rpc("get_user_passport")
  return (data as CityProgress[]) || []
}

export async function getClubStampArt(clubId: string) {
  const { data } = await supabase.from("stamps").select("image_url").eq("club_id", clubId).maybeSingle()
  return data?.image_url ?? null
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
  is_home: boolean
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

export type BookStampSlot = {
  club_id: string
  club_name: string
  club_image_url: string | null
  stamped: boolean
  checkin_count: number
  is_home: boolean
}

export type BookPage = {
  city_id: string
  city_name: string
  city_state: string | null
  flag_asset_url: string | null
  stamped_count: number
  total_count: number
  is_complete: boolean
  is_nearest_incomplete: boolean
  slots: BookStampSlot[]
}

/**
 * One page per city the user has at least one stamp in. Each page lists
 * every klub in that city, stamped or not, so gaps in the collection stay
 * visible — not just the cities/klubs already earned.
 */
export async function getPassportBook(): Promise<BookPage[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const progress = await getUserPassportProgress()
  const startedCities = progress.filter((c) => c.stamped_clubs > 0)
  if (startedCities.length === 0) return []

  const cityIds = startedCities.map((c) => c.city_id)
  const [{ data: cityClubs }, { data: myCheckins }] = await Promise.all([
    supabase.from("clubs").select("id, name, image_url, city_id").in("city_id", cityIds),
    supabase.from("club_checkins").select("club_id, checkin_count, is_home").eq("user_id", user.id),
  ])

  const checkinByClub = new Map((myCheckins || []).map((c: any) => [c.club_id, c]))

  return startedCities
    .map((city) => {
      const slots: BookStampSlot[] = (cityClubs || [])
        .filter((c: any) => c.city_id === city.city_id)
        .map((c: any) => {
          const ci = checkinByClub.get(c.id)
          return {
            club_id: c.id,
            club_name: c.name,
            club_image_url: c.image_url,
            stamped: !!ci,
            checkin_count: ci?.checkin_count ?? 0,
            is_home: ci?.is_home ?? false,
          }
        })
        .sort((a, b) => Number(b.stamped) - Number(a.stamped) || a.club_name.localeCompare(b.club_name))

      return {
        city_id: city.city_id,
        city_name: city.city_name,
        city_state: city.city_state,
        flag_asset_url: city.flag_asset_url,
        stamped_count: city.stamped_clubs,
        total_count: city.total_clubs,
        is_complete: city.is_complete,
        is_nearest_incomplete: city.is_nearest_incomplete,
        slots,
      }
    })
    .sort((a, b) => b.stamped_count - a.stamped_count || a.city_name.localeCompare(b.city_name))
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
    supabase.from("club_checkins").select("club_id, city_id, first_checkin_at, checkin_count, is_home, clubs(name, image_url)").eq("user_id", user.id),
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
