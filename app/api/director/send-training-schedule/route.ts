import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { NextRequest, NextResponse } from "next/server"
import { formatRunTimeInOwnZone } from "@/lib/timezone"
import { formatWorkoutSegment, parseWorkoutStructure, type WorkoutSegment } from "@/lib/workouts"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const FROM = process.env.RESEND_FROM_EMAIL ?? "RunKlub <info@runklub.fit>"
const BASE_URL = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.runklub.fit"

function currentWeekMonday(): string {
  const today = new Date()
  const day = today.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(today)
  mon.setDate(today.getDate() + diff)
  const y = mon.getFullYear()
  const m = String(mon.getMonth() + 1).padStart(2, "0")
  const d = String(mon.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00")
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtWeekLabel(monday: string): string {
  const start = new Date(monday + "T00:00:00")
  const end = new Date(monday + "T00:00:00")
  end.setDate(end.getDate() + 6)
  const startStr = start.toLocaleDateString("en-US", { month: "long", day: "numeric" })
  const endStr = end.toLocaleDateString("en-US", { day: "numeric" })
  return `${startStr}–${endStr}, ${end.getFullYear()}`
}

type Run = {
  id: string
  date: string
  time: string
  timezone: string | null
  distance: string | null
  meeting_point: string | null
  is_in_person: boolean
  members_only: boolean
}

type WorkoutInfo = { title: string; description: string | null; structure: WorkoutSegment[] }
type ScheduleDay = { workout: WorkoutInfo | null; notes: string | null; runs: Run[] }

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
// day_of_week is stored 0=Sun..6=Sat, but the schedule reads Monday-first.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function buildScheduleEmail(
  memberName: string,
  clubName: string,
  clubId: string,
  monday: string,
  weekLabel: string,
  scheduleByDay: Record<number, ScheduleDay>
): { html: string; text: string } {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const clubUrl = `${BASE_URL}/clubs/${clubId}`
  const firstName = memberName.trim().split(" ")[0]

  const days = DAY_ORDER.map((day) => {
    const dateLabel = new Date(addDays(monday, (day - 1 + 7) % 7) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    return { day, label: DAY_LABELS[day], dateLabel, ...scheduleByDay[day] }
  })

  const runsHtml = days.map(({ label, dateLabel, workout, notes, runs }) => {
    const segmentLines = workout?.structure.length ? workout.structure.map(formatWorkoutSegment) : []
    const runLines = runs.map((r) => {
      const timeStr = formatRunTimeInOwnZone(r)
      const parts = [timeStr]
      if (r.meeting_point) parts.push(esc(r.meeting_point))
      if (r.distance) parts.push(esc(r.distance))
      return parts.join(" &middot; ")
    })
    return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
  <tr>
    <td style="background:#1e2d12;border:1px solid #2e3d1a;border-radius:12px;padding:16px 18px;">
      <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:rgba(197,241,53,0.65);letter-spacing:0.1em;text-transform:uppercase;">${esc(label)} &middot; ${esc(dateLabel)}</p>
      ${workout
        ? `<p style="margin:0 0 4px;font-size:17px;font-weight:900;color:#ffffff;">${esc(workout.title)}</p>`
        : `<p style="margin:0 0 4px;font-size:15px;font-weight:700;color:rgba(255,255,255,0.35);">Rest day</p>`}
      ${segmentLines.length ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:rgba(197,241,53,0.75);">${segmentLines.map(esc).join(" &middot; ")}</p>` : ""}
      ${workout?.description ? `<p style="margin:0 0 6px;font-size:13px;color:rgba(255,255,255,0.65);line-height:1.6;">${esc(workout.description).replace(/\n/g, "<br>")}</p>` : ""}
      ${notes ? `<p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.45);line-height:1.6;">${esc(notes).replace(/\n/g, "<br>")}</p>` : ""}
      ${runLines.length ? `<p style="margin:0;font-size:12px;color:rgba(255,255,255,0.5);">${runLines.map((l) => `Group run &middot; ${l}`).join("<br>")}</p>` : ""}
    </td>
  </tr>
</table>`
  }).join("")

  const runsText = days.map(({ label, dateLabel, workout, notes, runs }) => {
    const parts = [`${label}, ${dateLabel} — ${workout ? workout.title : "Rest day"}`]
    if (workout?.structure.length) parts.push(workout.structure.map(formatWorkoutSegment).join(", "))
    if (workout?.description) parts.push(workout.description)
    if (notes) parts.push(notes)
    for (const r of runs) {
      const bits = [formatRunTimeInOwnZone(r)]
      if (r.meeting_point) bits.push(r.meeting_point)
      if (r.distance) bits.push(r.distance)
      parts.push(`Group run: ${bits.join(" · ")}`)
    }
    return parts.join("\n")
  }).join("\n\n")

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a2110;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">

        <tr>
          <td style="padding:24px 32px;border-bottom:1px solid #2e3d1a;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td><span style="font-size:20px;font-weight:900;color:#ffffff;">Run</span><span style="font-size:20px;font-weight:900;color:#c5f135;">Klub</span></td>
                <td align="right"><span style="font-size:12px;color:rgba(255,255,255,0.35);">${esc(clubName)}</span></td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 8px;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:rgba(197,241,53,0.6);letter-spacing:0.1em;text-transform:uppercase;">Week of ${esc(weekLabel)}</p>
            <h1 style="margin:0 0 14px;font-size:24px;font-weight:900;color:#ffffff;line-height:1.2;">Your Training Schedule</h1>
            <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.6;">Hi ${esc(firstName)}, here&rsquo;s ${esc(clubName)}&rsquo;s training schedule for this week.</p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 16px;">
            ${runsHtml}
          </td>
        </tr>

        <tr>
          <td style="padding:8px 32px 28px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:#c5f135;">
                  <a href="${clubUrl}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:900;color:#1a2110;text-decoration:none;border-radius:999px;">
                    View ${esc(clubName)} &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2e3d1a;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);line-height:1.6;">
              You&rsquo;re receiving this as a member of ${esc(clubName)} on RunKlub.<br>
              <a href="${clubUrl}" style="color:rgba(197,241,53,0.45);text-decoration:none;">View klub</a>
              &nbsp;&mdash;&nbsp;
              <a href="${BASE_URL}/explore" style="color:rgba(197,241,53,0.45);text-decoration:none;">RunKlub</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `Your Training Schedule — Week of ${weekLabel}\n\nHi ${firstName},\n\nHere's ${clubName}'s schedule for this week:\n\n${runsText}\n\n---\nView ${clubName}: ${clubUrl}`

  return { html, text }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const adminSupabase = getAdminSupabase()
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { club_id, week_monday } = body ?? {}
    if (!club_id) return NextResponse.json({ error: "club_id is required" }, { status: 400 })

    const { data: club } = await adminSupabase
      .from("clubs").select("id, name, tier").eq("id", club_id).eq("user_id", user.id).single()
    if (!club) return NextResponse.json({ error: "Klub not found or unauthorized" }, { status: 403 })

    if (club.tier !== "growth" && club.tier !== "enterprise") {
      return NextResponse.json(
        { error: "Training schedule emails are a Growth feature.", code: "growth_required" },
        { status: 403 }
      )
    }

    // Prefer the client-supplied Monday (computed in the director's local timezone)
    // to avoid off-by-one-week errors for non-UTC timezones on Sunday evenings.
    const monday = week_monday ?? currentWeekMonday()
    const sunday = addDays(monday, 6)
    const weekLabel = fmtWeekLabel(monday)

    // The director's standing weekly plan (Runs -> Weekly Training Schedule), plus
    // that week's actual dated runs for context — not a personalized per-pace-group build.
    const [weeklyScheduleResult, workoutsResult, weekRunsResult, membersResult] = await Promise.all([
      adminSupabase.from("club_weekly_schedule").select("day_of_week, workout_type_id, notes").eq("club_id", club_id),
      adminSupabase.from("runs").select("id, title, description, structure").eq("club_id", club_id).eq("kind", "workout"),
      adminSupabase.from("runs")
        .select("id, date, time, timezone, distance, meeting_point, is_in_person, members_only")
        .eq("club_id", club_id).eq("kind", "run")
        .gte("date", monday).lte("date", sunday)
        .order("time"),
      adminSupabase.from("members")
        .select("id, name, email, user_id")
        .eq("club_id", club_id).eq("status", "active"),
    ])

    const workoutById: Record<string, WorkoutInfo> = {}
    for (const w of workoutsResult.data ?? []) {
      workoutById[w.id] = { title: w.title, description: w.description, structure: parseWorkoutStructure(w.structure) }
    }

    const scheduleByDay: Record<number, ScheduleDay> = {}
    for (let day = 0; day < 7; day++) scheduleByDay[day] = { workout: null, notes: null, runs: [] }
    for (const row of weeklyScheduleResult.data ?? []) {
      scheduleByDay[row.day_of_week] = {
        workout: row.workout_type_id ? (workoutById[row.workout_type_id] ?? null) : null,
        notes: row.notes,
        runs: [],
      }
    }
    for (const run of (weekRunsResult.data ?? []) as Run[]) {
      const day = new Date(run.date + "T00:00:00").getDay()
      scheduleByDay[day].runs.push(run)
    }

    const members: any[] = membersResult.data ?? []
    if (members.length === 0) {
      return NextResponse.json({
        error: "No active members to send to yet.",
        code: "no_eligible_members",
      }, { status: 400 })
    }

    // Resolve the live auth email for any member who has a user_id.
    // This is more reliable than the email stored at enrollment time (which can
    // go stale if the runner updates their email address).
    const authEmailMap: Record<string, string> = {}
    const userIdMembers = members.filter((m) => m.user_id)
    if (userIdMembers.length > 0) {
      await Promise.allSettled(
        userIdMembers.map(async (m) => {
          const { data } = await adminSupabase.auth.admin.getUserById(m.user_id)
          if (data?.user?.email) authEmailMap[m.user_id] = data.user.email
        })
      )
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    const emailSubject = `${club.name}: Your Training Schedule — Week of ${weekLabel}`

    let sent = 0
    let skipped = 0

    await Promise.allSettled(
      members.map(async (member: any) => {
        // Prefer live auth email; fall back to the email stored at enrollment
        const email = (member.user_id && authEmailMap[member.user_id]) || member.email
        if (!email) { skipped++; return }

        const { html, text } = buildScheduleEmail(
          member.name, club.name, club_id, monday, weekLabel, scheduleByDay
        )

        const { error } = await resend.emails.send({
          from: FROM,
          to: email,
          subject: emailSubject,
          html,
          text,
          replyTo: user.email ?? undefined,
        })

        if (error) {
          console.error(`schedule email error for ${email}:`, error)
          skipped++
        } else {
          sent++
        }
      })
    )

    return NextResponse.json({ ok: true, sent, skipped, total: members.length })
  } catch (err: any) {
    console.error("send-training-schedule error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
