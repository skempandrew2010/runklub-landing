"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Dumbbell, Send } from "lucide-react"
import { fetchMyMemberships, fetchMessageThread, sendClubModelMessage, type MyMembership } from "@/lib/clubModel/api"
import type { ClubModelMessage } from "@/lib/clubModel/types"
import { formatPaceRange } from "@/lib/clubModel/pace"
import { currentWeekMonday, formatWeekRange } from "@/lib/clubModel/week"

export default function MemberClubManagement() {
  const [memberships, setMemberships] = useState<MyMembership[] | null>(null)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    fetchMyMemberships().then(setMemberships)
  }, [])

  if (memberships === null) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110]">
      <div className="bg-[#1e2d12] border-b border-[#2e3d1a]">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">Klub Management</p>
          <h1 className="text-2xl font-black text-white">Your paid training klubs</h1>
          <p className="text-sm text-white/40 mt-1">
            Full pace-group schedules and messages for every klub you&rsquo;re a paying training member of.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {memberships.length === 0 ? (
          <div className="bg-[#1e2d12] rounded-2xl p-10 text-center border border-[#2e3d1a]">
            <Dumbbell className="w-10 h-10 text-white/15 mx-auto mb-3" />
            <p className="text-white/50 text-sm font-medium">You&rsquo;re not part of a paid training program yet.</p>
            <p className="text-white/25 text-xs mt-1 mb-4">
              Join a klub that offers structured pace-group training to see it here.
            </p>
            <Link href="/explore" className="inline-block px-5 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition">
              Discover klubs
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {memberships.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {memberships.map((m, i) => (
                  <button
                    key={m.member.id}
                    onClick={() => setSelected(i)}
                    className={`px-4 py-2 rounded-full text-sm font-bold transition ${
                      selected === i ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] border border-[#2e3d1a] text-white/60 hover:text-white"
                    }`}
                  >
                    {m.club?.name ?? "Klub"}
                  </button>
                ))}
              </div>
            )}

            {memberships[selected] && <MembershipDetail membership={memberships[selected]} />}
          </div>
        )}
      </div>
    </div>
  )
}

function MembershipDetail({ membership }: { membership: MyMembership }) {
  const { member, club, paceGroup, region, coach, weekSchedule } = membership
  const [messages, setMessages] = useState<ClubModelMessage[] | null>(null)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)

  const loadMessages = () => {
    fetchMessageThread(member.id).then(setMessages)
  }

  useEffect(() => {
    setMessages(null)
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.id])

  const send = async () => {
    if (!draft.trim()) return
    setSending(true)
    try {
      await sendClubModelMessage(member.id, draft.trim())
      setDraft("")
      loadMessages()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
        <p className="text-lg font-black text-white">{club?.name ?? "Klub"}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <p className="text-xs font-bold text-white/60 uppercase mb-0.5">Pace group</p>
            {paceGroup ? (
              <>
                <p className="text-sm font-black text-white">{paceGroup.name}</p>
                <p className="text-xs text-white/60">{formatPaceRange(paceGroup.pace_min, paceGroup.pace_max)}</p>
              </>
            ) : <p className="text-sm text-white/50">Not matched yet</p>}
          </div>
          <div>
            <p className="text-xs font-bold text-white/60 uppercase mb-0.5">Region</p>
            <p className="text-sm font-black text-white">{region?.name ?? "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-bold text-white/60 uppercase mb-0.5">Coach</p>
            {coach ? (
              <p className="text-sm font-black text-white">{coach.name}</p>
            ) : <p className="text-sm text-white/50">No coach assigned</p>}
          </div>
        </div>
      </div>

      <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
        <p className="text-xs font-bold text-white/60 uppercase tracking-widest">This week&rsquo;s schedule</p>
        <p className="text-[10px] text-white/50 mb-2">{formatWeekRange(currentWeekMonday())}</p>
        {weekSchedule.length === 0 && <p className="text-sm text-white/50">Nothing scheduled this week.</p>}
        <div className="space-y-2">
          {weekSchedule.map((s, i) => {
            const isInPerson = s.workout?.isInPerson ?? true
            return (
              <div
                key={`${s.dayOfWeek}-${i}`}
                className="rounded-xl border px-3 py-2.5"
                style={isInPerson
                  ? { backgroundColor: "rgba(197,241,53,0.12)", borderColor: "rgba(197,241,53,0.35)" }
                  : { backgroundColor: "#1a2110", borderColor: "#2e3d1a" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-white">
                    {s.dayOfWeek}{s.time ? ` · ${s.time}` : ""}
                    {s.location ? ` · ${s.location.name}` : ""}
                  </p>
                  <span className={`text-[10px] font-black uppercase tracking-wide shrink-0 ${isInPerson ? "text-[#c5f135]" : "text-white/50"}`}>
                    {isInPerson ? "In person" : "On your own"}
                  </span>
                </div>
                {s.workout && (
                  <p className="text-xs text-white/60 mt-0.5">
                    {s.workout.workoutType.name}{s.workout.details ? ` — ${s.workout.details}` : ""}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4">
        <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Message your director</p>
        <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
          {messages === null && <p className="text-sm text-white/50">Loading…</p>}
          {messages?.length === 0 && <p className="text-sm text-white/50">No messages yet — say hi!</p>}
          {messages?.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === "member" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                msg.sender === "member" ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1a2110] border border-[#2e3d1a] text-white"
              }`}>
                {msg.body}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:border-[#c5f135]/50"
            placeholder="Write a message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim()}
            className="w-10 h-10 rounded-xl bg-[#c5f135] text-[#1a2110] flex items-center justify-center disabled:opacity-40 hover:bg-[#d4ff45] transition shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
