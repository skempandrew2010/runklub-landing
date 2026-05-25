import { createClient } from "@supabase/supabase-js"
import type { Metadata } from "next"
import Link from "next/link"
import ClubPageClient from "./ClubPageClient"

export const revalidate = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

type Props = { params: Promise<{ clubId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clubId } = await params
  const { data: club } = await getSupabase()
    .from("clubs")
    .select("name, city, description, image_url")
    .eq("id", clubId)
    .maybeSingle()

  if (!club) return { title: "Club Not Found" }

  const title = `${club.name}${club.city ? ` · ${club.city}` : ""}`
  const description =
    club.description ??
    `Join ${club.name} on RunKlub${club.city ? ` in ${club.city}` : ""}. Find upcoming runs, follow the club, and connect with other runners.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: club.image_url ? [{ url: club.image_url }] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: club.image_url ? [club.image_url] : [],
    },
  }
}

export default async function ClubPage({ params }: Props) {
  const { clubId } = await params
  // Subtract 1 day so users in UTC-behind timezones don't lose today's runs
  // when the Vercel server's UTC clock has already rolled to the next date.
  // ClubPageClient filters the extra day back out on the client with localDateStr().
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  const [{ data: club }, { data: runs }, { count: memberCount }] = await Promise.all([
    getSupabase()
      .from("clubs")
      .select("id, name, city, location, description, instagram_handle, image_url, tier, is_public, user_id")
      .eq("id", clubId)
      .maybeSingle(),
    getSupabase()
      .from("runs")
      .select("id, title, date, time, distance, meeting_point, tags")
      .eq("club_id", clubId)
      .eq("is_public", true)
      .gte("date", today)
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .limit(10),
    getSupabase()
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId),
  ])

  if (!club) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex flex-col items-center justify-center gap-3">
        <p className="text-white/40 text-sm">Club not found.</p>
        <Link href="/" className="text-[#c5f135] text-sm font-semibold hover:underline">
          ← Discover clubs
        </Link>
      </div>
    )
  }

  const isClaimed = club.user_id !== null

  return (
    <ClubPageClient
      club={club}
      runs={runs ?? []}
      memberCount={memberCount ?? 0}
      isClaimed={isClaimed}
    />
  )
}
