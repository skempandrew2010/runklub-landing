"use client"

import { useEffect, useState } from "react"
import { fetchClubModelData, insertRow, updateRow, deleteRow } from "@/lib/clubModel/api"
import type { PaceGroup, PaceOption } from "@/lib/clubModel/types"
import { formatPace, formatPaceRange, parsePace } from "@/lib/clubModel/pace"
import { Card, SectionTitle, Input, Button, Row } from "./ui"

type GroupDraft = { name: string; pace_min: string; pace_max: string }

export default function PaceGroupsTab({ clubId }: { clubId: string }) {
  const [groups, setGroups] = useState<PaceGroup[]>([])
  const [options, setOptions] = useState<PaceOption[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<GroupDraft>({ name: "", pace_min: "", pace_max: "" })
  const [optionDraft, setOptionDraft] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<GroupDraft>({ name: "", pace_min: "", pace_max: "" })
  const [savingEdit, setSavingEdit] = useState(false)

  const load = async () => {
    const data = await fetchClubModelData(clubId)
    setGroups(data.pace_groups.slice().sort((a, b) => a.pace_min - b.pace_min))
    setOptions(data.pace_options.slice().sort((a, b) => a.pace - b.pace))
    setLoading(false)
  }

  useEffect(() => { load() }, [clubId])

  const addGroup = async () => {
    const min = parsePace(draft.pace_min)
    const max = parsePace(draft.pace_max)
    if (!draft.name.trim() || min === null || max === null) return
    await insertRow("pace_groups", { club_id: clubId, name: draft.name.trim(), pace_min: min, pace_max: max }, clubId)
    setDraft({ name: "", pace_min: "", pace_max: "" })
    load()
  }

  const deleteGroup = async (id: string) => {
    await deleteRow("pace_groups", { id }, clubId)
    load()
  }

  const startEdit = (g: PaceGroup) => {
    setEditingId(g.id)
    setEditDraft({ name: g.name, pace_min: formatPace(g.pace_min), pace_max: formatPace(g.pace_max) })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft({ name: "", pace_min: "", pace_max: "" })
  }

  const saveEdit = async (id: string) => {
    const min = parsePace(editDraft.pace_min)
    const max = parsePace(editDraft.pace_max)
    if (!editDraft.name.trim() || min === null || max === null) return
    setSavingEdit(true)
    try {
      await updateRow("pace_groups", { id }, { name: editDraft.name.trim(), pace_min: min, pace_max: max }, clubId)
      cancelEdit()
      await load()
    } finally {
      setSavingEdit(false)
    }
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
            <Input placeholder="Min, e.g. 0:00" value={draft.pace_min} onChange={(e) => setDraft({ ...draft, pace_min: e.target.value })} />
          </div>
          <div className="w-28">
            <Input placeholder="Max, e.g. 8:30" value={draft.pace_max} onChange={(e) => setDraft({ ...draft, pace_max: e.target.value })} />
          </div>
          <Button onClick={addGroup}>Add group</Button>
        </Row>
      </Card>

      <Card>
        <SectionTitle>Pace groups</SectionTitle>
        <div className="space-y-2">
          {groups.length === 0 && <p className="text-sm text-white/50">No pace groups yet.</p>}
          {groups.map((g) => (
            editingId === g.id ? (
              <div key={g.id} className="bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
                <Row>
                  <div className="flex-1 min-w-[160px]">
                    <Input placeholder="Name" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                  </div>
                  <div className="w-28">
                    <Input placeholder="Min, e.g. 0:00" value={editDraft.pace_min} onChange={(e) => setEditDraft({ ...editDraft, pace_min: e.target.value })} />
                  </div>
                  <div className="w-28">
                    <Input placeholder="Max, e.g. 8:30" value={editDraft.pace_max} onChange={(e) => setEditDraft({ ...editDraft, pace_max: e.target.value })} />
                  </div>
                  <Button onClick={() => saveEdit(g.id)} disabled={savingEdit}>{savingEdit ? "…" : "Save"}</Button>
                  <Button variant="ghost" onClick={cancelEdit} disabled={savingEdit}>Cancel</Button>
                </Row>
              </div>
            ) : (
            <div key={g.id} className="flex items-center justify-between bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
              <div>
                <p className="text-sm font-bold text-white">{g.name}</p>
                <p className="text-xs text-white/60">{formatPaceRange(g.pace_min, g.pace_max)}</p>
              </div>
              <Row>
                <Button variant="ghost" onClick={() => startEdit(g)}>Edit</Button>
                <Button variant="danger" onClick={() => deleteGroup(g.id)}>Delete</Button>
              </Row>
            </div>
            )
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
