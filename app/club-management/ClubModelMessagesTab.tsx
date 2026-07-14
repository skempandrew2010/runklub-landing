"use client"

import { useEffect, useState } from "react"
import { fetchClubModelData, fetchMessageThread, sendClubModelMessage } from "@/lib/clubModel/api"
import type { ClubModelData, ClubModelMessage } from "@/lib/clubModel/types"

export default function ClubModelMessagesTab() {
  const [data, setData] = useState<ClubModelData | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState<string>("")
  const [messages, setMessages] = useState<ClubModelMessage[] | null>(null)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchClubModelData().then((d) => {
      setData(d)
      const active = d.members.filter((m) => m.status === "active")
      if (active[0]) setSelectedMemberId(active[0].id)
    })
  }, [])

  const loadThread = (memberId: string) => {
    setMessages(null)
    fetchMessageThread(memberId).then(setMessages)
  }

  useEffect(() => {
    if (selectedMemberId) loadThread(selectedMemberId)
  }, [selectedMemberId])

  if (!data) return <p className="text-white/60 text-sm">Loading…</p>

  const members = data.members.filter((m) => m.status === "active").sort((a, b) => a.name.localeCompare(b.name))
  const selected = members.find((m) => m.id === selectedMemberId) ?? null

  const send = async () => {
    if (!draft.trim() || !selected) return
    setSending(true)
    try {
      await sendClubModelMessage(selected.id, draft.trim())
      setDraft("")
      loadThread(selected.id)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
      <div className="space-y-1.5">
        {members.length === 0 && <p className="text-sm text-white/50">No active members yet.</p>}
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => setSelectedMemberId(m.id)}
            className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition ${
              selectedMemberId === m.id ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] border border-[#2e3d1a] text-white/70 hover:text-white"
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>

      <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4 flex flex-col min-h-[360px]">
        {!selected ? (
          <p className="text-sm text-white/50 m-auto">Pick a member to message.</p>
        ) : (
          <>
            <p className="text-sm font-black text-white mb-3">{selected.name}</p>
            <div className="flex-1 space-y-2 overflow-y-auto mb-3">
              {messages === null && <p className="text-sm text-white/50">Loading…</p>}
              {messages?.length === 0 && <p className="text-sm text-white/50">No messages yet.</p>}
              {messages?.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === "director" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    msg.sender === "director" ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1a2110] border border-[#2e3d1a] text-white"
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
                className="px-4 rounded-xl bg-[#c5f135] text-[#1a2110] font-black text-sm disabled:opacity-40 hover:bg-[#d4ff45] transition shrink-0"
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
