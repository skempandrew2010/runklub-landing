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

const VAGUE = ["varies", "rotating", "various", "n/a", "see website", "see instagram", "see facebook", "tbd", "check ", "citywide", "umbrella"]

function hasRealAddress(location) {
  if (!location) return false
  const lo = location.toLowerCase()
  if (VAGUE.some(v => lo.includes(v))) return false
  // Must contain a street number (digit followed by space + word)
  return /\d+\s+[a-z]/i.test(location)
}

async function geocode(query) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=US`
  const res = await fetch(url)
  const json = await res.json()
  const feature = json?.features?.[0]
  if (!feature) return null
  const [lng, lat] = feature.center
  return { lat, lng }
}

async function main() {
  const { data: clubs } = await db
    .from("clubs")
    .select("id, name, city, location")
    .is("user_id", null)
    .is("latitude", null)

  const withAddr = (clubs ?? []).filter(c => hasRealAddress(c.location))
  const withoutAddr = (clubs ?? []).length - withAddr.length

  console.log(`Total unclaimed clubs: ${(clubs ?? []).length}`)
  console.log(`With real address:     ${withAddr.length} — will geocode`)
  console.log(`Vague/rotating:        ${withoutAddr} — will stay null\n`)

  let ok = 0, fail = 0

  for (const club of withAddr) {
    // Use "address, city" for context
    const query = `${club.location}, ${club.city}`
    const coords = await geocode(query)

    if (!coords) {
      console.log(`  MISS  ${club.name}`)
      fail++
    } else {
      await db.from("clubs").update({ latitude: coords.lat, longitude: coords.lng }).eq("id", club.id)
      console.log(`  ✓  ${club.name} → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`)
      ok++
    }

    await new Promise(r => setTimeout(r, 60))
  }

  console.log(`\nDone: ${ok} geocoded, ${fail} missed, ${withoutAddr} left null (no address)`)
}

main().catch(console.error)
