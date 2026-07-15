"use client"

import { useEffect, useState } from "react"
import { fetchClubModelData, updateRow } from "@/lib/clubModel/api"
import type { Member, PaceGroup, Location, Region } from "@/lib/clubModel/types"
import { formatPaceRange } from "@/lib/clubModel/pace"
import { Card, SectionTitle, Select, Button } from "./ui"
import CoachesTab from "./CoachesTab"

const SUB_TABS = [
  { key: "members", label: "Members" },
  { key: "coaches", label: "Coaches" },
] as const
type SubTabKey = (typeof SUB_TABS)[number]["key"]

export default function MembersTab({ clubId }: { clubId: string }) {
  const [subTab, setSubTab] = useState<SubTabKey>("members")
  const [members, setMembers] = useState<Member[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [paceGroups, setPaceGroups] = useState<PaceGroup[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  const [regionFilter, setRegionFilter] = useState("")
  const [paceGroupFilter, setPaceGroupFilter] = useState("")

  const load = async () => {
    const data = await fetchClubModelData(clubId)
    setMembers(data.members.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)))
    setRegions(data.regions.slice().sort((a, b) => a.name.localeCompare(b.name)))
    setPaceGroups(data.pace_groups.slice().sort((a, b) => a.pace_min - b.pace_min))
    setLocations(data.locations)
    setLoading(false)
  }

  useEffect(() => { load() }, [clubId])

  const setStatus = async (id: string, status: "active" | "rejected" | "pending") => {
    setActing(id)
    await updateRow("members", { id }, { status }, clubId)
    await load()
    setActing(null)
  }

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  const filteredMembers = members.filter((m) =>
    (!regionFilter || m.preferred_region_id === regionFilter) &&
    (!paceGroupFilter || m.pace_group_id === paceGroupFilter)
  )
  const pending = filteredMembers.filter((m) => m.status === "pending")
  const resolved = filteredMembers.filter((m) => m.status !== "pending")

  const MemberRow = ({ m }: { m: Member }) => {
    const region = regions.find((r) => r.id === m.preferred_region_id)
    const group = paceGroups.find((g) => g.id === m.pace_group_id)
    const location = locations.find((l) => l.id === m.location_id)
    return (
      <div className="flex items-center justify-between gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
        <div>
          <p className="text-sm font-bold text-white">{m.name}</p>
          <p className="text-xs text-white/60">{m.email}</p>
          <p className="text-xs text-white/50 mt-0.5">
            {region?.name ?? "—"} · {group ? `${group.name} (${formatPaceRange(group.pace_min, group.pace_max)})` : "—"} · {location?.name ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {m.status === "pending" && (
            <>
              <Button disabled={acting === m.id} onClick={() => setStatus(m.id, "active")}>Activate</Button>
              <Button variant="danger" disabled={acting === m.id} onClick={() => setStatus(m.id, "rejected")}>Reject</Button>
            </>
          )}
          {m.status === "active" && (
            <>
              <span className="text-xs font-black text-[#c5f135] uppercase">Active</span>
              <Button variant="ghost" disabled={acting === m.id} onClick={() => setStatus(m.id, "pending")}>Undo</Button>
            </>
          )}
          {m.status === "rejected" && (
            <>
              <span className="text-xs font-black text-red-400 uppercase">Rejected</span>
              <Button variant="ghost" disabled={acting === m.id} onClick={() => setStatus(m.id, "pending")}>Undo</Button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-1.5">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
              subTab === t.key
                ? "bg-[#c5f135] text-[#1a2110]"
                : "bg-[#1e2d12] border border-[#2e3d1a] text-white/50 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "members" ? (
        <div className="space-y-6">
          <Card>
            <SectionTitle>Filter</SectionTitle>
            <div className="flex gap-2 flex-wrap">
              <div className="min-w-[160px]">
                <Select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
                  <option value="">All regions</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </div>
              <div className="min-w-[160px]">
                <Select value={paceGroupFilter} onChange={(e) => setPaceGroupFilter(e.target.value)}>
                  <option value="">All pace groups</option>
                  {paceGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle>Pending approval {pending.length > 0 && `(${pending.length})`}</SectionTitle>
            <div className="space-y-2">
              {pending.length === 0 && <p className="text-sm text-white/50">No one is waiting on approval.</p>}
              {pending.map((m) => <MemberRow key={m.id} m={m} />)}
            </div>
          </Card>

          <Card>
            <SectionTitle>Active / rejected</SectionTitle>
            <div className="space-y-2">
              {resolved.length === 0 && <p className="text-sm text-white/50">Nothing here yet.</p>}
              {resolved.map((m) => <MemberRow key={m.id} m={m} />)}
            </div>
          </Card>
        </div>
      ) : (
        <CoachesTab clubId={clubId} />
      )}
    </div>
  )
}
