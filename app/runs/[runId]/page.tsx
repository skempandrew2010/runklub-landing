import { createClient } from "@supabase/supabase-js"
import type { Metadata } from "next"
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
  return <RunPageClient runId={runId} />
}
