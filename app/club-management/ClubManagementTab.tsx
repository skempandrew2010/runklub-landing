"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import RegionsLocationsTab from "@/app/admin/club-model/manager/RegionsLocationsTab"
import PaceGroupsTab from "@/app/admin/club-model/manager/PaceGroupsTab"
import SchedulesTab from "@/app/admin/club-model/manager/SchedulesTab"
import WorkoutsTab from "@/app/admin/club-model/manager/WorkoutsTab"
import CoachesTab from "@/app/admin/club-model/manager/CoachesTab"
import PlanSettingsTab from "@/app/admin/club-model/manager/PlanSettingsTab"
import ClubModelMessagesTab from "./ClubModelMessagesTab"

// Tabs available at each tier level
const TIER_TABS: Record<string, string[]> = {
  starter: ["coaches", "messages", "settings"],
  pro:     ["coaches", "regions", "pace", "schedules", "workouts", "messages", "settings"],
  premium: ["coaches", "regions", "pace", "schedules", "workouts", "messages", "settings"],
}

const ALL_TABS = [
  { key: "coaches",   label: "Coaches" },
  { key: "regions",   label: "Regions & Locations" },
  { key: "pace",      label: "Pace Groups" },
  { key: "schedules", label: "Training Schedules" },
  { key: "workouts",  label: "Workout Library" },
  { key: "messages",  label: "Messages" },
  { key: "settings",  label: "Plan & Settings" },
] as const
type SubTabKey = (typeof ALL_TABS)[number]["key"]

export default function ClubManagementTab({ clubId, passedTier }: { clubId: string; passedTier?: string | null }) {
  const [tier, setTier] = useState<string | null | undefined>(passedTier !== undefined ? passedTier : undefined)
  const [subTab, setSubTab] = useState<SubTabKey>("coaches")

  useEffect(() => {
    if (passedTier !== undefined) { setTier(passedTier); return }
    supabase.from("clubs").select("tier").eq("id", clubId).single().then(({ data }) => {
      setTier(data?.tier ?? null)
    })
  }, [clubId, passedTier])

  if (tier === undefined) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  const allowedKeys = new Set(TIER_TABS[tier ?? ""] ?? ["settings"])
  const visibleTabs = ALL_TABS.filter((t) => allowedKeys.has(t.key))
  const activeTab = allowedKeys.has(subTab) ? subTab : (visibleTabs[0]?.key ?? "settings")

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto mb-6 border-b border-[#2e3d1a]">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition ${
              activeTab === t.key ? "border-[#c5f135] text-[#c5f135]" : "border-transparent text-white/60 hover:text-white/70"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "coaches"   && <CoachesTab />}
      {activeTab === "regions"   && <RegionsLocationsTab />}
      {activeTab === "pace"      && <PaceGroupsTab />}
      {activeTab === "schedules" && <SchedulesTab />}
      {activeTab === "workouts"  && <WorkoutsTab />}
      {activeTab === "messages"  && <ClubModelMessagesTab />}
      {activeTab === "settings"  && <PlanSettingsTab />}
    </div>
  )
}
