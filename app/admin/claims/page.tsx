"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Check, X, Clock, ExternalLink, Send, RotateCcw } from "lucide-react"

type Claim = {
  id: string
  club_id: string | null
  user_id: string | null
  instagram: string | null
  message: string | null
  status: string
  created_at: string
  clubs: { name: string; city: string | null; instagram_handle: string | null } | null
  profiles: { display_name: string | null } | null
  club_name: string | null
  contact_name: string | null
  contact_email: string | null
  city: string | null
  website: string | null
  referral_source: string | null
  claimed_at: string | null
}

type UnclaimedClub = {
  id: string
  name: string
  city: string | null
  contact_email: string | null
  claim_token_used_at: string | null
  invite_sent_at: string | null
}

export default function AdminClaimsPage() {
  const router = useRouter()
  const [claims, setClaims] = useState<Claim[]>([])
  const [unclaimedClubs, setUnclaimedClubs] = useState<UnclaimedClub[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [tab, setTab] = useState<"claims" | "invite">("claims")
  const [inviteEmails, setInviteEmails] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single()
      if (profile?.role !== "admin") { router.push("/"); return }

      const { data, error: claimsError } = await supabase
        .from("club_claims")
        .select("*, clubs(name, city, instagram_handle), profiles!club_claims_user_id_profiles_fkey(display_name), club_name, contact_name, contact_email, city, website, referral_source, claimed_at")
        .order("created_at", { ascending: false })

      if (claimsError) console.error("club_claims query error:", claimsError)
      setClaims((data as Claim[]) ?? [])

      const { data: clubs } = await supabase
        .from("clubs")
        .select("id, name, city, contact_email, claim_token_used_at, invite_sent_at")
        .is("claim_token_used_at", null)
        .order("name")
      setUnclaimedClubs((clubs as UnclaimedClub[]) ?? [])

      setLoading(false)
    }
    load()
  }, [])

  const sendInvite = async (clubId: string, isResend = false) => {
    const email = inviteEmails[clubId]?.trim()
    const club = unclaimedClubs.find((c) => c.id === clubId)
    const sendTo = email || club?.contact_email
    if (!sendTo) return
    setSending(clubId)
    setInviteErrors((prev) => { const n = { ...prev }; delete n[clubId]; return n })
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/admin/send-claim-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ club_id: clubId, email: sendTo, resend: isResend }),
    })
    setSending(null)
    if (res.ok) {
      setSent((prev) => new Set(prev).add(clubId))
      setUnclaimedClubs((prev) =>
        prev.map((c) => c.id === clubId
          ? { ...c, contact_email: email || c.contact_email, invite_sent_at: new Date().toISOString() }
          : c
        )
      )
    } else {
      const json = await res.json().catch(() => ({}))
      setInviteErrors((prev) => ({ ...prev, [clubId]: json.error ?? "Failed to send — check console." }))
    }
  }

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
    // After rejecting, refresh unclaimed clubs so the club reappears in Send Invites
    if (action === "reject") {
      const { data: clubs } = await supabase
        .from("clubs")
        .select("id, name, city, contact_email, claim_token_used_at, invite_sent_at")
        .is("claim_token_used_at", null)
        .order("name")
      setUnclaimedClubs((clubs as UnclaimedClub[]) ?? [])
    }
    setActing(null)
  }

  const pending = claims.filter((c) => c.status === "pending")
  const resolved = claims.filter((c) => c.status !== "pending")
  const invitedClubs = unclaimedClubs.filter((c) => c.invite_sent_at)
  const notInvitedClubs = unclaimedClubs.filter((c) => !c.invite_sent_at)

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
        <div className="mb-6">
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-black text-white">Club Management</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("claims")}
            className={`px-4 py-2 rounded-full text-sm font-bold transition ${tab === "claims" ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] border border-[#2e3d1a] text-white/50 hover:text-white"}`}
          >
            Claims {pending.length > 0 && <span className="ml-1 text-xs">({pending.length})</span>}
          </button>
          <button
            onClick={() => setTab("invite")}
            className={`px-4 py-2 rounded-full text-sm font-bold transition ${tab === "invite" ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] border border-[#2e3d1a] text-white/50 hover:text-white"}`}
          >
            Send Invites {unclaimedClubs.length > 0 && <span className="ml-1 text-xs">({unclaimedClubs.length})</span>}
          </button>
        </div>

        {/* ── CLAIMS TAB ── */}
        {tab === "claims" && (
          <>
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
          </>
        )}

        {/* ── INVITE TAB ── */}
        {tab === "invite" && (
          <>
            {/* Awaiting response */}
            {invitedClubs.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3">
                  Awaiting Response <span className="ml-1">({invitedClubs.length})</span>
                </h2>
                <div className="space-y-3">
                  {invitedClubs.map((club) => {
                    const isSending = sending === club.id
                    const justSent = sent.has(club.id)
                    const email = inviteEmails[club.id] ?? club.contact_email ?? ""
                    return (
                      <div key={club.id} className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-white">{club.name}</p>
                            {club.city && <p className="text-xs text-white/40">{club.city}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] font-bold text-[#c5f135]/50 uppercase tracking-wider">Invite sent</p>
                            <p className="text-xs text-white/30 mt-0.5">
                              {new Date(club.invite_sent_at!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                        </div>
                        {club.contact_email && (
                          <p className="text-xs text-white/40">Sent to: <span className="text-white/60">{club.contact_email}</span></p>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="email"
                            placeholder="Send to a different address…"
                            value={inviteEmails[club.id] ?? ""}
                            onChange={(e) => setInviteEmails((prev) => ({ ...prev, [club.id]: e.target.value }))}
                            className="flex-1 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                          />
                          <button
                            onClick={() => sendInvite(club.id, true)}
                            disabled={isSending}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition disabled:opacity-40 shrink-0 bg-[#1a2110] border border-[#2e3d1a] text-white/60 hover:text-white hover:border-[#c5f135]/40"
                          >
                            {justSent
                              ? <><Check className="w-3.5 h-3.5 text-[#c5f135]" /> Sent</>
                              : isSending
                              ? "…"
                              : <><RotateCcw className="w-3.5 h-3.5" /> Resend</>
                            }
                          </button>
                        </div>
                        {inviteErrors[club.id] && (
                          <p className="text-red-400 text-xs px-1">{inviteErrors[club.id]}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Not yet contacted */}
            <div>
              {invitedClubs.length > 0 && (
                <h2 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3">
                  Not Yet Contacted <span className="ml-1">({notInvitedClubs.length})</span>
                </h2>
              )}
              {notInvitedClubs.length === 0 && invitedClubs.length === 0 && (
                <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
                  <p className="text-white/40 text-sm">All clubs have been invited or claimed.</p>
                </div>
              )}
              {notInvitedClubs.length === 0 && invitedClubs.length > 0 && (
                <p className="text-white/30 text-sm text-center py-4">All unclaimed clubs have been contacted.</p>
              )}
              {notInvitedClubs.length > 0 && (
                <div className="space-y-3">
                  {notInvitedClubs.map((club) => {
                    const isSent = sent.has(club.id)
                    const isSending = sending === club.id
                    const email = inviteEmails[club.id] ?? club.contact_email ?? ""
                    return (
                      <div key={club.id} className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 space-y-3">
                        <div>
                          <p className="text-sm font-bold text-white">{club.name}</p>
                          {club.city && <p className="text-xs text-white/40">{club.city}</p>}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="director@theirclub.com, another@email.com"
                            value={inviteEmails[club.id] ?? (club.contact_email || "")}
                            onChange={(e) => setInviteEmails((prev) => ({ ...prev, [club.id]: e.target.value }))}
                            disabled={isSent}
                            className="flex-1 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition disabled:opacity-40"
                          />
                          <button
                            onClick={() => sendInvite(club.id)}
                            disabled={isSent || isSending || !email}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition disabled:opacity-40 shrink-0 bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45]"
                          >
                            {isSent
                              ? <><Check className="w-3.5 h-3.5" /> Sent</>
                              : isSending
                              ? "…"
                              : <><Send className="w-3.5 h-3.5" /> Send</>
                            }
                          </button>
                        </div>
                        {inviteErrors[club.id] && (
                          <p className="text-red-400 text-xs px-1">{inviteErrors[club.id]}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
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
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-white">
              {claim.clubs?.name ?? claim.club_name ?? claim.club_id ?? "—"}
            </p>
            {!claim.club_id && (
              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#c5f135]/10 text-[#c5f135]/70 border border-[#c5f135]/20">
                Public form
              </span>
            )}
          </div>
          {(claim.clubs?.city ?? claim.city) && (
            <p className="text-xs text-white/40">{claim.clubs?.city ?? claim.city}</p>
          )}
        </div>
        <span className={`text-[10px] font-black uppercase tracking-wider shrink-0 ${statusColor}`}>
          {claim.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-white/30 font-semibold mb-0.5">
            {claim.contact_name ? "Contact" : "Claimant"}
          </p>
          <p className="text-white/70">
            {claim.contact_name ?? claim.profiles?.display_name ?? "—"}
          </p>
        </div>

        {claim.contact_email && (
          <div>
            <p className="text-white/30 font-semibold mb-0.5">Email</p>
            <a
              href={`mailto:${claim.contact_email}`}
              className="text-[#c5f135]/80 hover:underline truncate block"
            >
              {claim.contact_email}
            </a>
          </div>
        )}

        <div>
          <p className="text-white/30 font-semibold mb-0.5">Instagram</p>
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

        {claim.website && (
          <div>
            <p className="text-white/30 font-semibold mb-0.5">Website</p>
            <a
              href={claim.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 flex items-center gap-1 hover:underline truncate"
            >
              {claim.website.replace(/^https?:\/\//, "")} <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        )}

        {claim.referral_source && (
          <div>
            <p className="text-white/30 font-semibold mb-0.5">How they heard</p>
            <p className="text-white/50">{claim.referral_source}</p>
          </div>
        )}

        <div>
          <p className="text-white/30 font-semibold mb-0.5">Submitted</p>
          <p className="text-white/50">
            {new Date(claim.claimed_at ?? claim.created_at).toLocaleDateString("en-US", {
              month: "short", day: "numeric", year: "numeric",
            })}
          </p>
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
          {claim.club_id && (
            <a
              href={`/clubs/${claim.club_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 border border-[#2e3d1a] text-white/30 rounded-full text-xs font-semibold hover:text-white/60 transition ml-auto"
            >
              View club <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  )
}
