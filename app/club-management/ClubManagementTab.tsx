"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { CLUB_ID } from "@/lib/clubModel/constants"
import RegionsLocationsTab from "@/app/admin/club-model/manager/RegionsLocationsTab"
import PaceGroupsTab from "@/app/admin/club-model/manager/PaceGroupsTab"
import SchedulesTab from "@/app/admin/club-model/manager/SchedulesTab"
import WorkoutsTab from "@/app/admin/club-model/manager/WorkoutsTab"
import MembersTab from "@/app/admin/club-model/manager/MembersTab"
import PlanSettingsTab from "@/app/admin/club-model/manager/PlanSettingsTab"
import ClubModelMessagesTab from "./ClubModelMessagesTab"

const SUB_TABS = [
  { key: "regions", label: "Regions & Locations" },
  { key: "pace", label: "Pace Groups" },
  { key: "schedules", label: "Training Schedules" },
  { key: "workouts", label: "Workout Library" },
  { key: "members", label: "Members" },
  { key: "messages", label: "Messages" },
  { key: "settings", label: "Plan & Settings" },
] as const
type SubTabKey = (typeof SUB_TABS)[number]["key"]

// The club-management (pace group / region / coach) system is scoped to the
// one seeded test club today — see lib/clubModel/constants.ts. Any other
// director's club shows a placeholder instead of erroring.
export default function ClubManagementTab({ clubId }: { clubId: string }) {
  const [tier, setTier] = useState<string | null | undefined>(undefined)
  const [subTab, setSubTab] = useState<SubTabKey>("regions")

  useEffect(() => {
    if (clubId !== CLUB_ID) return
    supabase.from("clubs").select("tier").eq("id", clubId).single().then(({ data }) => {
      const t = data?.tier ?? null
      setTier(t)
      if (t !== "starter" && t !== "pro" && t !== "premium") setSubTab("settings")
    })
  }, [clubId])

  if (clubId !== CLUB_ID) {
    return (
      <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-8 text-center">
        <p className="text-white/60 text-sm">Club Management isn&rsquo;t set up for this club yet.</p>
      </div>
    )
  }

  if (tier === undefined) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  const locked = tier !== "starter" && tier !== "pro" && tier !== "premium"

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto mb-6 border-b border-[#2e3d1a]">
        {SUB_TABS.map((t) => {
          const disabled = locked && t.key !== "settings"
          return (
            <button
              key={t.key}
              onClick={() => !disabled && setSubTab(t.key)}
              disabled={disabled}
              className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition disabled:opacity-30 disabled:cursor-not-allowed ${
                subTab === t.key ? "border-[#c5f135] text-[#c5f135]" : "border-transparent text-white/60 hover:text-white/70"
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {locked && subTab === "settings" && (
        <div className="bg-[#1e2d12] border border-[#c5f135]/25 rounded-2xl p-6 text-center mb-6">
          <p className="text-sm text-white/70 mb-1">Club Management needs a paid plan to unlock.</p>
          <p className="text-xs text-white/50">Choose Starter, Pro, or Premium below to get started.</p>
        </div>
      )}

      {!locked && subTab === "regions" && <RegionsLocationsTab />}
      {!locked && subTab === "pace" && <PaceGroupsTab />}
      {!locked && subTab === "schedules" && <SchedulesTab />}
      {!locked && subTab === "workouts" && <WorkoutsTab />}
      {!locked && subTab === "members" && <MembersTab />}
      {!locked && subTab === "messages" && <ClubModelMessagesTab />}
      {subTab === "settings" && <PlanSettingsTab />}
    </div>
  )
}
