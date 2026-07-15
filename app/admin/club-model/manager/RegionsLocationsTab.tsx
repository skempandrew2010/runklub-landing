"use client"

import { useEffect, useState } from "react"
import { fetchClubModelData, insertRow, deleteRow, updateRow, setTestTier } from "@/lib/clubModel/api"
import { supabase } from "@/lib/supabase"
import { CLUB_ID } from "@/lib/clubModel/constants"
import { regionLimitForTier, nextTierForMoreRegions, type ClubModelTier } from "@/lib/clubModel/tierGate"
import { PLANS } from "@/lib/plans"
import type { Region, RegionDay, RegionDayTime, Location } from "@/lib/clubModel/types"
import { DAYS_OF_WEEK } from "@/lib/clubModel/types"
import { Card, SectionTitle, Input, Select, Button, Row } from "./ui"

export default function RegionsLocationsTab() {
  const [regions, setRegions] = useState<Region[]>([])
  const [regionDays, setRegionDays] = useState<RegionDay[]>([])
  const [regionDayTimes, setRegionDayTimes] = useState<RegionDayTime[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [tier, setTier] = useState<ClubModelTier | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)
  const [newRegionName, setNewRegionName] = useState("")
  const [newLocation, setNewLocation] = useState<Record<string, Partial<Location>>>({})
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({})

  const load = async () => {
    const [data, { data: club }] = await Promise.all([
      fetchClubModelData(),
      supabase.from("clubs").select("tier").eq("id", CLUB_ID).single(),
    ])
    setRegions(data.regions.slice().sort((a, b) => a.name.localeCompare(b.name)))
    setRegionDays(data.region_days)
    setRegionDayTimes(data.region_day_times)
    setLocations(data.locations.slice().sort((a, b) => a.name.localeCompare(b.name)))
    setTier(club?.tier === "starter" || club?.tier === "growth" || club?.tier === "enterprise" ? club.tier : null)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const regionLimit = regionLimitForTier(tier)
  const atRegionLimit = regionLimit !== null && regions.length >= regionLimit
  const upgradeTarget = nextTierForMoreRegions(tier)

  const simulateUpgrade = async () => {
    setUpgrading(true)
    try {
      await setTestTier(upgradeTarget)
      await load()
    } finally {
      setUpgrading(false)
    }
  }

  const addRegion = async () => {
    if (!newRegionName.trim()) return
    await insertRow("regions", { club_id: CLUB_ID, name: newRegionName.trim() })
    setNewRegionName("")
    load()
  }

  const deleteRegion = async (id: string) => {
    await deleteRow("regions", { id })
    load()
  }

  const toggleMeets = async (day: RegionDay) => {
    await updateRow("region_days", { id: day.id }, { meets: !day.meets })
    load()
  }

  const addSlot = async (day: RegionDay) => {
    await insertRow("region_day_times", { region_day_id: day.id, location_id: null, time: null })
    load()
  }

  const deleteSlot = async (id: string) => {
    await deleteRow("region_day_times", { id })
    load()
  }

  const setSlotLocation = async (slot: RegionDayTime, locationId: string) => {
    await updateRow("region_day_times", { id: slot.id }, { location_id: locationId || null })
    load()
  }

  const saveSlotTime = async (slot: RegionDayTime) => {
    const draft = timeDrafts[slot.id]
    if (draft === undefined || draft === (slot.time ?? "")) return
    await updateRow("region_day_times", { id: slot.id }, { time: draft.trim() || null })
    load()
  }

  const addLocation = async (regionId: string) => {
    const draft = newLocation[regionId]
    if (!draft?.name?.trim()) return
    await insertRow("locations", {
      region_id: regionId,
      name: draft.name.trim(),
      address: draft.address ?? null,
    })
    setNewLocation((prev) => ({ ...prev, [regionId]: {} }))
    load()
  }

  const deleteLocation = async (id: string) => {
    await deleteRow("locations", { id })
    load()
  }

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle>Add a branch</SectionTitle>
        {atRegionLimit ? (
          <div className="bg-[#1a2110] border border-[#c5f135]/25 rounded-xl px-4 py-3">
            <p className="text-sm text-white/70 mb-3">
              {regionLimit === 0
                ? "Your Starter plan doesn't include branches yet — it's built around one weekly location instead."
                : `Your plan is limited to ${regionLimit} branch${regionLimit === 1 ? "" : "es"}.`}
            </p>
            <Button onClick={simulateUpgrade} disabled={upgrading}>
              {upgrading ? "Upgrading…" : `Become a ${PLANS[upgradeTarget].name} member`}
            </Button>
          </div>
        ) : (
          <Row>
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Branch name, e.g. Boulder"
                value={newRegionName}
                onChange={(e) => setNewRegionName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRegion()}
              />
            </div>
            <Button onClick={addRegion}>Add branch</Button>
          </Row>
        )}
      </Card>

      {regions.map((region) => {
        const regionLocations = locations.filter((l) => l.region_id === region.id)
        const days = DAYS_OF_WEEK.map((d) => regionDays.find((rd) => rd.region_id === region.id && rd.day_of_week === d))
          .filter((d): d is RegionDay => !!d)
        const activeDays = days.filter((d) => d.meets)
        const draft = newLocation[region.id] ?? {}

        return (
          <Card key={region.id}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-white">{region.name}</h3>
              <Button variant="danger" onClick={() => deleteRegion(region.id)}>Delete branch</Button>
            </div>

            <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Which days do you meet?</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {days.map((day) => (
                <button
                  key={day.id}
                  onClick={() => toggleMeets(day)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                    day.meets
                      ? "bg-[#c5f135] border-[#c5f135] text-[#1a2110]"
                      : "bg-[#1a2110] border-[#2e3d1a] text-white/60 hover:border-[#c5f135]/40"
                  }`}
                >
                  {day.day_of_week.slice(0, 3)}
                </button>
              ))}
            </div>

            {activeDays.length > 0 && (
              <div className="space-y-3 mb-4">
                <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Where do you meet?</p>
                {activeDays.map((day) => {
                  const slots = regionDayTimes.filter((t) => t.region_day_id === day.id)
                  return (
                    <div key={day.id} className="bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white">{day.day_of_week}</span>
                        <Button variant="ghost" onClick={() => addSlot(day)}>+ Add time</Button>
                      </div>
                      {slots.length === 0 && (
                        <p className="text-xs text-white/50">No meeting times set yet.</p>
                      )}
                      <div className="space-y-2">
                        {slots.map((slot) => (
                          <div key={slot.id} className="flex items-center gap-2">
                            <div className="flex-1 min-w-[140px]">
                              <Select
                                value={slot.location_id ?? ""}
                                onChange={(e) => setSlotLocation(slot, e.target.value)}
                              >
                                <option value="">No location set</option>
                                {regionLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                              </Select>
                            </div>
                            <div className="w-32 shrink-0">
                              <Input
                                placeholder="Time"
                                value={timeDrafts[slot.id] ?? slot.time ?? ""}
                                onChange={(e) => setTimeDrafts((p) => ({ ...p, [slot.id]: e.target.value }))}
                                onBlur={() => saveSlotTime(slot)}
                              />
                            </div>
                            <Button variant="danger" onClick={() => deleteSlot(slot.id)}>Remove</Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="space-y-2 mb-4">
              <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Locations in {region.name} branch</p>
              {regionLocations.length === 0 && (
                <p className="text-sm text-white/50">No locations yet.</p>
              )}
              {regionLocations.map((loc) => (
                <div key={loc.id} className="flex items-center justify-between gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2">
                  <div>
                    <p className="text-sm font-bold text-white">{loc.name}</p>
                    {loc.address && <p className="text-xs text-white/60">{loc.address}</p>}
                  </div>
                  <Button variant="danger" onClick={() => deleteLocation(loc.id)}>Delete</Button>
                </div>
              ))}
            </div>

            <div className="border-t border-[#2e3d1a] pt-3">
              <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Add a location</p>
              <Row>
                <div className="flex-1 min-w-[160px]">
                  <Input
                    placeholder="Name"
                    value={draft.name ?? ""}
                    onChange={(e) => setNewLocation((p) => ({ ...p, [region.id]: { ...draft, name: e.target.value } }))}
                  />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <Input
                    placeholder="Address"
                    value={draft.address ?? ""}
                    onChange={(e) => setNewLocation((p) => ({ ...p, [region.id]: { ...draft, address: e.target.value } }))}
                  />
                </div>
                <Button onClick={() => addLocation(region.id)}>Add location</Button>
              </Row>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
