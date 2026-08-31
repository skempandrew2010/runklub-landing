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

const ADDRESS = "1221 Theodore Wirth Parkway, Minneapolis, MN 55422"
const CITY = "Minneapolis"
const INSTAGRAM_HANDLE = "theoloopers"
const REPEAT_WEEKS = 12 // matches the app's "quick create weekly run" default

async function geocode(query) {
  if (!MAPBOX_TOKEN) return null
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
  const res = await fetch(url)
  const json = await res.json()
  const center = json?.features?.[0]?.center
  if (!center) return null
  return { lng: center[0], lat: center[1] }
}

function nextSaturday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = (6 - today.getDay() + 7) % 7 || 7 // next Saturday, never today
  today.setDate(today.getDate() + diff)
  return today.toISOString().slice(0, 10)
}

function addWeeks(dateStr, weeks) {
  const d = new Date(dateStr + "T00:00:00")
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const { data: clubs, error: findErr } = await db
    .from("clubs")
    .select("id, name, instagram_handle")
    .ilike("name", "%theo loopers%")

  if (findErr) { console.error(findErr.message); process.exit(1) }
  if (!clubs?.length) { console.error("No club matching 'theo loopers' found."); process.exit(1) }
  if (clubs.length > 1) { console.error("Multiple clubs matched:", clubs.map(c => c.name)); process.exit(1) }

  const club = clubs[0]
  console.log(`Found club: ${club.name} (${club.id})`)

  // ── Instagram handle ──────────────────────────────────────────────────────
  if (club.instagram_handle) {
    console.log(`  Instagram already set: @${club.instagram_handle} (leaving as-is)`)
  } else if (DRY_RUN) {
    console.log(`  WOULD SET instagram_handle → ${INSTAGRAM_HANDLE}`)
  } else {
    const { error } = await db.from("clubs").update({ instagram_handle: INSTAGRAM_HANDLE }).eq("id", club.id)
    if (error) console.error(`  ERROR setting instagram: ${error.message}`)
    else console.log(`  ✓ Set instagram_handle → ${INSTAGRAM_HANDLE}`)
  }

  // ── Geocode trailhead ─────────────────────────────────────────────────────
  const coords = await geocode(ADDRESS)
  if (!coords) console.log("  WARNING: geocoding failed, runs will be inserted without run_lat/run_lng")
  else console.log(`  Geocoded trailhead → ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`)

  // ── Weekly Saturday runs ──────────────────────────────────────────────────
  const startDate = nextSaturday()
  const dates = Array.from({ length: REPEAT_WEEKS }, (_, i) => addWeeks(startDate, i))

  const baseRun = {
    club_id: club.id,
    title: "Weekly Trail Run",
    time: "08:00",
    timezone: "America/Chicago",
    distance: null,
    meeting_point: ADDRESS,
    city: CITY,
    run_lat: coords?.lat ?? null,
    run_lng: coords?.lng ?? null,
    description: "Free, inclusive, all-paces, no-drop trail running run.",
    tags: ["Trail Run", "All Paces", "No Drop", "Beginner Friendly"],
    is_public: true,
    created_by: null,
  }

  console.log(`\n${DRY_RUN ? "DRY RUN — " : ""}Inserting ${dates.length} weekly runs starting ${startDate}...`)

  if (DRY_RUN) {
    dates.forEach(d => console.log(`  WOULD INSERT  ${d} 08:00`))
    return
  }

  const { error: insertErr } = await db.from("runs").insert(dates.map(d => ({ ...baseRun, date: d })))
  if (insertErr) { console.error(`  ERROR inserting runs: ${insertErr.message}`); process.exit(1) }
  console.log(`  ✓ Inserted ${dates.length} runs (${startDate} → ${dates[dates.length - 1]})`)
}

main().catch(console.error)
