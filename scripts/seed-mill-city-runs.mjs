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

const HIGHLAND = { address: "767 Cleveland Ave S, Saint Paul, MN 55116", lat: 44.918374, lng: -93.187549, city: "Saint Paul" }
const NORTHEAST = { address: "411 E Hennepin Ave, Minneapolis, MN 55414", lat: 44.9934, lng: -93.2466, city: "Minneapolis" }

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

async function insertRuns(clubId, clubName, baseRun, dates) {
  if (clubId === "dry-run-id") {
    dates.forEach(d => console.log(`  WOULD INSERT RUN  ${clubName} — ${d} ${baseRun.time}`))
    return
  }
  const { data: existingRuns } = await db.from("runs").select("date").eq("club_id", clubId)
  const existingDates = new Set((existingRuns ?? []).map(r => r.date))
  const toInsert = dates.filter(d => !existingDates.has(d)).map(d => ({ ...baseRun, club_id: clubId, date: d }))
  if (toInsert.length === 0) { console.log(`  (all ${dates.length} run dates already exist for ${clubName})`); return }
  if (DRY_RUN) { toInsert.forEach(r => console.log(`  WOULD INSERT RUN  ${clubName} — ${r.date} ${r.time}`)); return }
  const { error } = await db.from("runs").insert(toInsert)
  if (error) { console.error(`  ERROR inserting runs for ${clubName}: ${error.message}`); return }
  console.log(`  ✓ Inserted ${toInsert.length} runs for ${clubName} (${toInsert[0].date} → ${toInsert[toInsert.length - 1].date})`)
}

async function upsertClub(record) {
  const { data: existing } = await db.from("clubs").select("id").ilike("name", record.name).maybeSingle()
  if (existing) { console.log(`SKIP (club exists) ${record.name} (${existing.id})`); return existing.id }
  if (DRY_RUN) { console.log(`WOULD CREATE CLUB  ${record.name}`); return "dry-run-id" }
  const { data, error } = await db.from("clubs").insert(record).select("id").single()
  if (error) { console.error(`ERROR creating club ${record.name}: ${error.message}`); return null }
  console.log(`✓ Created club ${record.name} (${data.id})`)
  return data.id
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN\n" : "")

  // ── 1. Monday Highland Run (existing club, St Paul) ────────────────────
  console.log("Mill City Running — Monday Highland Run")
  {
    const dates = Array.from({ length: 12 }, (_, i) => addWeeks(nextWeekday(1), i)) // Monday
    await insertRuns("7ba81642-60f7-421c-b702-1e2f4ac1f729", "Monday Highland Run", {
      title: "Monday Night Community Run",
      time: "18:00",
      timezone: "America/Chicago",
      distance: "2-7 mi",
      meeting_point: HIGHLAND.address,
      city: HIGHLAND.city,
      run_lat: HIGHLAND.lat,
      run_lng: HIGHLAND.lng,
      description: "Free weekly community run from the Highland store. Paces sub-7 to 13+ min/mi, walking groups available. Routes alternate between two route sets every other week.",
      tags: ["All Paces", "Beginner Friendly"],
      is_public: true,
      created_by: null,
    }, dates)
  }

  // ── 2. Tuesday Night Run (existing club, NE Minneapolis) ────────────────
  console.log("\nMill City Running — Tuesday Night Run")
  {
    const dates = Array.from({ length: 12 }, (_, i) => addWeeks(nextWeekday(2), i)) // Tuesday
    await insertRuns("93c78fab-57d5-4d5b-a629-4aa44e6298fd", "Tuesday Night Run", {
      title: "Tuesday Night Social Run",
      time: "18:00",
      timezone: "America/Chicago",
      distance: "2-7 mi",
      meeting_point: NORTHEAST.address,
      city: NORTHEAST.city,
      run_lat: NORTHEAST.lat,
      run_lng: NORTHEAST.lng,
      description: "Minneapolis's flagship weekly run, 75-100+ runners through Marcy-Holmes and the Minneapolis parks. Paces sub-7 to 13+ min/mi with walkers. Described as the most social run in Minneapolis.",
      tags: ["Social Run", "All Paces"],
      is_public: true,
      created_by: null,
    }, dates)
  }

  // ── 3. Friday Flapjack Run (new club, NE Minneapolis) ──────────────────
  console.log("\nMill City Running — Friday Flapjack Run")
  const fridayClubId = await upsertClub({
    name: "Mill City Running — Friday Flapjack Run",
    city: NORTHEAST.city,
    location: NORTHEAST.address,
    latitude: NORTHEAST.lat,
    longitude: NORTHEAST.lng,
    description: "Free Friday morning community run from Mill City Running's Northeast store, year-round. 2, 4, 5, or 7 mile route options, all paces welcome. Coffee served weekly, refreshments about monthly.",
    instagram_handle: "millcityrunning",
    website: "millcityrunning.com/weekly-schedule",
    contact_email: "info@millcityrunning.com",
    meeting_day: "Friday",
    tier: "free",
    is_public: true,
    membership_type: "free",
    bad_contact: false,
    user_id: null,
  })
  {
    const dates = Array.from({ length: 12 }, (_, i) => addWeeks(nextWeekday(5), i)) // Friday
    await insertRuns(fridayClubId, "Friday Flapjack Run", {
      title: "Friday Flapjack Run",
      time: "06:30",
      timezone: "America/Chicago",
      distance: "2-7 mi",
      meeting_point: NORTHEAST.address,
      city: NORTHEAST.city,
      run_lat: NORTHEAST.lat,
      run_lng: NORTHEAST.lng,
      description: "Early-morning run with coffee after, all paces welcome. Runs year-round.",
      tags: ["All Paces", "Beginner Friendly"],
      is_public: true,
      created_by: null,
    }, dates)
  }

  console.log("\nDone.")
}

main().catch(console.error)
