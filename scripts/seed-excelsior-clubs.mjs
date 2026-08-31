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
const MAPBOX_TOKEN  = get("NEXT_PUBLIC_MAPBOX_TOKEN")
const DRY_RUN      = process.argv.includes("--dry-run")

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const ADDRESS = "218 Water St, Excelsior, MN 55331"

async function geocode(query) {
  if (!MAPBOX_TOKEN) return null
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
  const res = await fetch(url)
  const json = await res.json()
  const center = json?.features?.[0]?.center
  if (!center) return null
  return { lng: center[0], lat: center[1] }
}

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

async function upsertClub(record) {
  const { data: existing } = await db.from("clubs").select("id").ilike("name", record.name).maybeSingle()
  if (existing) { console.log(`  SKIP (club exists)  ${record.name}`); return existing.id }
  if (DRY_RUN) { console.log(`  WOULD CREATE CLUB  ${record.name}`); return "dry-run-id" }
  const { data, error } = await db.from("clubs").insert(record).select("id").single()
  if (error) { console.error(`  ERROR creating club ${record.name}: ${error.message}`); return null }
  console.log(`  ✓ Created club  ${record.name} (${data.id})`)
  return data.id
}

async function insertRuns(clubId, clubName, baseRun, dates) {
  if (!clubId || clubId === "dry-run-id") {
    if (DRY_RUN) dates.forEach(d => console.log(`    WOULD INSERT RUN  ${clubName} — ${d} ${baseRun.time}`))
    return
  }
  const { data: existingRuns } = await db.from("runs").select("date").eq("club_id", clubId)
  const existingDates = new Set((existingRuns ?? []).map(r => r.date))
  const toInsert = dates.filter(d => !existingDates.has(d)).map(d => ({ ...baseRun, club_id: clubId, date: d }))
  if (toInsert.length === 0) { console.log(`    (all ${dates.length} run dates already exist)`); return }
  if (DRY_RUN) { toInsert.forEach(r => console.log(`    WOULD INSERT RUN  ${clubName} — ${r.date} ${r.time}`)); return }
  const { error } = await db.from("runs").insert(toInsert)
  if (error) { console.error(`    ERROR inserting runs for ${clubName}: ${error.message}`); return }
  console.log(`    ✓ Inserted ${toInsert.length} runs (${toInsert[0].date} → ${toInsert[toInsert.length - 1].date})`)
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN\n" : "")
  const coords = await geocode(ADDRESS)
  if (coords) console.log(`Geocoded ${ADDRESS} → ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}\n`)

  // ── 1. The Lakes Running Co Run Club (Thursday) ─────────────────────────
  console.log("The Lakes Running Co Run Club")
  const lakesId = await upsertClub({
    name: "The Lakes Running Co Run Club",
    city: "Excelsior",
    location: ADDRESS,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
    description: "Weekly Thursday night group run hosted by The Lakes Running Co specialty running store. All paces, all distances, no registration required. On the third Thursday of the month the run starts earlier (5:30pm) so the group can head to Trivia Night at Excelsior Brewing Co. afterward.",
    instagram_handle: "lakesrunningco",
    website: "https://www.lakesrun.com/",
    contact_email: "lakesrunningco@gmail.com",
    meeting_day: "Thursday",
    tier: "free",
    is_public: true,
    membership_type: "free",
    bad_contact: false,
    user_id: null,
  })
  {
    const startDate = nextWeekday(4) // Thursday
    const dates = Array.from({ length: 12 }, (_, i) => addWeeks(startDate, i))
    await insertRuns(lakesId, "The Lakes Running Co Run Club", {
      title: "Thursday Night Jogging Club",
      time: "18:00",
      timezone: "America/Chicago",
      distance: null,
      meeting_point: ADDRESS,
      city: "Excelsior",
      run_lat: coords?.lat ?? null,
      run_lng: coords?.lng ?? null,
      description: "Scenic routes around Excelsior, local lakes, and the Lake Minnetonka LRT Regional Trail. All paces welcome. Note: on the 3rd Thursday of the month this run starts at 5:30pm instead, ahead of Trivia Night at Excelsior Brewing Co.",
      tags: ["Social Run", "All Paces", "Beginner Friendly"],
      is_public: true,
      created_by: null,
    }, dates)
  }

  // ── 2. RunWEST (Saturday) ────────────────────────────────────────────────
  console.log("\nRunWEST")
  const runwestId = await upsertClub({
    name: "RunWEST",
    city: "Excelsior",
    location: ADDRESS,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
    description: "Southwest metro Saturday morning group run, meeting at The Lakes Running Co. Routes are laid out as several 2-4 mile loops back to the start, so runners can do as many or as few as they like. All experience levels welcome; coffee/breakfast after.",
    instagram_handle: null,
    website: "https://www.runwestmn.com/",
    meeting_day: "Saturday",
    tier: "free",
    is_public: true,
    membership_type: "free",
    bad_contact: false,
    user_id: null,
  })
  {
    const startDate = nextWeekday(6) // Saturday
    const dates = Array.from({ length: 12 }, (_, i) => addWeeks(startDate, i))
    await insertRuns(runwestId, "RunWEST", {
      title: "RunWEST Saturday Group Run",
      time: "07:30",
      timezone: "America/Chicago",
      distance: null,
      meeting_point: ADDRESS,
      city: "Excelsior",
      run_lat: coords?.lat ?? null,
      run_lng: coords?.lng ?? null,
      description: "Clover-leaf route of 2-4 mile loops returning to the start. Doors open 7:15am, run starts 7:30am. All levels welcome, 15-30 regulars.",
      tags: ["Social Run", "All Paces"],
      is_public: true,
      created_by: null,
    }, dates)
  }

  console.log("\nDone.")
}

main().catch(console.error)
