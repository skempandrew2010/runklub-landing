import { createClient } from "@supabase/supabase-js"
import type { Metadata } from "next"
import Link from "next/link"
import RunPageClient from "./RunPageClient"

export const revalidate = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

type Props = { params: Promise<{ runId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { runId } = await params
  const { data: run } = await getSupabase()
    .from("runs")
    .select("title, date, description, clubs(name)")
    .eq("id", runId)
    .maybeSingle()

  if (!run) return { title: "Run Not Found" }

  const clubName = (run.clubs as unknown as { name: string } | null)?.name
  return {
    title: clubName ? `${run.title} · ${clubName}` : run.title,
    description: run.description ?? `Join this run on RunKlub.`,
  }
}

export default async function RunPage({ params }: Props) {
  const { runId } = await params

  const { data: run } = await getSupabase()
    .from("runs")
    .select(
      "id, club_id, title, date, time, distance, meeting_point, city, external_url, description, tags, is_in_person, members_only, run_lat, run_lng, clubs(id, name, image_url, latitude, longitude, city, tier)"
    )
    .eq("id", runId)
    .maybeSingle()

  if (!run || !run.clubs) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex flex-col items-center justify-center gap-3">
        <p className="text-white/40 text-sm">Run not found.</p>
        <Link href="/explore" className="text-[#c5f135] text-sm font-semibold hover:underline">
          ← Discover klubs
        </Link>
      </div>
    )
  }

  const club = run.clubs as unknown as {
    id: string
    name: string
    image_url: string | null
    latitude: number | null
    longitude: number | null
    city: string | null
    tier: string | null
  }

  // Klubs without a precise pin fall back to their city's centroid for check-in
  let cityFallback: { lat: number; lng: number } | null = null
  if (run.run_lat == null && (club.latitude == null || club.longitude == null) && club.city) {
    const cityName = club.city.split(",")[0].trim()
    const { data: cityRow } = await getSupabase()
      .from("cities")
      .select("lat, lng")
      .eq("name", cityName)
      .maybeSingle()
    if (cityRow?.lat != null && cityRow?.lng != null) {
      cityFallback = { lat: cityRow.lat, lng: cityRow.lng }
    }
  }

  return (
    <RunPageClient
      run={{
        id: run.id,
        club_id: run.club_id,
        title: run.title,
        date: run.date,
        time: run.time,
        distance: run.distance,
        meeting_point: run.meeting_point,
        city: run.city,
        external_url: run.external_url,
        description: run.description,
        tags: run.tags,
        is_in_person: run.is_in_person,
        members_only: run.members_only,
        run_lat: run.run_lat,
        run_lng: run.run_lng,
      }}
      club={club}
      cityFallback={cityFallback}
    />
  )
}
