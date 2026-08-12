"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { ChevronRight, Trophy, ClipboardList } from "lucide-react"

type ClubEntry = { id: string; name: string; imageUrl: string | null; role: "director" | "coach" }

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

/**
 * Named, clickable list of every klub the signed-in user directs and/or
 * coaches — shown on Home so someone who's a director for one klub and a
 * coach for several others can tell them apart and jump straight into the
 * right one, instead of guessing which "Director"/"Coach" landing they'll get.
 */
export default function YourKlubsSection({ userId }: { userId: string }) {
  const [clubs, setClubs] = useState<ClubEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const [{ data: owned }, { data: coachRows }] = await Promise.all([
        supabase.from("clubs").select("id, name, image_url").eq("user_id", userId).order("created_at"),
        supabase.from("coaches").select("club_id, accepted_at, clubs(id, name, image_url)").eq("user_id", userId).eq("status", "active").order("accepted_at", { ascending: false }),
      ])

      const directorClubs: ClubEntry[] = (owned ?? []).map((c: any) => ({ id: c.id, name: c.name, imageUrl: c.image_url, role: "director" as const }))
      const coachClubs: ClubEntry[] = ((coachRows ?? []) as any[])
        .filter((r) => r.clubs)
        .map((r) => ({ id: r.clubs.id, name: r.clubs.name, imageUrl: r.clubs.image_url, role: "coach" as const }))

      setClubs([...directorClubs, ...coachClubs])
      setLoading(false)
    }
    load()
  }, [userId])

  if (loading || clubs.length === 0) return null

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-1 h-5 rounded-full bg-[#c5f135] shrink-0" />
        <h2 className="text-sm font-black text-white tracking-tight leading-none">Your Klubs</h2>
        <div className="flex-1 h-px bg-[#2e3d1a]" />
      </div>
      <div className="bg-[#1e2d12] rounded-2xl overflow-hidden border border-[#2e3d1a] divide-y divide-[#2e3d1a]">
        {clubs.map((club) => {
          const href = club.role === "director" ? "/director?as=director" : `/director?as=coach&club_id=${club.id}`
          const Icon = club.role === "director" ? Trophy : ClipboardList
          return (
            <Link
              key={`${club.role}-${club.id}`}
              href={href}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#243018] transition"
            >
              <div className="w-9 h-9 rounded-xl shrink-0 bg-[#2e3d1a] overflow-hidden flex items-center justify-center">
                {club.imageUrl
                  ? <img src={club.imageUrl} alt="" className="w-full h-full object-cover" />
                  : <span className="text-xs font-black text-white/30">{initialsOf(club.name)}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{club.name}</p>
                <p className="text-xs text-white/40 mt-0.5 flex items-center gap-1">
                  <Icon className="w-3 h-3 text-[#c5f135]/70" />
                  {club.role === "director" ? "Director" : "Coach"}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
            </Link>
          )
        })}
      </div>
    </section>
  )
}
