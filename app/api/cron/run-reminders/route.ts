import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { runStartInstant } from "@/lib/timezone"
import { sendPushToUser } from "@/lib/server/onesignal"

const REMINDER_WINDOW_MIN_MS = 50 * 60_000
const REMINDER_WINDOW_MAX_MS = 70 * 60_000

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// UTC calendar date, offset by `days` — bounds the query independent of the
// server process's own timezone (irrelevant to which zone any given run is in).
function utcDateStr(days: number) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = getAdminSupabase()

  // Bounded to a 3-day UTC window (not the run's own timezone, which varies
  // per row) so this scan stays cheap; the exact 50-70min filter below is
  // what actually decides which runs get a reminder this tick.
  const { data: runs, error: runsError } = await admin
    .from("runs")
    .select("id, title, date, time, timezone")
    .gte("date", utcDateStr(-1))
    .lte("date", utcDateStr(1))

  if (runsError) return NextResponse.json({ error: runsError.message }, { status: 500 })

  const now = Date.now()
  const dueRuns = (runs ?? []).filter((run) => {
    const startMs = runStartInstant(run).getTime() - now
    return startMs >= REMINDER_WINDOW_MIN_MS && startMs <= REMINDER_WINDOW_MAX_MS
  })
  if (dueRuns.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  const runsById = new Map(dueRuns.map((run) => [run.id, run]))
  const { data: rsvps, error: rsvpsError } = await admin
    .from("rsvps")
    .select("id, user_id, run_id")
    .eq("going", true)
    .is("reminder_sent_at", null)
    .in("run_id", dueRuns.map((run) => run.id))

  if (rsvpsError) return NextResponse.json({ error: rsvpsError.message }, { status: 500 })

  let sent = 0
  for (const rsvp of rsvps ?? []) {
    const run = runsById.get(rsvp.run_id)
    if (!run) continue

    try {
      await sendPushToUser(
        rsvp.user_id,
        "Run starting soon",
        `${run.title} starts in about an hour`,
        `https://www.runklub.fit/runs/${run.id}`
      )
      await admin.from("rsvps").update({ reminder_sent_at: new Date().toISOString() }).eq("id", rsvp.id)
      sent++
    } catch (err) {
      console.error("run-reminders: failed to send", rsvp.id, err)
    }
  }

  return NextResponse.json({ ok: true, sent })
}
