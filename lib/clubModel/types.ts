export type Region = {
  id: string
  club_id: string
  name: string
  created_at: string
}

export type RegionDay = {
  id: string
  region_id: string
  day_of_week: string
  meets: boolean
  created_at: string
}

// A region+day can have multiple meeting times (e.g. 6am and 6pm), each
// with its own location.
export type RegionDayTime = {
  id: string
  region_day_id: string
  location_id: string | null
  time: string | null
  created_at: string
}

export type Location = {
  id: string
  region_id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  created_at: string
}

export type Coach = {
  id: string
  club_id: string
  name: string
  email: string | null
  phone: string | null
  user_id: string | null
  created_at: string
}

export type LocationCoach = {
  location_id: string
  coach_id: string
}

export type PaceGroup = {
  id: string
  club_id: string
  name: string
  pace_min: number
  pace_max: number
  created_at: string
}

export type PaceOption = {
  id: string
  club_id: string
  pace: number
  created_at: string
}

export type TrainingSchedule = {
  id: string
  pace_group_id: string
  day_of_week: string
  created_at: string
}

export type TrainingScheduleRegion = {
  training_schedule_id: string
  region_id: string
}

export type WorkoutType = {
  id: string
  club_id: string
  name: string
  description: string | null
  created_at: string
}

export type ScheduledWorkout = {
  id: string
  training_schedule_id: string
  // Either workout_type_id is set (this entry owns its content) or
  // same_as_pace_group_id is set (mirrors another pace group's workout
  // for the same week) — never both, never neither.
  workout_type_id: string | null
  same_as_pace_group_id: string | null
  week_of: string
  details: string | null
  is_in_person: boolean
  created_at: string
}

export type Member = {
  id: string
  club_id: string
  name: string
  email: string
  self_reported_pace: number | null
  preferred_region_id: string | null
  pace_group_id: string | null
  location_id: string | null
  coach_id: string | null
  status: "pending" | "active" | "rejected"
  user_id: string | null
  created_at: string
}

export type RunRsvp = {
  id: string
  member_id: string
  scheduled_workout_id: string
  going: boolean
  created_at: string
  updated_at: string
}

export type ClubModelMessage = {
  id: string
  club_id: string
  member_id: string
  sender: "director" | "member"
  body: string
  created_at: string
}

export type ClubModelInvite = {
  id: string
  club_id: string
  email: string
  name: string | null
  token: string
  status: "sent" | "used" | "revoked"
  created_at: string
  used_at: string | null
}

export const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const

export type ClubModelData = {
  regions: Region[]
  region_days: RegionDay[]
  region_day_times: RegionDayTime[]
  locations: Location[]
  coaches: Coach[]
  location_coaches: LocationCoach[]
  pace_groups: PaceGroup[]
  pace_options: PaceOption[]
  training_schedules: TrainingSchedule[]
  training_schedule_regions: TrainingScheduleRegion[]
  workout_types: WorkoutType[]
  scheduled_workouts: ScheduledWorkout[]
  members: Member[]
  club_model_invites: ClubModelInvite[]
  run_rsvps: RunRsvp[]
}
