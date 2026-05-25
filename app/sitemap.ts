import { createClient } from "@supabase/supabase-js"
import type { MetadataRoute } from "next"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://runklub.fit"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/explore`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
  ]

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: clubs } = await supabase
      .from("clubs")
      .select("id, updated_at")
      .eq("is_public", true)

    const clubUrls: MetadataRoute.Sitemap = (clubs ?? []).map((club) => ({
      url: `${BASE_URL}/clubs/${club.id}`,
      lastModified: new Date(club.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))

    return [...base, ...clubUrls]
  } catch {
    return base
  }
}
