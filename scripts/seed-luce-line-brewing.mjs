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

const ADDRESS = "12901 16th Ave N, Plymouth, MN 55441"

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

  const { data: existing } = await db.from("clubs").select("id").ilike("name", "Luce Line Brewing Running Club").maybeSingle()
  let clubId
  if (existing) {
    console.log(`Club already exists (${existing.id})`)
    clubId = existing.id
  } else {
    const record = {
      name: "Luce Line Brewing Running Club",
      city: "Plymouth",
      location: ADDRESS,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      description: "Weekly running club hosted at Luce Line Brewing. All paces and experience levels welcome, including first-timers — no sign-up or commitment required, just show up. Post-run drink specials (including non-beer options) at the taproom.",
      instagram_handle: "lucelinebrewing",
      website: "https://lucelinebrewing.com/running-club/",
      contact_email: null,
      meeting_day: "Tuesday & Saturday",
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
      console.log(`✓ Created club Luce Line Brewing Running Club (${clubId})`)
    }
  }

  const tueDates = Array.from({ length: 12 }, (_, i) => addWeeks(nextWeekday(2), i)) // Tuesday
  const satDates = Array.from({ length: 12 }, (_, i) => addWeeks(nextWeekday(6), i)) // Saturday

  const baseRun = {
    club_id: clubId,
    timezone: "America/Chicago",
    distance: null,
    meeting_point: ADDRESS,
    city: "Plymouth",
    run_lat: coords?.lat ?? null,
    run_lng: coords?.lng ?? null,
    is_public: true,
    created_by: null,
  }

  const tueRuns = tueDates.map(d => ({
    ...baseRun,
    date: d,
    title: "Tuesday Night Run + Beers",
    time: "18:00",
    description: "Social run starting and ending at the brewery, all paces welcome. Post-run drink specials (including non-beer options) after.",
    tags: ["Social Run", "All Paces", "Beer After"],
  }))
  const satRuns = satDates.map(d => ({
    ...baseRun,
    date: d,
    title: "Saturday Morning Run",
    time: "09:30",
    description: "Social run starting and ending at the brewery, all paces welcome.",
    tags: ["Social Run", "All Paces"],
  }))

  const allRuns = [...tueRuns, ...satRuns]

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
    console.log(`✓ Inserted ${toInsert.length} runs (Tue start ${tueDates[0]}, Sat start ${satDates[0]})`)
  }
}

main().catch(console.error)
