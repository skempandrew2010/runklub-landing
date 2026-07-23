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

const SUPABASE_URL  = get("NEXT_PUBLIC_SUPABASE_URL")
const SERVICE_KEY   = get("SUPABASE_SERVICE_ROLE_KEY")
const MAPBOX_TOKEN  = get("NEXT_PUBLIC_MAPBOX_TOKEN")

if (!SUPABASE_URL || !SERVICE_KEY || !MAPBOX_TOKEN) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_MAPBOX_TOKEN")
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function geocode(query) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
  const res = await fetch(url)
  const json = await res.json()
  const center = json?.features?.[0]?.center
  if (!center) return null
  return { lng: center[0], lat: center[1] }
}

async function main() {
  // Fetch all clubs missing coordinates
  const { data: clubs, error } = await db
    .from("clubs")
    .select("id, name, city, location")
    .is("latitude", null)

  if (error) { console.error(error.message); process.exit(1) }
  if (!clubs?.length) { console.log("All clubs already have coordinates."); return }

  console.log(`Geocoding ${clubs.length} clubs...\n`)

  let updated = 0, failed = 0

  for (const club of clubs) {
    // Try the location address first, fall back to just city
    const query = (club.location && club.location !== "Varies") ? club.location : club.city
    if (!query) { console.log(`  SKIP (no address)  ${club.name}`); failed++; continue }

    try {
      const coords = await geocode(query)
      if (!coords) {
        // Try city as fallback if address failed
        const fallback = club.city ? await geocode(club.city) : null
        if (!fallback) {
          console.log(`  MISS  ${club.name} — "${query}"`)
          failed++
          continue
        }
        await db.from("clubs").update({ latitude: fallback.lat, longitude: fallback.lng }).eq("id", club.id)
        console.log(`  ✓ (city fallback)  ${club.name} → ${fallback.lat.toFixed(4)}, ${fallback.lng.toFixed(4)}`)
        updated++
      } else {
        await db.from("clubs").update({ latitude: coords.lat, longitude: coords.lng }).eq("id", club.id)
        console.log(`  ✓  ${club.name} → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`)
        updated++
      }
    } catch (err) {
      console.error(`  ERROR  ${club.name}: ${err.message}`)
      failed++
    }

    // Respect Mapbox rate limits
    await new Promise((r) => setTimeout(r, 60))
  }

  console.log(`\nDone: ${updated} geocoded, ${failed} failed`)
}

main().catch(console.error)
