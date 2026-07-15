"use client"

import { useEffect, useState } from "react"
import { fetchClubModelData, insertRow, deleteRow, setTestTier } from "@/lib/clubModel/api"
import { supabase } from "@/lib/supabase"
import { CLUB_ID } from "@/lib/clubModel/constants"
import { coachLimitForTier, nextTierForMoreCoaches, type ClubModelTier } from "@/lib/clubModel/tierGate"
import { PLANS } from "@/lib/plans"
import type { Coach, Location, LocationCoach } from "@/lib/clubModel/types"
import { Card, SectionTitle, Input, Button, Row } from "./ui"

export default function CoachesTab() {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [assignments, setAssignments] = useState<LocationCoach[]>([])
  const [tier, setTier] = useState<ClubModelTier | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)
  const [draft, setDraft] = useState<Partial<Coach>>({})

  const load = async () => {
    const [data, { data: club }] = await Promise.all([
      fetchClubModelData(),
      supabase.from("clubs").select("tier").eq("id", CLUB_ID).single(),
    ])
    setCoaches(data.coaches.slice().sort((a, b) => a.name.localeCompare(b.name)))
    setLocations(data.locations.slice().sort((a, b) => a.name.localeCompare(b.name)))
    setAssignments(data.location_coaches)
    setTier(club?.tier === "starter" || club?.tier === "growth" || club?.tier === "enterprise" ? club.tier : null)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const coachLimit = coachLimitForTier(tier)
  const atCoachLimit = coachLimit !== null && coaches.length >= coachLimit
  const upgradeTarget = nextTierForMoreCoaches(tier)

  const simulateUpgrade = async () => {
    setUpgrading(true)
    try {
      await setTestTier(upgradeTarget)
      await load()
    } finally {
      setUpgrading(false)
    }
  }

  const addCoach = async () => {
    if (!draft.name?.trim()) return
    await insertRow("coaches", {
      club_id: CLUB_ID,
      name: draft.name.trim(),
      email: draft.email ?? null,
      phone: draft.phone ?? null,
    })
    setDraft({})
    load()
  }

  const deleteCoach = async (id: string) => {
    await deleteRow("coaches", { id })
    load()
  }

  const toggleAssignment = async (coachId: string, locationId: string, assigned: boolean) => {
    if (assigned) {
      await deleteRow("location_coaches", { coach_id: coachId, location_id: locationId })
    } else {
      await insertRow("location_coaches", { coach_id: coachId, location_id: locationId })
    }
    load()
  }

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle>Add a coach</SectionTitle>
        {atCoachLimit ? (
          <div className="bg-[#1a2110] border border-[#c5f135]/25 rounded-xl px-4 py-3">
            <p className="text-sm text-white/70 mb-3">
              Your plan is limited to {coachLimit} coach{coachLimit === 1 ? "" : "es"}.
            </p>
            <Button onClick={simulateUpgrade} disabled={upgrading}>
              {upgrading ? "Upgrading…" : `Become a ${PLANS[upgradeTarget].name} member`}
            </Button>
          </div>
        ) : (
          <Row>
            <div className="flex-1 min-w-[160px]">
              <Input placeholder="Name" value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Input placeholder="Email" value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </div>
            <div className="flex-1 min-w-[160px]">
              <Input placeholder="Phone" value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </div>
            <Button onClick={addCoach}>Add coach</Button>
          </Row>
        )}
      </Card>

      {coaches.map((coach) => (
        <Card key={coach.id}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-black text-white">{coach.name}</h3>
            <Button variant="danger" onClick={() => deleteCoach(coach.id)}>Delete</Button>
          </div>
          <p className="text-xs text-white/60 mb-3">{[coach.email, coach.phone].filter(Boolean).join(" · ")}</p>

          <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Assigned locations</p>
          <div className="flex flex-wrap gap-2">
            {locations.map((loc) => {
              const assigned = assignments.some((a) => a.coach_id === coach.id && a.location_id === loc.id)
              return (
                <button
                  key={loc.id}
                  onClick={() => toggleAssignment(coach.id, loc.id, assigned)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                    assigned
                      ? "bg-[#c5f135] border-[#c5f135] text-[#1a2110]"
                      : "bg-[#1a2110] border-[#2e3d1a] text-white/50 hover:border-[#c5f135]/40"
                  }`}
                >
                  {loc.name}
                </button>
              )
            })}
            {locations.length === 0 && <p className="text-sm text-white/50">No locations yet — add some in Regions & Locations.</p>}
          </div>
        </Card>
      ))}
    </div>
  )
}
