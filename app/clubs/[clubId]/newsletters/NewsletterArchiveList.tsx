"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Newsletter = { id: string; subject: string; message: string; sent_at: string; is_public: boolean }

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

// A client fetch (not the server-rendered shell in page.tsx) so RLS sees the
// visitor's real session -- club_newsletters_select_members only matches an
// authenticated member, which an anon server-side fetch could never satisfy.
export default function NewsletterArchiveList({ clubId }: { clubId: string }) {
  const [newsletters, setNewsletters] = useState<Newsletter[] | null>(null)

  useEffect(() => {
    supabase
      .from("club_newsletters")
      .select("id, subject, message, sent_at, is_public")
      .eq("club_id", clubId)
      .order("sent_at", { ascending: false })
      .then(({ data }) => setNewsletters(data ?? []))
  }, [clubId])

  if (newsletters === null) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (newsletters.length === 0) {
    return (
      <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
        <p className="text-white/40 text-sm">No newsletters published yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {newsletters.map((n) => (
        <div key={n.id} className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-5">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] font-bold text-[#c5f135]/60 uppercase tracking-widest">
              {formatDate(n.sent_at)}
            </p>
            {!n.is_public && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 border border-white/10">
                MEMBERS ONLY
              </span>
            )}
          </div>
          <h2 className="text-lg font-black text-white mb-2">{n.subject}</h2>
          <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{n.message}</p>
        </div>
      ))}
    </div>
  )
}
