"use client"

import { useState } from "react"
import { X, FileText } from "lucide-react"
import { interceptExternalClick } from "@/utils/openExternal"

/** Shown once, before a member's first self-service check-in with a klub that has a waiver_url set - a lightweight acknowledgment, not a collected/stored signature. */
export default function WaiverAckModal({
  clubName,
  waiverUrl,
  onAcknowledge,
  onClose,
}: {
  clubName: string
  waiverUrl: string
  onAcknowledge: () => void
  onClose: () => void
}) {
  const [checked, setChecked] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-sm max-h-[85vh] overflow-y-auto bg-[#1e2d12] border border-[#2e3d1a] rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 animate-[fadeUp_0.25s_ease-out_forwards]">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-lg font-black text-white">Waiver Required</p>
            <p className="text-xs text-white/40 mt-0.5">{clubName}</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 flex items-start gap-3 bg-[#1a2110] border border-[#2e3d1a] rounded-xl p-3">
          <FileText className="w-4 h-4 text-[#c5f135] shrink-0 mt-0.5" />
          <p className="text-xs text-white/70 leading-relaxed">
            {clubName} requires runners to sign a waiver before joining a run.
          </p>
        </div>

        <a
          href={waiverUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => interceptExternalClick(e, waiverUrl)}
          className="mt-3 flex items-center justify-center w-full py-2.5 rounded-xl text-sm font-black bg-[#1a2110] border border-[#c5f135]/30 text-[#c5f135] hover:border-[#c5f135]/60 transition"
        >
          View Waiver
        </a>

        <button
          onClick={() => setChecked((v) => !v)}
          className="mt-4 w-full flex items-center gap-3 text-left"
        >
          <span
            className={`w-5 h-5 rounded-md border shrink-0 flex items-center justify-center transition ${
              checked ? "bg-[#c5f135] border-[#c5f135]" : "border-white/30"
            }`}
          >
            {checked && <span className="w-2.5 h-2.5 rounded-sm bg-[#1a2110]" />}
          </span>
          <span className="text-xs text-white/70 leading-relaxed">
            I&apos;ve read and signed {clubName}&apos;s waiver
          </span>
        </button>

        <button
          onClick={onAcknowledge}
          disabled={!checked}
          className="mt-4 w-full py-3 rounded-2xl text-sm font-black bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45] transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue to Check In
        </button>
      </div>
    </div>
  )
}
