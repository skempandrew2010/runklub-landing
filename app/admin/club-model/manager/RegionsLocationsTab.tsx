"use client"

import { useEffect, useState } from "react"
import { fetchClubModelData, insertRow, deleteRow, setTestTier } from "@/lib/clubModel/api"
import { supabase } from "@/lib/supabase"
import { regionLimitForTier, nextTierForMoreRegions, type ClubModelTier } from "@/lib/clubModel/tierGate"
import { PLANS } from "@/lib/plans"
import type { Region, Location } from "@/lib/clubModel/types"
import { Card, SectionTitle, Input, Button, Row } from "./ui"
import AddressAutocomplete from "@/components/AddressAutocomplete"

export default function RegionsLocationsTab({ clubId }: { clubId: string }) {
  const [regions, setRegions] = useState<Region[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [tier, setTier] = useState<ClubModelTier | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)
  const [mutateError, setMutateError] = useState("")
  const [newRegionName, setNewRegionName] = useState("")
  const [newLocation, setNewLocation] = useState<Record<string, Partial<Location>>>({})
  const [clubHome, setClubHome] = useState<{ lat: number; lng: number } | null>(null)

  const load = async () => {
    const [data, { data: club }] = await Promise.all([
      fetchClubModelData(clubId),
      supabase.from("clubs").select("tier, latitude, longitude").eq("id", clubId).single(),
    ])
    setRegions(data.regions.slice().sort((a, b) => a.name.localeCompare(b.name)))
    setLocations(data.locations.slice().sort((a, b) => a.name.localeCompare(b.name)))
    setTier(club?.tier === "starter" || club?.tier === "growth" || club?.tier === "enterprise" ? club.tier : null)
    setClubHome(club?.latitude != null && club?.longitude != null ? { lat: club.latitude, lng: club.longitude } : null)
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

  const addLocation = (regionId: string) => mutate(async () => {
    const draft = newLocation[regionId]
    if (!draft?.name?.trim()) return
    await insertRow(
      "locations",
      { region_id: regionId, name: draft.name.trim(), address: draft.address ?? null, lat: draft.lat ?? null, lng: draft.lng ?? null },
      clubId
    )
    setNewLocation((prev) => ({ ...prev, [regionId]: {} }))
  })

  const deleteLocation = (id: string) => mutate(() => deleteRow("locations", { id }, clubId))

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
        const draft = newLocation[region.id] ?? {}

        return (
          <Card key={region.id}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-white">{region.name}</h3>
              <Button variant="danger" onClick={() => deleteRegion(region.id, region.name)}>Delete branch</Button>
            </div>

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
                  <AddressAutocomplete
                    placeholder="Address or place name"
                    value={draft.address ?? ""}
                    onChange={(v) => setNewLocation((p) => ({ ...p, [region.id]: { ...draft, address: v, lat: null, lng: null } }))}
                    onSelect={(s) => setNewLocation((p) => ({ ...p, [region.id]: { ...draft, address: s.placeName, lat: s.lat, lng: s.lng } }))}
                    proximity={clubHome}
                    className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:border-[#c5f135]/50 transition"
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
