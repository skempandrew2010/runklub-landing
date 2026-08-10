"use client"

import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"

type CustomPace = { id: string; label: string }

export default function CustomPacesTab({ clubId }: { clubId: string }) {
  const [paces, setPaces] = useState<CustomPace[]>([])
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data } = await supabase.from("club_custom_paces").select("id, label").eq("club_id", clubId).order("label")
    setPaces((data as CustomPace[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [clubId])

  const addPace = async () => {
    const label = draft.trim()
    if (!label) return
    setSaving(true)
    await supabase.from("club_custom_paces").insert({ club_id: clubId, label })
    setDraft("")
    await load()
    setSaving(false)
  }

  const deletePace = async (id: string) => {
    await supabase.from("club_custom_paces").delete().eq("id", id)
    load()
  }

  if (loading) return <p className="text-white/60 text-sm">Loading…</p>

  return (
    <div>
      <p className="text-xs text-white/80 mb-3">
        Add specific paces (e.g. &ldquo;6:30/mi&rdquo; or &ldquo;Yasso 800 pace&rdquo;) to offer alongside the built-in list when building workout segments.
      </p>
      <div className="flex gap-2 mb-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPace()}
          placeholder="e.g. 6:30/mi"
          className="flex-1 min-w-0 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/50 transition"
        />
        <button
          onClick={addPace}
          disabled={saving || !draft.trim()}
          className="shrink-0 px-4 py-2 rounded-xl bg-[#c5f135] text-[#1a2110] text-sm font-black hover:bg-[#d4ff45] transition disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {paces.length === 0 ? (
        <p className="text-sm text-white/50">No custom paces yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {paces.map((p) => (
            <span key={p.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#1a2110] border border-[#2e3d1a] text-white/80">
              {p.label}
              <button onClick={() => deletePace(p.id)} className="text-white/30 hover:text-red-400 transition" aria-label={`Remove ${p.label}`}>
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
