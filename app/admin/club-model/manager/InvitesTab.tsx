"use client"

import { useEffect, useState } from "react"
import { fetchClubModelData, sendInvite, updateRow } from "@/lib/clubModel/api"
import type { ClubModelInvite } from "@/lib/clubModel/types"
import { Card, SectionTitle, Input, Button, Row } from "./ui"

export default function InvitesTab() {
  const [invites, setInvites] = useState<ClubModelInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")

  const load = async () => {
    const data = await fetchClubModelData()
    setInvites(data.club_model_invites.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const submit = async () => {
    setError("")
    if (!email.trim()) { setError("Email is required."); return }
    setSending(true)
    try {
      await sendInvite(email.trim(), name.trim())
      setName("")
      setEmail("")
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite.")
    }
    setSending(false)
  }

  const revoke = async (id: string) => {
    await updateRow("club_model_invites", { id }, { status: "revoked" })
    load()
  }

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle>Invite a member</SectionTitle>
        <Row>
          <div className="flex-1 min-w-[160px]">
            <Input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[200px]">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <Button disabled={sending} onClick={submit}>{sending ? "Sending…" : "Send invite"}</Button>
        </Row>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </Card>

      <Card>
        <SectionTitle>Sent invites</SectionTitle>
        <div className="space-y-2">
          {invites.length === 0 && <p className="text-sm text-white/50">No invites sent yet.</p>}
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
              <div>
                <p className="text-sm font-bold text-white">{inv.name || inv.email}</p>
                {inv.name && <p className="text-xs text-white/60">{inv.email}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {inv.status === "sent" && <span className="text-xs font-black text-white/60 uppercase">Sent</span>}
                {inv.status === "used" && <span className="text-xs font-black text-[#c5f135] uppercase">Joined</span>}
                {inv.status === "revoked" && <span className="text-xs font-black text-red-400 uppercase">Revoked</span>}
                {inv.status === "sent" && (
                  <Button variant="danger" onClick={() => revoke(inv.id)}>Revoke</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
