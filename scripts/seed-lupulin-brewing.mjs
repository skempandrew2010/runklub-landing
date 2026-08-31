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

const ADDRESS = "570 Humboldt Dr Ste 107, Big Lake, MN 55309"

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

async function main() {
  const coords = await geocode(ADDRESS)
  if (coords) console.log(`Geocoded ${ADDRESS} → ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`)

  const { data: existing } = await db.from("clubs").select("id").ilike("name", "Lupulin Brewing Company Running Club").maybeSingle()
  let clubId
  if (existing) {
    console.log(`Club already exists (${existing.id})`)
    clubId = existing.id
  } else {
    const record = {
      name: "Lupulin Brewing Company Running Club",
      city: "Big Lake",
      location: ADDRESS,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      description: "Weekly Wednesday running club at Lupulin Brewing's Big Lake taproom. Standard route is 4.5 miles around the lake, but there's no distance requirement — all ages and experience levels welcome, walking is fine too. Free pour or soda on the house when you get back to the taproom (one per person).",
      instagram_handle: "lupulin_brewing",
      website: "https://www.lupulinbrewing.com/running-club",
      contact_email: null,
      meeting_day: "Wednesday",
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
      console.log(`✓ Created club Lupulin Brewing Company Running Club (${clubId})`)
    }
  }

  const dates = Array.from({ length: 12 }, (_, i) => addWeeks(nextWeekday(3), i)) // Wednesday

  const runs = dates.map(d => ({
    club_id: clubId,
    date: d,
    title: "Wednesday Night Run + Beer After",
    time: "18:00",
    timezone: "America/Chicago",
    distance: "4.5 mi (no requirement)",
    meeting_point: ADDRESS,
    city: "Big Lake",
    run_lat: coords?.lat ?? null,
    run_lng: coords?.lng ?? null,
    description: "Social run around the lake, all paces and beginners welcome — you don't even have to run. Free pour or soda on the house back at the taproom afterward.",
    tags: ["Social Run", "All Paces", "Beginner Friendly", "Beer After"],
    is_public: true,
    created_by: null,
  }))

  if (DRY_RUN) {
    runs.forEach(r => console.log(`  WOULD INSERT RUN  ${r.date} ${r.time} — ${r.title}`))
    return
  }

  if (clubId !== "dry-run-id") {
    const { data: existingRuns } = await db.from("runs").select("date, title").eq("club_id", clubId)
    const existingKeys = new Set((existingRuns ?? []).map(r => `${r.date}|${r.title}`))
    const toInsert = runs.filter(r => !existingKeys.has(`${r.date}|${r.title}`))
    if (toInsert.length === 0) { console.log("All run dates already exist."); return }
    const { error } = await db.from("runs").insert(toInsert)
    if (error) { console.error("ERROR inserting runs:", error.message); process.exit(1) }
    console.log(`✓ Inserted ${toInsert.length} runs (${dates[0]} → ${dates[dates.length - 1]})`)
  }
}

main().catch(console.error)
