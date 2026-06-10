/**
 * One-time script: downloads all external club logo URLs and re-uploads
 * them to Supabase Storage, then updates image_url in the clubs table.
 *
 * Run once:  node scripts/migrate-club-images.mjs
 * Requires:  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { extname } from "path"

// Load .env.local manually
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split("=").map((s) => s.trim()))
)

const supabaseUrl = env["NEXT_PUBLIC_SUPABASE_URL"]
const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"]

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

async function run() {
  const { data: clubs, error } = await supabase
    .from("clubs")
    .select("id, name, image_url")
    .not("image_url", "is", null)
    .not("image_url", "like", `${supabaseUrl}%`)

  if (error) { console.error(error); process.exit(1) }
  console.log(`Found ${clubs.length} clubs with external image URLs\n`)

  for (const club of clubs) {
    const url = club.image_url
    console.log(`Downloading: ${club.name}`)
    console.log(`  URL: ${url}`)

    try {
      const res = await fetch(url)
      if (!res.ok) { console.log(`  ✗ HTTP ${res.status} — skipping\n`); continue }

      const contentType = res.headers.get("content-type") ?? "image/jpeg"
      const ext = extname(new URL(url).pathname).replace(".", "") || contentType.split("/")[1]?.split(";")[0] || "jpg"
      const buffer = Buffer.from(await res.arrayBuffer())
      const path = `seeded/${club.id}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("club-images")
        .upload(path, buffer, { contentType, upsert: true })

      if (uploadError) { console.log(`  ✗ Upload failed: ${uploadError.message}\n`); continue }

      const { data: { publicUrl } } = supabase.storage.from("club-images").getPublicUrl(path)
      await supabase.from("clubs").update({ image_url: publicUrl }).eq("id", club.id)
      console.log(`  ✓ Uploaded → ${publicUrl}\n`)
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}\n`)
    }
  }

  console.log("Done. You can now revert next.config.ts img-src and remotePatterns back to https://*.supabase.co only.")
}

run()
