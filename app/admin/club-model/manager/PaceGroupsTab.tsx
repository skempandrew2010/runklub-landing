"use client"

import { useEffect, useState } from "react"
import { fetchClubModelData, insertRow, deleteRow } from "@/lib/clubModel/api"
import type { PaceGroup, PaceOption } from "@/lib/clubModel/types"
import { formatPace, formatPaceRange, parsePace } from "@/lib/clubModel/pace"
import { Card, SectionTitle, Input, Button, Row } from "./ui"

export default function PaceGroupsTab({ clubId }: { clubId: string }) {
  const [groups, setGroups] = useState<PaceGroup[]>([])
  const [options, setOptions] = useState<PaceOption[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<{ name: string; pace_min: string; pace_max: string }>({
    name: "", pace_min: "", pace_max: "",
  })
  const [optionDraft, setOptionDraft] = useState("")

  const load = async () => {
    const data = await fetchClubModelData(clubId)
    setGroups(data.pace_groups.slice().sort((a, b) => a.pace_min - b.pace_min))
    setOptions(data.pace_options.slice().sort((a, b) => a.pace - b.pace))
    setLoading(false)
  }

  useEffect(() => { load() }, [clubId])

  const addGroup = async () => {
    const min = Number(draft.pace_min)
    const max = Number(draft.pace_max)
    if (!draft.name.trim() || !Number.isFinite(min) || !Number.isFinite(max)) return
    await insertRow("pace_groups", { club_id: clubId, name: draft.name.trim(), pace_min: min, pace_max: max }, clubId)
    setDraft({ name: "", pace_min: "", pace_max: "" })
    load()
  }

  const deleteGroup = async (id: string) => {
    await deleteRow("pace_groups", { id }, clubId)
    load()
  }

  const addOption = async () => {
    const pace = parsePace(optionDraft)
    if (pace === null) return
    await insertRow("pace_options", { club_id: clubId, pace }, clubId)
    setOptionDraft("")
    load()
  }

  const deleteOption = async (id: string) => {
    await deleteRow("pace_options", { id }, clubId)
    load()
  }

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle>Add a pace group</SectionTitle>
        <Row>
          <div className="flex-1 min-w-[160px]">
            <Input placeholder="Name, e.g. Sub 9/10" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="w-28">
            <Input placeholder="Min (min/mi)" value={draft.pace_min} onChange={(e) => setDraft({ ...draft, pace_min: e.target.value })} />
          </div>
          <div className="w-28">
            <Input placeholder="Max (min/mi)" value={draft.pace_max} onChange={(e) => setDraft({ ...draft, pace_max: e.target.value })} />
          </div>
          <Button onClick={addGroup}>Add group</Button>
        </Row>
      </Card>

      <Card>
        <SectionTitle>Pace groups</SectionTitle>
        <div className="space-y-2">
          {groups.length === 0 && <p className="text-sm text-white/50">No pace groups yet.</p>}
          {groups.map((g) => (
            <div key={g.id} className="flex items-center justify-between bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
              <div>
                <p className="text-sm font-bold text-white">{g.name}</p>
                <p className="text-xs text-white/60">{formatPaceRange(g.pace_min, g.pace_max)}</p>
              </div>
              <Button variant="danger" onClick={() => deleteGroup(g.id)}>Delete</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Signup pace options</SectionTitle>
        <p className="text-xs text-white/50 -mt-2 mb-3">
          These are the exact choices members pick from on the join form — each one gets matched into
          whichever pace group above contains it.
        </p>
        <Row>
          <div className="w-32">
            <Input placeholder="e.g. 9:30" value={optionDraft} onChange={(e) => setOptionDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addOption()} />
          </div>
          <Button onClick={addOption}>Add option</Button>
        </Row>
        <div className="flex flex-wrap gap-2 mt-3">
          {options.length === 0 && <p className="text-sm text-white/50">No pace options yet — members will have nothing to pick from.</p>}
          {options.map((o) => (
            <span key={o.id} className="flex items-center gap-1.5 bg-[#1a2110] border border-[#2e3d1a] rounded-full pl-3 pr-1.5 py-1">
              <span className="text-sm font-bold text-white">{formatPace(o.pace)}</span>
              <button onClick={() => deleteOption(o.id)} className="text-white/50 hover:text-red-400 text-xs px-1.5">✕</button>
            </span>
          ))}
        </div>
      </Card>
    </div>
  )
}
