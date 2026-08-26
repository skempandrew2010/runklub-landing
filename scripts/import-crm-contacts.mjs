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
const CSV_PATH     = process.argv.find(a => a.endsWith(".csv"))

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}
if (!CSV_PATH) {
  console.error("Usage: node scripts/import-crm-contacts.mjs <path-to-file.csv> [--dry-run]")
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// Minimal CSV parser — handles quoted fields, escaped "" quotes, and commas/newlines inside quotes.
function parseCSV(text) {
  const rows = []
  let row = [], field = "", inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else { field += c }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ",") {
      row.push(field); field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field); field = ""
      if (row.some(f => f !== "")) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row) }
  return rows
}

function buildRecord(headers, cells) {
  const get = (name) => {
    const idx = headers.indexOf(name)
    const v = idx === -1 ? "" : (cells[idx] ?? "").trim()
    return v || null
  }
  return {
    club_name: get("club_name"),
    contact_name: get("contact_name"),
    email: get("email"),
    notes: get("notes"),
    status: "cold",
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Maps this outreach list's free-text Status column to our enum.
// "contacted M/D" also seeds last_touch_date (and next_followup_date, +5d,
// mirroring the dashboard's "Mark contacted" action) so the reminder list
// is useful immediately instead of every row landing on the same null date.
function mapStatus(raw) {
  const trimmed = (raw || "").trim()
  const lower = trimmed.toLowerCase()

  if (!trimmed || lower.startsWith("not contacted") || lower.startsWith("not verified")) {
    return { status: "cold", last_touch_date: null, next_followup_date: null, rawNote: null }
  }
  if (lower.includes("meeting scheduled")) {
    return { status: "booked", last_touch_date: null, next_followup_date: null, rawNote: null }
  }
  const dateMatch = lower.match(/contacted\s+(\d{1,2})\/(\d{1,2})/)
  if (dateMatch) {
    const [, m, d] = dateMatch
    const year = new Date().getFullYear()
    const lastTouch = new Date(Date.UTC(year, Number(m) - 1, Number(d)))
    const nextFollowup = new Date(lastTouch)
    nextFollowup.setUTCDate(nextFollowup.getUTCDate() + 5)
    const fmt = (dt) => dt.toISOString().slice(0, 10)
    return { status: "contacted", last_touch_date: fmt(lastTouch), next_followup_date: fmt(nextFollowup), rawNote: null }
  }
  if (lower.includes("contacted")) {
    return { status: "contacted", last_touch_date: null, next_followup_date: null, rawNote: null }
  }
  return { status: "cold", last_touch_date: null, next_followup_date: null, rawNote: trimmed }
}

// This outreach list's actual columns: Priority, Club/Program, Store/Parent,
// City/State, Segment, Structure, Website, Phone, Email, Contact Name, Status
function buildOutreachRecord(headers, cells) {
  const get = (name) => {
    const idx = headers.indexOf(name)
    const v = idx === -1 ? "" : (cells[idx] ?? "").trim()
    return v || null
  }

  const clubName = get("club/program")
  let email = get("email")
  let contactName = get("contact name")

  if (email && !EMAIL_RE.test(email)) email = null
  if (contactName && EMAIL_RE.test(contactName)) {
    if (!email) email = contactName
    contactName = null
  }

  const website = get("website")
  const cityState = get("city/state")
  const notes = [
    website ? `Website: ${website}` : null,
    cityState ? `Location: ${cityState}` : null,
  ].filter(Boolean).join("\n") || null

  const { status, last_touch_date, next_followup_date, rawNote } = mapStatus(get("status"))
  const finalNotes = rawNote
    ? [notes, `Raw status: ${rawNote}`].filter(Boolean).join("\n")
    : notes

  return {
    club_name: clubName,
    contact_name: contactName,
    email,
    phone: get("phone"),
    notes: finalNotes,
    status,
    last_touch_date,
    next_followup_date,
    source: "outreach-list-import",
  }
}

async function main() {
  const rows = parseCSV(readFileSync(CSV_PATH, "utf8"))
  const headers = rows[0].map(h => h.trim().toLowerCase())
  const dataRows = rows.slice(1)
  const isOutreachList = headers.includes("club/program")
  const build = isOutreachList ? buildOutreachRecord : buildRecord
  console.log(`${DRY_RUN ? "DRY RUN — " : ""}Importing ${dataRows.length} contacts from ${CSV_PATH} (${isOutreachList ? "outreach-list" : "generic"} format)...\n`)

  const { data: existing, error: fetchError } = await db.from("contacts").select("club_name, email")
  if (fetchError) {
    console.error(`Failed to fetch existing contacts: ${fetchError.message}`)
    process.exit(1)
  }
  const existingKeys = new Set(
    (existing ?? []).map(c => (c.email || c.club_name || "").toLowerCase().trim())
  )

  let inserted = 0, skipped = 0, errors = 0

  for (const cells of dataRows) {
    const record = build(headers, cells)
    if (!record.club_name || record.club_name === "#ERROR!") {
      console.log(`  SKIP (no usable club_name)  ${JSON.stringify(cells)}`)
      skipped++
      continue
    }

    const key = (record.email || record.club_name).toLowerCase().trim()
    if (existingKeys.has(key)) {
      console.log(`  SKIP (exists)  ${record.club_name}${record.email ? ` <${record.email}>` : ""}`)
      skipped++
      continue
    }

    if (DRY_RUN) {
      console.log(`  WOULD INSERT  ${record.club_name}${record.email ? ` <${record.email}>` : ""}`)
      inserted++
      continue
    }

    const { error } = await db.from("contacts").insert(record)
    if (error) {
      console.error(`  ERROR  ${record.club_name}: ${error.message}`)
      errors++
    } else {
      console.log(`  ✓  ${record.club_name}${record.email ? ` <${record.email}>` : ""}`)
      inserted++
    }
    existingKeys.add(key)
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped (duplicates/invalid), ${errors} errors`)
}

main().catch(console.error)
