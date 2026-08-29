"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { CheckCircle, XCircle } from "lucide-react"

type InviteData = {
  id: string
  club_id: string
  email: string
  name: string | null
  status: string
  paceGroupNames: string[]
  clubs: { name: string; image_url: string | null } | null
}

export default function CoachInvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [invite, setInvite] = useState<InviteData | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "accepting" | "accepted" | "error" | "invalid">("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/coach-invite-lookup/${token}`)
      if (!res.ok) { setState("invalid"); return }
      const data = await res.json()
      if (!data.invite) { setState("invalid"); return }
      setInvite(data.invite)

      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      setState("ready")
    }
    load()
  }, [token])

  const accept = async () => {
    if (!invite) return
    setState("accepting")

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push(`/login?redirect=/coach-invite/${token}`)
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/coach-invite-accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ token }),
    })

    const json = await res.json()
    if (!res.ok) {
      setErrorMsg(json.error ?? "Something went wrong")
      setState("error")
      return
    }

    setState("accepted")
    setTimeout(() => router.push(`/director?as=coach&club_id=${json.club_id}`), 2000)
  }

  const club = invite?.clubs
  const clubName = club?.name ?? "this klub"
  const initials = clubName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (state === "invalid") {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-5">
        <div className="text-center max-w-sm">
          <XCircle className="w-12 h-12 text-red-400/60 mx-auto mb-4" />
          <h1 className="text-xl font-black text-white mb-2">Invite not found</h1>
          <p className="text-white/50 text-sm mb-6">This invite link is invalid or has already been used.</p>
          <Link href="/explore" className="px-6 py-3 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full">
            Explore Klubs
          </Link>
        </div>
      </div>
    )
  }

  if (state === "accepted") {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-5">
        <div className="text-center max-w-sm">
          <CheckCircle className="w-12 h-12 text-[#c5f135] mx-auto mb-4" />
          <h1 className="text-xl font-black text-white mb-2">You're coaching!</h1>
          <p className="text-white/50 text-sm">Taking you to your Coach dashboard…</p>
        </div>
      </div>
    )
  }

  if (invite?.status === "revoked") {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-5">
        <div className="text-center max-w-sm">
          <XCircle className="w-12 h-12 text-red-400/60 mx-auto mb-4" />
          <h1 className="text-xl font-black text-white mb-2">Invite revoked</h1>
          <p className="text-white/50 text-sm mb-6">This invite is no longer active.</p>
          <Link href="/explore" className="px-6 py-3 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full">
            Explore Klubs
          </Link>
        </div>
      </div>
    )
  }

  if (invite?.status === "accepted") {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-5">
        <div className="text-center max-w-sm">
          <CheckCircle className="w-12 h-12 text-[#c5f135] mx-auto mb-4" />
          <h1 className="text-xl font-black text-white mb-2">Already accepted!</h1>
          <p className="text-white/50 text-sm mb-6">You're already coaching at {clubName}.</p>
          <Link href={`/director?as=coach&club_id=${invite?.club_id}`} className="px-6 py-3 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full">
            Go to Coach Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] flex items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-6">
        <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-6 text-center">
          <div className="w-16 h-16 rounded-full overflow-hidden mx-auto mb-4 bg-[#2e3d1a] flex items-center justify-center">
            {club?.image_url
              ? <img src={club.image_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-xl font-black text-white/30">{initials}</span>
            }
          </div>
          <p className="text-[10px] font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">You're invited to coach at</p>
          <h1 className="text-2xl font-black text-white">{clubName}</h1>
          {invite?.name && (
            <p className="text-sm text-white/40 mt-1">Hi {invite.name} 👋</p>
          )}
          {invite && invite.paceGroupNames.length > 0 && (
            <p className="text-xs text-white/35 mt-3">
              Pace group{invite.paceGroupNames.length > 1 ? "s" : ""}: <span className="text-white/60 font-semibold">{invite.paceGroupNames.join(", ")}</span>
            </p>
          )}
        </div>

        {state === "error" && (
          <p className="text-red-400/80 text-sm text-center px-2">{errorMsg}</p>
        )}

        {!userId && (
          <p className="text-xs text-white/40 text-center">You'll need to log in or create an account to accept this invite.</p>
        )}

        <button
          onClick={accept}
          disabled={state === "accepting"}
          className="w-full py-4 bg-[#c5f135] text-[#1a2110] text-base font-black rounded-full hover:bg-[#d4ff45] transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {state === "accepting" ? (
            <><div className="w-4 h-4 border-2 border-[#1a2110]/30 border-t-[#1a2110] rounded-full animate-spin" /> Joining…</>
          ) : userId ? (
            `Accept & Start Coaching`
          ) : (
            "Log in to Accept Invite"
          )}
        </button>

        <p className="text-center">
          <Link href="/explore" className="text-xs text-white/25 hover:text-white/40 transition">
            Explore RunKlub instead
          </Link>
        </p>
      </div>
    </div>
  )
}
