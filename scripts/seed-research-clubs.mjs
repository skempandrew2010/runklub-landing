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

// Nth-weekday-of-month dates (e.g. 1st & 3rd Thursday) for the given number of months forward, future-only
function nthWeekdaysOfMonths(targetDow, nths, monthsForward) {
  const dates = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cursor = new Date(today.getFullYear(), today.getMonth(), 1)
  for (let m = 0; m < monthsForward; m++) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    for (const n of nths) {
      const d = new Date(year, month, 1)
      let count = 0
      while (d.getMonth() === month) {
        if (d.getDay() === targetDow) {
          count++
          if (count === n) break
        }
        d.setDate(d.getDate() + 1)
      }
      if (d.getMonth() === month && d >= today) {
        dates.push(d.toISOString().slice(0, 10))
      }
    }
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return dates.sort()
}

async function upsertClub(record) {
  const { data: existing } = await db.from("clubs").select("id").ilike("name", record.name).maybeSingle()
  if (existing) {
    console.log(`  SKIP (club exists)  ${record.name}`)
    return existing.id
  }
  if (DRY_RUN) {
    console.log(`  WOULD CREATE CLUB  ${record.name}`)
    return "dry-run-id"
  }
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

  // ── 1. Del Sole Run Club ────────────────────────────────────────────────
  console.log("Del Sole Run Club")
  const delSoleAddress = "Bde Maka Ska Sand Volleyball Courts, Minneapolis, MN"
  const delSoleCoords = await geocode(delSoleAddress)
  if (delSoleCoords) console.log(`  Geocoded → ${delSoleCoords.lat.toFixed(5)}, ${delSoleCoords.lng.toFixed(5)}`)
  const delSoleId = await upsertClub({
    name: "Del Sole Run Club",
    city: "Minneapolis",
    location: delSoleAddress,
    latitude: delSoleCoords?.lat ?? null,
    longitude: delSoleCoords?.lng ?? null,
    description: "Weekly Saturday run at Bde Maka Ska, open to all levels — casual and inclusive.",
    instagram_handle: "delsolerunclub",
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
    await insertRuns(delSoleId, "Del Sole Run Club", {
      title: "Weekly Saturday Run",
      time: "11:00",
      timezone: "America/Chicago",
      distance: null,
      meeting_point: delSoleAddress,
      city: "Minneapolis",
      run_lat: delSoleCoords?.lat ?? null,
      run_lng: delSoleCoords?.lng ?? null,
      description: "Casual, all-levels weekly run at Bde Maka Ska.",
      tags: ["All Paces", "Beginner Friendly"],
      is_public: true,
      created_by: null,
    }, dates)
  }

  // ── 2. Cooldown Running — Minneapolis (separate chapter from the existing Denver club row) ──
  console.log("\nCooldown Running — Minneapolis")
  const cooldownId = await upsertClub({
    name: "Cooldown Running — Minneapolis",
    city: "Minneapolis",
    location: null,
    latitude: null,
    longitude: null,
    description: "Social run club, part of the multi-city Cooldown Running brand. Meeting spot announced weekly via Instagram — check @cooldownrunning for this week's location.",
    instagram_handle: "cooldownrunning",
    website: "https://cooldownrunning.com",
    meeting_day: "Monday",
    tier: "free",
    is_public: true,
    membership_type: "free",
    bad_contact: false,
    user_id: null,
  })
  {
    const startDate = nextWeekday(1) // Monday
    const dates = Array.from({ length: 12 }, (_, i) => addWeeks(startDate, i))
    await insertRuns(cooldownId, "Cooldown Running — Minneapolis", {
      title: "Weekly Monday Run",
      time: "18:30",
      timezone: "America/Chicago",
      distance: null,
      meeting_point: "Location announced weekly via Instagram @cooldownrunning",
      city: "Minneapolis",
      run_lat: null,
      run_lng: null,
      description: "Social run, 1-3 miles, any pace, drinks after. Meeting spot posted weekly on Instagram.",
      tags: ["Social Run", "All Paces"],
      is_public: true,
      created_by: null,
    }, dates)
  }

  // ── 3. RunBeerRepeat ─────────────────────────────────────────────────────
  console.log("\nRunBeerRepeat")
  const runBeerRepeatId = await upsertClub({
    name: "RunBeerRepeat",
    city: "Minneapolis",
    location: null,
    latitude: null,
    longitude: null,
    description: "Twin Cities social running and craft beer club. Meets the 1st and 3rd Thursday of each month; location rotates among Twin Cities breweries — check runbeerrepeat.com for the current spot.",
    instagram_handle: null,
    website: "https://runbeerrepeat.com",
    meeting_day: "1st & 3rd Thursday",
    tier: "free",
    is_public: true,
    membership_type: "free",
    bad_contact: false,
    user_id: null,
  })
  {
    const dates = nthWeekdaysOfMonths(4, [1, 3], 4) // Thursday=4, 1st & 3rd, next 4 months
    await insertRuns(runBeerRepeatId, "RunBeerRepeat", {
      title: "RunBeerRepeat — Twin Cities",
      time: "18:30",
      timezone: "America/Chicago",
      distance: null,
      meeting_point: "Rotates — check runbeerrepeat.com for this month's brewery",
      city: "Minneapolis",
      run_lat: null,
      run_lng: null,
      description: "Social run and craft beer meetup. Location rotates among Twin Cities breweries each time.",
      tags: ["Social Run"],
      is_public: true,
      created_by: null,
    }, dates)
  }

  console.log("\nDone.")
}

main().catch(console.error)
