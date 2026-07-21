"use client"

import { useEffect, useState } from "react"
import { fetchClubModelData, insertRow, deleteRow, updateRow, setTestTier } from "@/lib/clubModel/api"
import { supabase } from "@/lib/supabase"
import { regionLimitForTier, nextTierForMoreRegions, type ClubModelTier } from "@/lib/clubModel/tierGate"
import { PLANS } from "@/lib/plans"
import type { Region, RegionDay, RegionDayTime, Location } from "@/lib/clubModel/types"
import { DAYS_OF_WEEK } from "@/lib/clubModel/types"
import { Card, SectionTitle, Input, Button, Row } from "./ui"

export default function RegionsLocationsTab({ clubId }: { clubId: string }) {
  const [regions, setRegions] = useState<Region[]>([])
  const [regionDays, setRegionDays] = useState<RegionDay[]>([])
  const [regionDayTimes, setRegionDayTimes] = useState<RegionDayTime[]>([])
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({})
  const [locations, setLocations] = useState<Location[]>([])
  const [tier, setTier] = useState<ClubModelTier | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)
  const [mutateError, setMutateError] = useState("")
  const [newRegionName, setNewRegionName] = useState("")
  const [newLocation, setNewLocation] = useState<Record<string, Partial<Location>>>({})

  const load = async () => {
    const [data, { data: club }] = await Promise.all([
      fetchClubModelData(clubId),
      supabase.from("clubs").select("tier").eq("id", clubId).single(),
    ])
    setRegions(data.regions.slice().sort((a, b) => a.name.localeCompare(b.name)))
    setRegionDays(data.region_days)
    setRegionDayTimes(data.region_day_times)
    setLocations(data.locations.slice().sort((a, b) => a.name.localeCompare(b.name)))
    setTier(club?.tier === "starter" || club?.tier === "growth" || club?.tier === "enterprise" ? club.tier : null)
    setLoading(false)
  }

  useEffect(() => { load() }, [clubId])

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

  const mutate = async (fn: () => Promise<void>) => {
    setMutateError("")
    try {
      await fn()
      load()
    } catch (err: any) {
      setMutateError(err?.message ?? "Something went wrong.")
    }
  }

  const addRegion = () => mutate(async () => {
    if (!newRegionName.trim()) return
    await insertRow("regions", { club_id: clubId, name: newRegionName.trim() }, clubId)
    setNewRegionName("")
  })

  const deleteRegion = (id: string, name: string) => {
    if (!confirm(`Delete the "${name}" branch? This will also remove all its locations. This cannot be undone.`)) return
    mutate(() => deleteRow("regions", { id }, clubId))
  }

  const toggleMeets = (day: RegionDay) => mutate(() => updateRow("region_days", { id: day.id }, { meets: !day.meets }, clubId))

  const addLocation = (regionId: string) => mutate(async () => {
    const draft = newLocation[regionId]
    if (!draft?.name?.trim()) return
    await insertRow("locations", { region_id: regionId, name: draft.name.trim(), address: draft.address ?? null }, clubId)
    setNewLocation((prev) => ({ ...prev, [regionId]: {} }))
  })

  const deleteLocation = (id: string) => mutate(() => deleteRow("locations", { id }, clubId))

  const addTime = (day: RegionDay) => {
    const raw = timeDrafts[day.id]?.trim()
    if (!raw) return
    mutate(async () => {
      await insertRow("region_day_times", { region_day_id: day.id, time: raw, location_id: null }, clubId)
      setTimeDrafts((prev) => ({ ...prev, [day.id]: "" }))
    })
  }

  const deleteTime = (id: string) => mutate(() => deleteRow("region_day_times", { id }, clubId))

  const fmt12h = (t: string) => {
    const [hStr, mStr] = t.split(":")
    const h = parseInt(hStr, 10)
    const m = mStr ?? "00"
    const ampm = h < 12 ? "AM" : "PM"
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${m} ${ampm}`
  }

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  return (
    <>
    {mutateError && (
      <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
        {mutateError}
      </div>
    )}
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
        const draft = newLocation[region.id] ?? {}

        return (
          <Card key={region.id}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-white">{region.name}</h3>
              <Button variant="danger" onClick={() => deleteRegion(region.id, region.name)}>Delete branch</Button>
            </div>

            <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Which days do you meet?</p>
            <div className="flex flex-wrap gap-2 mb-4">
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

            {days.some((d) => d.meets) && (
              <div className="space-y-2 mb-4">
                <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Meeting times</p>
                {days.filter((d) => d.meets).map((day) => {
                  const times = regionDayTimes.filter((t) => t.region_day_id === day.id)
                    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))
                  return (
                    <div key={day.id} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white/50 w-8 shrink-0">{day.day_of_week.slice(0, 3)}</span>
                      {times.map((t) => (
                        <span key={t.id} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#1e2d12] border border-[#2e3d1a] text-white/80">
                          {t.time ? fmt12h(t.time) : "—"}
                          <button onClick={() => deleteTime(t.id)} className="text-white/30 hover:text-red-400 transition ml-0.5">×</button>
                        </span>
                      ))}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="time"
                          value={timeDrafts[day.id] ?? ""}
                          onChange={(e) => setTimeDrafts((prev) => ({ ...prev, [day.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && addTime(day)}
                          className="bg-[#111a0a] border border-[#2e3d1a] rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-[#c5f135]/50 [color-scheme:dark]"
                        />
                        <button
                          onClick={() => addTime(day)}
                          disabled={!timeDrafts[day.id]}
                          className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#c5f135]/10 text-[#c5f135] border border-[#c5f135]/30 hover:bg-[#c5f135]/20 disabled:opacity-30 transition"
                        >
                          + Add
                        </button>
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
    </>
  )
}
