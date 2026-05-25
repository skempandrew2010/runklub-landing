"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Check, X, Clock, ExternalLink } from "lucide-react"

type Claim = {
  id: string
  club_id: string
  user_id: string
  instagram: string | null
  message: string | null
  status: string
  created_at: string
  clubs: { name: string; city: string | null; instagram_handle: string | null } | null
  profiles: { display_name: string | null } | null
}

export default function AdminClaimsPage() {
  const router = useRouter()
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single()
      if (profile?.role !== "admin") { router.push("/"); return }

      const { data } = await supabase
        .from("club_claims")
        .select("*, clubs(name, city, instagram_handle), profiles(display_name)")
        .order("created_at", { ascending: false })

      setClaims((data as Claim[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const act = async (claimId: string, action: "approve" | "reject") => {
    setActing(claimId)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/admin/claims/${claimId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action }),
    })
    setClaims((prev) =>
      prev.map((c) => c.id === claimId ? { ...c, status: action === "approve" ? "approved" : "rejected" } : c)
    )
    setActing(null)
  }

  const pending = claims.filter((c) => c.status === "pending")
  const resolved = claims.filter((c) => c.status !== "pending")

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <div className="mb-8">
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-black text-white">Club Claims</h1>
          <p className="text-sm text-white/40 mt-1">{pending.length} pending</p>
        </div>

        {pending.length === 0 && (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center mb-8">
            <Clock className="w-8 h-8 text-white/15 mx-auto mb-2" />
            <p className="text-white/40 text-sm">No pending claims.</p>
          </div>
        )}

        {pending.length > 0 && (
          <div className="space-y-3 mb-10">
            {pending.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} acting={acting} onAct={act} />
            ))}
          </div>
        )}

        {resolved.length > 0 && (
          <>
            <h2 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3">Resolved</h2>
            <div className="space-y-3">
              {resolved.map((claim) => (
                <ClaimCard key={claim.id} claim={claim} acting={acting} onAct={act} resolved />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ClaimCard({
  claim,
  acting,
  onAct,
  resolved = false,
}: {
  claim: Claim
  acting: string | null
  onAct: (id: string, action: "approve" | "reject") => void
  resolved?: boolean
}) {
  const isActing = acting === claim.id
  const statusColor =
    claim.status === "approved" ? "text-[#c5f135]" :
    claim.status === "rejected" ? "text-red-400/70" :
    "text-white/40"

  return (
    <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">{claim.clubs?.name ?? claim.club_id}</p>
          {claim.clubs?.city && <p className="text-xs text-white/40">{claim.clubs.city}</p>}
        </div>
        <span className={`text-[10px] font-black uppercase tracking-wider ${statusColor}`}>
          {claim.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-white/30 font-semibold mb-0.5">Claimant</p>
          <p className="text-white/70">{claim.profiles?.display_name ?? "—"}</p>
        </div>
        <div>
          <p className="text-white/30 font-semibold mb-0.5">Their Instagram</p>
          {claim.instagram ? (
            <a
              href={`https://instagram.com/${claim.instagram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#c5f135] flex items-center gap-1 hover:underline"
            >
              @{claim.instagram} <ExternalLink className="w-3 h-3" />
            </a>
          ) : <p className="text-white/30">—</p>}
        </div>
        {claim.clubs?.instagram_handle && (
          <div>
            <p className="text-white/30 font-semibold mb-0.5">Club Instagram</p>
            <a
              href={`https://instagram.com/${claim.clubs.instagram_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 flex items-center gap-1 hover:underline"
            >
              @{claim.clubs.instagram_handle} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
        <div>
          <p className="text-white/30 font-semibold mb-0.5">Submitted</p>
          <p className="text-white/50">{new Date(claim.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
        </div>
      </div>

      {claim.message && (
        <div className="bg-[#1a2110] rounded-xl px-3 py-2.5">
          <p className="text-xs text-white/50 leading-relaxed">{claim.message}</p>
        </div>
      )}

      {!resolved && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onAct(claim.id, "approve")}
            disabled={isActing}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#c5f135] text-[#1a2110] rounded-full text-xs font-black disabled:opacity-40 hover:bg-[#d4ff45] transition"
          >
            <Check className="w-3.5 h-3.5" />
            {isActing ? "…" : "Approve"}
          </button>
          <button
            onClick={() => onAct(claim.id, "reject")}
            disabled={isActing}
            className="flex items-center gap-1.5 px-4 py-2 border border-[#2e3d1a] text-white/50 rounded-full text-xs font-semibold disabled:opacity-40 hover:text-red-400 hover:border-red-400/30 transition"
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
          <a
            href={`/clubs/${claim.club_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 border border-[#2e3d1a] text-white/30 rounded-full text-xs font-semibold hover:text-white/60 transition ml-auto"
          >
            View club <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  )
}
