import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { NextRequest, NextResponse } from "next/server"

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

function fmt12h(time: string): string {
  const [hStr, mStr] = time.split(":")
  const h = parseInt(hStr, 10)
  const m = mStr ?? "00"
  const ampm = h < 12 ? "AM" : "PM"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${ampm}`
}

function splitTitle(title: string) {
  const idx = title.lastIndexOf(" · ")
  return idx === -1
    ? { paceGroup: title, branch: null }
    : { paceGroup: title.slice(0, idx), branch: title.slice(idx + 3) }
}

type Run = {
  id: string
  title: string
  date: string
  time: string
  distance: string | null
  meeting_point: string | null
  description: string | null
  is_in_person: boolean
  workout_type_id: string | null
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function buildScheduleEmail(
  memberName: string,
  clubName: string,
  clubId: string,
  weekLabel: string,
  runs: Run[],
  workoutTypeNames: Record<string, string>
): { html: string; text: string } {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const clubUrl = `${BASE_URL}/clubs/${clubId}`
  const firstName = memberName.trim().split(" ")[0]

  const sorted = [...runs].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))

  const runsHtml = sorted.length === 0
    ? `<p style="font-size:14px;color:rgba(255,255,255,0.45);margin:0 0 8px;">No runs scheduled for you this week — check back soon.</p>`
    : sorted.map((run) => {
        const d = new Date(run.date + "T00:00:00")
        const dayName = DAYS[d.getDay()]
        const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        const timeStr = fmt12h(run.time.slice(0, 5))
        const wtName = run.workout_type_id ? workoutTypeNames[run.workout_type_id] : null
        const typeLabel = wtName ?? (run.is_in_person ? "Group Run" : "Solo Run")
        const metaParts: string[] = []
        if (run.distance) metaParts.push(esc(run.distance))
        if (run.meeting_point) metaParts.push(esc(run.meeting_point))

        return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
  <tr>
    <td style="background:#1e2d12;border:1px solid #2e3d1a;border-radius:12px;padding:16px 18px;">
      <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:rgba(197,241,53,0.65);letter-spacing:0.1em;text-transform:uppercase;">${esc(dayName)} &middot; ${esc(dateLabel)}</p>
      <p style="margin:0 0 3px;font-size:17px;font-weight:900;color:#ffffff;">${esc(timeStr)}</p>
      <p style="margin:0${run.description ? " 0 10px" : ""};font-size:12px;color:rgba(255,255,255,0.5);">${esc(typeLabel)}${metaParts.length ? " &middot; " + metaParts.join(" &middot; ") : ""}</p>
      ${run.description ? `<p style="margin:0;font-size:13px;color:rgba(255,255,255,0.65);line-height:1.65;">${esc(run.description).replace(/\n/g, "<br>")}</p>` : ""}
    </td>
  </tr>
</table>`
      }).join("")

  const runsText = sorted.length === 0
    ? "No runs scheduled for you this week."
    : sorted.map((run) => {
        const d = new Date(run.date + "T00:00:00")
        const dayName = DAYS[d.getDay()]
        const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        const timeStr = fmt12h(run.time.slice(0, 5))
        const parts = [`${dayName}, ${dateLabel} — ${timeStr}`]
        if (run.distance) parts.push(`Distance: ${run.distance}`)
        if (run.meeting_point) parts.push(`Meet at: ${run.meeting_point}`)
        if (run.description) parts.push(run.description)
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
            <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.6;">Hi ${esc(firstName)}, here&rsquo;s what&rsquo;s on the schedule for you this week.</p>
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

  const text = `Your Training Schedule — Week of ${weekLabel}\n\nHi ${firstName},\n\nHere's your schedule for this week:\n\n${runsText}\n\n---\nView ${clubName}: ${clubUrl}`

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

    // Fetch everything needed in parallel
    const [runsResult, workoutTypesResult, membersResult, paceGroupsResult, regionsResult] = await Promise.all([
      adminSupabase.from("runs")
        .select("id, title, date, time, distance, meeting_point, description, is_in_person, workout_type_id")
        .eq("club_id", club_id).eq("members_only", true).eq("kind", "run")
        .gte("date", monday).lte("date", sunday)
        .order("date").order("time"),
      adminSupabase.from("runs").select("id, title").eq("club_id", club_id).eq("kind", "workout"),
      adminSupabase.from("members")
        .select("id, name, email, pace_group_id, preferred_region_id, user_id")
        .eq("club_id", club_id).eq("status", "active"),
      adminSupabase.from("pace_groups").select("id, name").eq("club_id", club_id),
      adminSupabase.from("regions").select("id, name").eq("club_id", club_id),
    ])

    const weekRuns: Run[] = runsResult.data ?? []
    const workoutTypeNames: Record<string, string> = {}
    for (const wt of workoutTypesResult.data ?? []) workoutTypeNames[wt.id] = wt.title

    const members: any[] = membersResult.data ?? []

    // Only members with a pace group can receive a personalized schedule
    const eligibleMembers = members.filter((m) => m.pace_group_id)
    if (eligibleMembers.length === 0) {
      return NextResponse.json({
        error: "No members have been assigned to a pace group yet. Go to the Members tab and assign members to a branch to get them on the schedule.",
        code: "no_eligible_members",
      }, { status: 400 })
    }

    const pgMap: Record<string, string> = {}
    for (const pg of paceGroupsResult.data ?? []) pgMap[pg.id] = pg.name
    const regionMap: Record<string, string> = {}
    for (const r of regionsResult.data ?? []) regionMap[r.id] = r.name

    // Resolve the live auth email for any member who has a user_id.
    // This is more reliable than the email stored at enrollment time (which can
    // go stale if the runner updates their email address).
    const authEmailMap: Record<string, string> = {}
    const userIdMembers = eligibleMembers.filter((m) => m.user_id)
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
      eligibleMembers.map(async (member: any) => {
        // Prefer live auth email; fall back to the email stored at enrollment
        const email = (member.user_id && authEmailMap[member.user_id]) || member.email
        if (!email) { skipped++; return }

        const pgName = pgMap[member.pace_group_id]
        if (!pgName) { skipped++; return }

        const regionName = member.preferred_region_id ? regionMap[member.preferred_region_id] : null

        const memberRuns = weekRuns.filter((run) => {
          const { paceGroup, branch } = splitTitle(run.title)
          if (paceGroup !== pgName) return false
          if (branch === null) return true
          return regionName !== null && branch === regionName
        })

        const { html, text } = buildScheduleEmail(
          member.name, club.name, club_id, weekLabel, memberRuns, workoutTypeNames
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

    return NextResponse.json({ ok: true, sent, skipped, total: eligibleMembers.length })
  } catch (err: any) {
    console.error("send-training-schedule error:", err)
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 })
  }
}
