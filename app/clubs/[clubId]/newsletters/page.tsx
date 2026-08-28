import { createClient } from "@supabase/supabase-js"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Mail } from "lucide-react"
import NewsletterArchiveList from "./NewsletterArchiveList"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

type Props = { params: Promise<{ clubId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clubId } = await params
  const { data: club } = await getSupabase().from("clubs").select("name").eq("id", clubId).maybeSingle()
  if (!club) return { title: "Newsletter" }
  return { title: `${club.name} Newsletter` }
}

export default async function ClubNewslettersPage({ params }: Props) {
  const { clubId } = await params

  const { data: club } = await getSupabase().from("clubs").select("id, name").eq("id", clubId).maybeSingle()

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

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <Link
          href={`/clubs/${club.id}`}
          className="flex items-center gap-1.5 text-white/50 hover:text-white transition text-sm font-medium mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to {club.name}
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-4 h-4 text-[#c5f135]" />
          <h1 className="text-xl font-black text-white">Newsletter</h1>
        </div>
        <p className="text-sm text-white/40 mb-8">{club.name}&rsquo;s weekly updates, archived here.</p>

        <NewsletterArchiveList clubId={club.id} />
      </div>
    </div>
  )
}
