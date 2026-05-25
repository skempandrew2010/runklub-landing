import { createClient } from "@supabase/supabase-js"
import type { MetadataRoute } from "next"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://runkub.com"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, updated_at")
    .eq("is_public", true)

  const clubUrls: MetadataRoute.Sitemap = (clubs ?? []).map((club) => ({
    url: `${BASE_URL}/clubs/${club.id}`,
    lastModified: new Date(club.updated_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }))

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...clubUrls,
  ]
}
