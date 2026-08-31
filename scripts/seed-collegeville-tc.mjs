import { readFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"

// ── Load .env.local ───────────────────────────────────────────────────────────
const env = {}
try {
  readFileSync(".env.local", "utf8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=")
    if (key && rest.length) env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "")
  })
} catch { /* fall back to process.env */ }
const get = (k) => env[k] ?? process.env[k]

const SUPABASE_URL = get("NEXT_PUBLIC_SUPABASE_URL")
const SERVICE_KEY  = get("SUPABASE_SERVICE_ROLE_KEY")
const DRY_RUN      = process.argv.includes("--dry-run")

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const CHECK_URL = "collegevilletc.com/p/group-runs.html"

function nextWeekday(target) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = (target - today.getDay() + 7) % 7 || 7
  today.setDate(today.getDate() + diff)
  return today.toISOString().slice(0, 10)
}

function addWeeks(dateStr, weeks) {
  const d = new Date(dateStr + "T00:00:00")
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const { data: existing } = await db.from("clubs").select("id").ilike("name", "Collegeville Track Club").maybeSingle()
  let clubId
  if (existing) {
    console.log(`Club already exists (${existing.id}) — skipping create`)
    clubId = existing.id
  } else {
    const record = {
      name: "Collegeville Track Club",
      city: "Minneapolis",
      location: null,
      latitude: null,
      longitude: null,
      description: `USA Track & Field-affiliated racing club with weekly social group runs. Wednesday runs are river loops (3-30 mi); Saturday runs are 1-30 mi with pizza/refreshments after. Meeting locations rotate — check ${CHECK_URL} for the current spot.`,
      instagram_handle: "collegeville_tc",
      website: "http://www.collegevilletc.com/",
      meeting_day: "Wednesday & Saturday",
      tier: "free",
      is_public: true,
      membership_type: "free",
      bad_contact: false,
      user_id: null,
    }
    if (DRY_RUN) {
      console.log("WOULD CREATE CLUB", record.name)
      clubId = "dry-run-id"
    } else {
      const { data, error } = await db.from("clubs").insert(record).select("id").single()
      if (error) { console.error("ERROR creating club:", error.message); process.exit(1) }
      clubId = data.id
      console.log(`✓ Created club Collegeville Track Club (${clubId})`)
    }
  }

  const wedDates = Array.from({ length: 12 }, (_, i) => addWeeks(nextWeekday(3), i)) // Wednesday
  const satDates = Array.from({ length: 12 }, (_, i) => addWeeks(nextWeekday(6), i)) // Saturday

  const baseRun = {
    club_id: clubId,
    timezone: "America/Chicago",
    distance: null,
    meeting_point: `Rotates — check ${CHECK_URL}`,
    city: "Minneapolis",
    run_lat: null,
    run_lng: null,
    tags: ["Social Run"],
    is_public: true,
    created_by: null,
  }

  const wedRuns = wedDates.map(d => ({
    ...baseRun,
    date: d,
    title: "Weekly Wednesday River Run",
    time: "18:00",
    description: `Social run, river loops (3-30 mi), drinks after. Location rotates — check ${CHECK_URL} for this week's spot.`,
  }))
  const satRuns = satDates.map(d => ({
    ...baseRun,
    date: d,
    title: "Weekly Saturday Run",
    time: "08:00",
    description: `Social run (1-30 mi), refreshments after. Location rotates — check ${CHECK_URL} for this week's spot.`,
  }))

  const allRuns = [...wedRuns, ...satRuns]

  if (DRY_RUN) {
    allRuns.forEach(r => console.log(`  WOULD INSERT RUN  ${r.date} ${r.time} — ${r.title}`))
    return
  }

  if (clubId !== "dry-run-id") {
    const { data: existingRuns } = await db.from("runs").select("date, title").eq("club_id", clubId)
    const existingKeys = new Set((existingRuns ?? []).map(r => `${r.date}|${r.title}`))
    const toInsert = allRuns.filter(r => !existingKeys.has(`${r.date}|${r.title}`))
    if (toInsert.length === 0) { console.log("All run dates already exist."); return }
    const { error } = await db.from("runs").insert(toInsert)
    if (error) { console.error("ERROR inserting runs:", error.message); process.exit(1) }
    console.log(`✓ Inserted ${toInsert.length} runs (${wedDates[0]} Wed start, ${satDates[0]} Sat start)`)
  }
}

main().catch(console.error)
