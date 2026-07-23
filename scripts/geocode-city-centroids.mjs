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

const db = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } })
const MAPBOX_TOKEN = get("NEXT_PUBLIC_MAPBOX_TOKEN")

// Cache city lookups so we don't re-geocode the same city repeatedly
const cityCache = {}

async function geocodeCity(city) {
  if (cityCache[city] !== undefined) return cityCache[city]
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(city)}.json?access_token=${MAPBOX_TOKEN}&limit=1&types=place,locality&country=US`
  const res = await fetch(url)
  const json = await res.json()
  const center = json?.features?.[0]?.center
  const result = center ? { lat: center[1], lng: center[0] } : null
  cityCache[city] = result
  return result
}

async function main() {
  const { data: clubs } = await db
    .from("clubs")
    .select("id, name, city")
    .is("user_id", null)
    .is("latitude", null)

  console.log(`Geocoding ${clubs?.length ?? 0} clubs by city centroid...\n`)

  let ok = 0, fail = 0

  for (const club of (clubs ?? [])) {
    if (!club.city) { console.log(`  SKIP (no city)  ${club.name}`); fail++; continue }

    const coords = await geocodeCity(club.city)
    if (!coords) {
      console.log(`  MISS  ${club.name} — "${club.city}"`)
      fail++
      await new Promise(r => setTimeout(r, 60))
      continue
    }

    await db.from("clubs").update({ latitude: coords.lat, longitude: coords.lng }).eq("id", club.id)
    console.log(`  ✓  ${club.name} (${club.city}) → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`)
    ok++
    // Only delay when we actually hit the API (cache hits are free)
    if (!cityCache[club.city]) await new Promise(r => setTimeout(r, 60))
  }

  console.log(`\nDone: ${ok} updated, ${fail} failed`)
}

main().catch(console.error)
