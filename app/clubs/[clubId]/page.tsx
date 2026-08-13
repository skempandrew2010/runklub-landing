import { createClient } from "@supabase/supabase-js"
import type { Metadata } from "next"
import Link from "next/link"
import ClubPageClient from "./ClubPageClient"
import { runStartInstant } from "@/lib/timezone"

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

  if (!club) return { title: "Klub Not Found" }

  const title = `${club.name}${club.city ? ` · ${club.city}` : ""}`
  const description =
    club.description ??
    `Join ${club.name} on RunKlub${club.city ? ` in ${club.city}` : ""}. Find upcoming runs, follow the klub, and connect with other runners.`

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
      .select("id, name, city, location, description, instagram_handle, image_url, tier, is_public, user_id, membership_type, website, latitude, longitude, membership_price_cents, membership_yearly_price_cents, stripe_connect_charges_enabled")
      .eq("id", clubId)
      .maybeSingle(),
    getSupabase()
      .from("runs")
      .select("id, title, date, time, timezone, distance, meeting_point, tags")
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
        <p className="text-white/40 text-sm">Klub not found.</p>
        <Link href="/explore" className="text-[#c5f135] text-sm font-semibold hover:underline">
          ← Discover klubs
        </Link>
      </div>
    )
  }

  const isClaimed = club.user_id !== null
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://runklub.fit"

  const sameAs = [
    club.website ?? null,
    club.instagram_handle ? `https://www.instagram.com/${club.instagram_handle}/` : null,
  ].filter(Boolean) as string[]

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SportsClub",
    "name": club.name,
    "url": `${BASE_URL}/clubs/${clubId}`,
    "sport": "Running",
    ...(club.description && { "description": club.description }),
    ...(club.image_url && { "image": club.image_url }),
    ...(club.city && {
      "location": {
        "@type": "Place",
        "address": { "@type": "PostalAddress", "addressLocality": club.city },
      },
    }),
    ...(sameAs.length > 0 && { "sameAs": sameAs }),
    ...(runs && runs.length > 0 && {
      "event": runs.slice(0, 5).map((run) => ({
        "@type": "SportsEvent",
        "name": run.title,
        "startDate": runStartInstant(run).toISOString(),
        "sport": "Running",
        "organizer": { "@type": "SportsClub", "name": club.name },
        ...(run.meeting_point && {
          "location": { "@type": "Place", "name": run.meeting_point },
        }),
      })),
    }),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ClubPageClient
        club={club}
        runs={runs ?? []}
        memberCount={memberCount ?? 0}
        isClaimed={isClaimed}
      />
    </>
  )
}
