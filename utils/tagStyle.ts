const TAG_STYLES: Record<string, string> = {
  // Pace
  "Easy":                   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Moderate":               "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  "Fast":                   "bg-red-500/15 text-red-400 border-red-500/30",
  "All Paces":              "bg-[#2e3d1a] text-[#c5f135]/70 border-[#3d5220]",
  // Type
  "Social Run":             "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Long Run":               "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Speed Work":             "bg-red-500/15 text-red-400 border-red-500/30",
  "Trail Run":              "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Race Prep":              "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Fun Run":                "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "Night Run":              "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  // Vibe
  "Beer After":             "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Coffee After":           "bg-amber-700/15 text-amber-500 border-amber-700/30",
  "Dog Friendly":           "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "Beginner Friendly":      "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "No Drop":                "bg-[#2e3d1a] text-[#c5f135]/70 border-[#3d5220]",
  "First Timers Welcome":   "bg-[#2e3d1a] text-[#c5f135] border-[#c5f135]/40",
  "Traveler Friendly":      "bg-sky-500/15 text-sky-400 border-sky-500/30",
  "Rain or Shine":          "bg-slate-500/15 text-slate-400 border-slate-500/30",
  "Stroller Friendly":      "bg-teal-500/15 text-teal-300 border-teal-500/30",
}

export function getTagStyle(tag: string): string {
  return TAG_STYLES[tag] ?? "bg-[#2e3d1a] text-[#c5f135]/70 border-[#3d5220]"
}
