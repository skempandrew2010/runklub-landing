"use client"

import { useEffect, useRef, useState } from "react"
import { fetchClubModelData, insertRow, bulkInsertRows, updateRow, deleteRow } from "@/lib/clubModel/api"
import { supabase } from "@/lib/supabase"
import type { PaceGroup } from "@/lib/clubModel/types"
import { formatPace, formatPaceRange, parsePace } from "@/lib/clubModel/pace"
import { DEFAULT_PACE_GROUPS, RACE_DISTANCE_LABELS, type RaceDistance, marathonPaceToRaceTime, marathonTimeRangeLabel, formatRaceTime } from "@/lib/clubModel/raceEquivalency"
import { validatePaceGroupCoverage } from "@/lib/clubModel/paceCoverage"
import { Card, SectionTitle, Input, Button, Row } from "./ui"

type GroupDraft = { name: string; pace_min: string; pace_max: string }

// "full" (marathon) isn't in this list -- the group's own min/max *is* its
// marathon pace, so the finish time is highlighted separately rather than
// buried alongside the other four derived distances.
const EQUIVALENT_DISTANCES: RaceDistance[] = ["mile", "5k", "10k", "half"]

function equivalentTimesLine(paceMax: number): string {
  return EQUIVALENT_DISTANCES
    .map((d) => `Sub ${formatRaceTime(marathonPaceToRaceTime(d, paceMax))} ${RACE_DISTANCE_LABELS[d]}`)
    .join(" · ")
}

export default function PaceGroupsTab({ clubId }: { clubId: string }) {
  const [groups, setGroups] = useState<PaceGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<GroupDraft>({ name: "", pace_min: "", pace_max: "" })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<GroupDraft>({ name: "", pace_min: "", pace_max: "" })
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const seedAttempted = useRef(false)

  const load = async () => {
    const data = await fetchClubModelData(clubId)
    const sortedGroups = data.pace_groups.slice().sort((a, b) => a.pace_min - b.pace_min)

    if (sortedGroups.length === 0 && !seedAttempted.current) {
      seedAttempted.current = true
      await bulkInsertRows(
        "pace_groups",
        DEFAULT_PACE_GROUPS.map((g) => ({ club_id: clubId, ...g })),
        clubId
      )
      const seeded = await fetchClubModelData(clubId)
      setGroups(seeded.pace_groups.slice().sort((a, b) => a.pace_min - b.pace_min))
      setLoading(false)
      return
    }

    setGroups(sortedGroups)
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

  const deleteGroup = async (g: PaceGroup) => {
    setDeletingId(g.id)
    try {
      const [{ count: subCount }, { count: reqCount }] = await Promise.all([
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("pace_group_id", g.id),
        supabase.from("membership_requests").select("id", { count: "exact", head: true }).eq("pace_group_id", g.id),
      ])
      const memberCount = (subCount ?? 0) + (reqCount ?? 0)
      const message = memberCount > 0
        ? `${memberCount} member${memberCount === 1 ? " is" : "s are"} in "${g.name}" - they'll be unassigned. Delete anyway?`
        : `Delete "${g.name}"? This cannot be undone.`
      if (!confirm(message)) return
      await deleteRow("pace_groups", { id: g.id }, clubId)
      load()
    } finally {
      setDeletingId(null)
    }
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

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  const { gaps, overlaps } = validatePaceGroupCoverage(groups)

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle>Add a pace group</SectionTitle>
        <p className="text-xs text-white/50 -mt-2 mb-3">
          Min and Max are this group&rsquo;s marathon pace - the average min/mile a runner holds over a full 26.2 miles, not a
          flat-out mile-race pace. Equivalent mile/5K/10K/half times are calculated from that automatically.
        </p>
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

      {(gaps.length > 0 || overlaps.length > 0) && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-2xl px-4 py-3 space-y-1">
          {gaps.map((gap, i) => (
            <p key={`gap-${i}`} className="text-sm text-red-400">
              Gap between {formatPace(gap.fromPace)} and {formatPace(gap.toPace)} marathon pace - no group covers runners in this range.
            </p>
          ))}
          {overlaps.map((o, i) => (
            <p key={`overlap-${i}`} className="text-sm text-red-400">
              &ldquo;{o.groupA.name}&rdquo; and &ldquo;{o.groupB.name}&rdquo; overlap - a runner in between could match either one.
            </p>
          ))}
        </div>
      )}

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
                <p className="text-xs text-white/60">{formatPaceRange(g.pace_min, g.pace_max)} marathon pace</p>
                <p className="text-xs font-bold text-[#c5f135] mt-0.5">{marathonTimeRangeLabel(g.pace_min, g.pace_max)}</p>
                <p className="text-xs text-white/30 mt-0.5">{equivalentTimesLine(g.pace_max)}</p>
              </div>
              <Row>
                <Button variant="ghost" onClick={() => startEdit(g)}>Edit</Button>
                <Button variant="danger" onClick={() => deleteGroup(g)} disabled={deletingId === g.id}>
                  {deletingId === g.id ? "…" : "Delete"}
                </Button>
              </Row>
            </div>
            )
          ))}
        </div>
      </Card>
    </div>
  )
}
