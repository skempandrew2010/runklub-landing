"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import ClubManagementTab from "./ClubManagementTab"
import MemberClubManagement from "./MemberClubManagement"

type Status = "loading" | "manager" | "member"

// Role-based, like /director: a director sees the full admin tool (regions,
// coaches, pace groups, schedules, workouts, members, messages, plan), a
// member sees their own paid training schedule + a thread with their
// director. One destination instead of two same-named features.
export default function ClubManagementPage() {
  const [status, setStatus] = useState<Status>("loading")
  const [clubId, setClubId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setStatus("member"); return }

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      if (profile?.role !== "manager") { setStatus("member"); return }

      const { data: clubs } = await supabase.from("clubs").select("id").eq("user_id", user.id).limit(1)
      setClubId(clubs?.[0]?.id ?? null)
      setStatus("manager")
    }
    load()
  }, [])

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  if (status === "member") return <MemberClubManagement />

  return (
    <div className="min-h-screen bg-[#1a2110] py-8 px-6">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">Club Management</p>
        <h1 className="text-2xl font-black text-white mb-6">Manage your club</h1>
        {clubId ? (
          <ClubManagementTab clubId={clubId} />
        ) : (
          <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-8 text-center">
            <p className="text-white/60 text-sm">Create a club first to use Club Management.</p>
          </div>
        )}
      </div>
    </div>
  )
}
