"use client"

import { useEffect, useState } from "react"
import { X, Check } from "lucide-react"
import { getRunAttendees, tagRunBuddies, type RunAttendee } from "@/lib/challenges"
import ModalPortal from "@/components/ModalPortal"

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

/** Low-friction, fully skippable "who'd you run with?" step - powers Bring a Friend / Klub Crew. */
export default function BuddyPicker({
  runId,
  checkInId,
  userId,
  onDone,
}: {
  runId: string
  checkInId: string
  userId: string
  onDone: (taggedUserIds: string[]) => void
}) {
  const [attendees, setAttendees] = useState<RunAttendee[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getRunAttendees(runId, userId).then((rows) => {
      setAttendees(rows)
      setLoading(false)
    })
  }, [runId, userId])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submit = async () => {
    if (selected.size === 0) { onDone([]); return }
    setSubmitting(true)
    await tagRunBuddies(checkInId, Array.from(selected))
    setSubmitting(false)
    onDone(Array.from(selected))
  }

  // Nobody else has checked in yet - nothing to tag, skip the step entirely.
  if (!loading && attendees.length === 0) return null

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-sm max-h-[85vh] overflow-y-auto bg-[#1e2d12] border border-[#2e3d1a] rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 animate-[fadeUp_0.25s_ease-out_forwards]">
        <div className="flex items-center justify-between mb-1">
          <p className="text-lg font-black text-white">Who&apos;d you run with?</p>
          <button onClick={() => onDone([])} className="text-white/30 hover:text-white/60 transition p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-white/40 mb-4">Tag friends who checked in with you - totally optional.</p>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto mb-4">
            {attendees.map((a) => {
              const isSelected = selected.has(a.user_id)
              const name = a.display_name || "Runner"
              return (
                <button
                  key={a.user_id}
                  onClick={() => toggle(a.user_id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition text-left ${
                    isSelected ? "bg-[#c5f135]/10 border-[#c5f135]/40" : "bg-[#1a2110] border-[#2e3d1a] hover:border-white/20"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0 overflow-hidden">
                    {a.avatar_url ? (
                      <img src={a.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-[#c5f135]">{initialsOf(name)}</span>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-white flex-1 truncate">{name}</span>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? "bg-[#c5f135] border-[#c5f135]" : "border-white/20"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-[#1a2110]" strokeWidth={3} />}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => onDone([])}
            className="flex-1 py-2.5 rounded-full text-sm font-bold text-white/50 hover:text-white/70 transition"
          >
            Skip
          </button>
          <button
            onClick={submit}
            disabled={submitting || loading}
            className="flex-1 py-2.5 rounded-full bg-[#c5f135] text-[#1a2110] text-sm font-black hover:bg-[#d4ff45] transition disabled:opacity-40"
          >
            {submitting ? "…" : selected.size > 0 ? `Tag ${selected.size}` : "Done"}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
