import { readFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"

const env = {}
try {
  readFileSync(".env.local", "utf8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=")
    if (key && rest.length) env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "")
  })
} catch {}
const get = (k) => env[k] ?? process.env[k]

const SUPABASE_URL = get("NEXT_PUBLIC_SUPABASE_URL")
const SERVICE_KEY  = get("SUPABASE_SERVICE_ROLE_KEY")
const MAPBOX_TOKEN = get("NEXT_PUBLIC_MAPBOX_TOKEN")

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// Bounding box covering OR, WA, ID, MT
const BOUNDS = { minLat: 41.5, maxLat: 49.5, minLng: -124.8, maxLng: -104.0 }
const inBounds = (lat, lng) => lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat && lng >= BOUNDS.minLng && lng <= BOUNDS.maxLng

async function geocode(query) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=US`
  const res = await fetch(url)
  const json = await res.json()
  const center = json?.features?.[0]?.center
  return center ? { lng: center[0], lat: center[1] } : null
}

async function main() {
  // Get all no-user clubs — the PNW batch we just imported
  const { data: clubs } = await db
    .from("clubs")
    .select("id, name, city, location, latitude, longitude")
    .is("user_id", null)
    .not("latitude", "is", null)

  // Find clubs with wrong coordinates (outside PNW bounding box)
  const wrong = (clubs ?? []).filter(c => !inBounds(c.latitude, c.longitude))
  const alreadyRight = (clubs ?? []).filter(c => inBounds(c.latitude, c.longitude))

  console.log(`Total seeded clubs: ${clubs?.length ?? 0}`)
  console.log(`Already correct:    ${alreadyRight.length}`)
  console.log(`Need fixing:        ${wrong.length}\n`)

  let fixed = 0, failed = 0

  for (const club of wrong) {
    // Strategy 1: address + city (gives Mapbox geographic context)
    const hasAddr = club.location && !["Varies", "Varies (see website)", "N/A — umbrella organization"].some(v => club.location?.includes(v))
    const addrQuery = hasAddr ? `${club.location}, ${club.city}` : club.city

    let coords = await geocode(addrQuery)
    let strategy = "address+city"

    if (!coords || !inBounds(coords.lat, coords.lng)) {
      // Strategy 2: just city
      coords = await geocode(club.city)
      strategy = "city only"
    }

    if (!coords || !inBounds(coords.lat, coords.lng)) {
      console.log(`  FAIL  ${club.name} (${club.city}) — no valid coords found`)
      failed++
      await new Promise(r => setTimeout(r, 60))
      continue
    }

    await db.from("clubs").update({ latitude: coords.lat, longitude: coords.lng }).eq("id", club.id)
    console.log(`  ✓ [${strategy}]  ${club.name} → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`)
    fixed++
    await new Promise(r => setTimeout(r, 60))
  }

  console.log(`\nDone: ${fixed} fixed, ${failed} still failed`)
}

main().catch(console.error)
