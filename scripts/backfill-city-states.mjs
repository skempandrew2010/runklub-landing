// One-off backfill: resolve each city's US state from its stored lat/lng via
// Mapbox reverse geocoding, since ~60% of cities.state is null today.
//
// Usage:
//   node scripts/backfill-city-states.mjs            (dry run — report only)
//   node scripts/backfill-city-states.mjs --apply     (writes state for clean matches only)
//
// Cities where Mapbox's resolved place name doesn't fuzzy-match our stored
// name are never auto-applied — they're printed under MISMATCH for manual
// review, since a wrong lat/lng would otherwise silently assign the wrong
// state to a real city.

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  const path = join(__dirname, "..", ".env.local")
  const text = readFileSync(path, "utf8")
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}
loadEnvLocal()

const APPLY = process.argv.includes("--apply")

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z]/g, "")
}

// Cities whose exact name doesn't literal-match Mapbox's resolved place
// (usually because the coordinate points at a neighboring town/suburb) but
// whose resolved STATE is still correct and safe to apply — verified by hand
// against the surrounding cluster of nearby cities in this same dataset.
const TRUST_STATE_DESPITE_NAME_MISMATCH = new Set([
  "Austin", "Bellevue/Redmond", "Boise/Meridian", "Los Angeles", "Minneapolis", "Woodland",
])

// Cities where the resolved state is genuinely wrong — the stored lat/lng
// points at a same-named town in a different part of the US entirely. These
// are never auto-applied; state stays null until lat/lng is corrected.
const KNOWN_BAD_COORDS = new Set([
  "Auburn", "Concord", "Cool", "Piedmont", "Saratoga", "Tucson",
])

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function reverseGeocode(lat, lng) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,region&access_token=${MAPBOX_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Mapbox ${res.status}`)
  const json = await res.json()
  const place = json.features?.find((f) => f.place_type?.includes("place"))
  const region = json.features?.find((f) => f.place_type?.includes("region"))
  const regionShortCode = region?.properties?.short_code?.toLowerCase() // e.g. "US-CA" -> "us-ca"
  const stateAbbr = regionShortCode?.startsWith("us-") ? regionShortCode.slice(3).toUpperCase() : null
  return { placeName: place?.text ?? null, regionName: region?.text ?? null, stateAbbr }
}

async function main() {
  const { data: cities, error } = await supabase
    .from("cities")
    .select("id, name, state, lat, lng")
    .order("name")
  if (error) throw error

  const clean = []
  const mismatched = []
  const skipped = []

  for (const city of cities) {
    if (city.lat == null || city.lng == null) {
      skipped.push({ name: city.name, reason: "no lat/lng" })
      continue
    }
    try {
      const { placeName, regionName, stateAbbr } = await reverseGeocode(city.lat, city.lng)
      const nameMatches = placeName && normalize(placeName) === normalize(city.name)
      const row = { id: city.id, name: city.name, currentState: city.state, resolvedPlace: placeName, resolvedState: stateAbbr, resolvedRegionName: regionName }
      if (KNOWN_BAD_COORDS.has(city.name)) mismatched.push(row)
      else if (stateAbbr && (nameMatches || TRUST_STATE_DESPITE_NAME_MISMATCH.has(city.name))) clean.push(row)
      else mismatched.push(row)
    } catch (e) {
      skipped.push({ name: city.name, reason: String(e.message || e) })
    }
    await sleep(120) // stay well under Mapbox rate limits
  }

  console.log(`\n=== CLEAN MATCHES (${clean.length}) — name matches Mapbox place name ===`)
  for (const r of clean) {
    const changed = r.currentState !== r.resolvedState
    console.log(`${changed ? "* " : "  "}${r.name.padEnd(20)} current=${String(r.currentState).padEnd(6)} resolved=${r.resolvedState}`)
  }

  console.log(`\n=== MISMATCH — needs manual review (${mismatched.length}) ===`)
  for (const r of mismatched) {
    console.log(`  ${r.name.padEnd(20)} stored-current-state=${String(r.currentState).padEnd(6)} mapbox-says=${r.resolvedPlace}, ${r.resolvedRegionName} (${r.resolvedState})`)
  }

  if (skipped.length) {
    console.log(`\n=== SKIPPED (${skipped.length}) ===`)
    for (const r of skipped) console.log(`  ${r.name}: ${r.reason}`)
  }

  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN — pass --apply to write"}: ${clean.filter(r => r.currentState !== r.resolvedState).length} state updates for clean matches.`)

  if (APPLY) {
    for (const r of clean) {
      if (r.currentState === r.resolvedState) continue
      const { error: updErr } = await supabase.from("cities").update({ state: r.resolvedState }).eq("id", r.id)
      if (updErr) console.error(`  FAILED ${r.name}:`, updErr.message)
      else console.log(`  updated ${r.name} -> ${r.resolvedState}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
