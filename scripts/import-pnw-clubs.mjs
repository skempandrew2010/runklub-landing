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
const DRY_RUN      = process.argv.includes("--dry-run")
const JSON_PATH    = process.argv.find(a => a.endsWith(".json")) ?? "../pnw_run_clubs.json"

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

function parseContact(contact) {
  if (!contact) return { instagram_handle: null, website: null, contact_email: null }
  const igMatch = contact.match(/instagram\.com\/([^/,\s"?]+)/i)
  const instagram_handle = igMatch ? igMatch[1].replace(/\/$/, "").replace(/^@/, "") : null
  const urls = (contact.match(/https?:\/\/[^\s,]+/g) ?? []).map(u => u.replace(/[,)]+$/, ""))
  const website = urls.find(u => !u.includes("instagram.com")) ?? null
  const emailMatch = contact.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)
  const contact_email = emailMatch ? emailMatch[0] : null
  return { instagram_handle, website, contact_email }
}

function buildRecord(club) {
  const { instagram_handle, website, contact_email } = parseContact(club.contact)
  const description = [club.schedule, club.notes].filter(Boolean).join(" | ")
  return {
    name: club.name,
    city: club.city,
    location: club.location !== "Varies" && club.location !== "Varies (see website)" ? club.location : null,
    description: description || null,
    instagram_handle,
    website,
    contact_email,
    tier: "free",
    is_public: true,
    membership_type: "free",
    bad_contact: false,
    user_id: null,
  }
}

async function main() {
  const clubs = JSON.parse(readFileSync(JSON_PATH, "utf8"))
  console.log(`${DRY_RUN ? "DRY RUN — " : ""}Importing ${clubs.length} clubs...\n`)

  // Fetch existing names to skip duplicates
  const { data: existing } = await db.from("clubs").select("name")
  const existingNames = new Set((existing ?? []).map(c => c.name.toLowerCase().trim()))

  let inserted = 0, skipped = 0, errors = 0

  for (const club of clubs) {
    const record = buildRecord(club)
    const key = record.name.toLowerCase().trim()

    if (existingNames.has(key)) {
      console.log(`  SKIP (exists)  ${record.name}`)
      skipped++
      continue
    }

    if (DRY_RUN) {
      console.log(`  WOULD INSERT  ${record.name} — ${record.city}`)
      inserted++
      continue
    }

    const { error } = await db.from("clubs").insert(record)
    if (error) {
      console.error(`  ERROR  ${record.name}: ${error.message}`)
      errors++
    } else {
      console.log(`  ✓  ${record.name} — ${record.city}`)
      inserted++
    }
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped (duplicates), ${errors} errors`)
}

main().catch(console.error)
