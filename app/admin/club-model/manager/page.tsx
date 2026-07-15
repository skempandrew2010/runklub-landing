"use client"

import { useState } from "react"
import Link from "next/link"
import { useClubModelAccess } from "@/lib/clubModel/access"
import RegionsLocationsTab from "./RegionsLocationsTab"
import PaceGroupsTab from "./PaceGroupsTab"
import SchedulesTab from "./SchedulesTab"
import WorkoutsTab from "./WorkoutsTab"
import MembersTab from "./MembersTab"
import PlanSettingsTab from "./PlanSettingsTab"

const TABS = [
  { key: "regions", label: "Branches & Locations" },
  { key: "pace", label: "Pace Groups" },
  { key: "schedules", label: "Training Schedules" },
  { key: "workouts", label: "Workout Library" },
  { key: "members", label: "Members" },
  { key: "settings", label: "Plan & Settings" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export default function ClubModelManagerPage() {
  const ready = useClubModelAccess("manager")
  const [tab, setTab] = useState<TabKey>("regions")

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110]">
      <header className="bg-[#1e2d12] border-b border-[#2e3d1a]">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest">Admin prototype</p>
            <h1 className="text-xl font-black text-white">Club Manager Dashboard</h1>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Link href="/admin/club-model/join" className="text-sm font-bold text-[#c5f135] hover:text-[#d4fb4d]">
              Preview member signup →
            </Link>
            <div className="flex gap-3">
              <Link href="/admin/club-model/member-dashboard" className="text-xs text-white/60 hover:text-white/70">
                Member view
              </Link>
              <Link href="/admin/club-model/coach-view" className="text-xs text-white/60 hover:text-white/70">
                Coach view
              </Link>
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition ${
                tab === t.key
                  ? "border-[#c5f135] text-[#c5f135]"
                  : "border-transparent text-white/60 hover:text-white/70"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {tab === "regions" && <RegionsLocationsTab />}
        {tab === "pace" && <PaceGroupsTab />}
        {tab === "schedules" && <SchedulesTab />}
        {tab === "workouts" && <WorkoutsTab />}
        {tab === "members" && <MembersTab />}
        {tab === "settings" && <PlanSettingsTab />}
      </main>
    </div>
  )
}
