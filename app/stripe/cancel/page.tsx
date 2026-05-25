"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { Suspense } from "react"
import { X } from "lucide-react"

function CancelContent() {
  const params = useSearchParams()
  const router = useRouter()
  const clubId = params.get("club_id")

  return (
    <div className="min-h-screen bg-[#1a2110] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
        <X className="w-7 h-7 text-white/40" />
      </div>

      <h1 className="text-2xl font-black text-white mb-2">No worries</h1>
      <p className="text-sm text-white/40 max-w-xs leading-relaxed mb-8">
        Your payment was cancelled. You can upgrade your klub whenever you&apos;re ready.
      </p>

      <button
        onClick={() => router.push(clubId ? `/dashboard/${clubId}` : "/director")}
        className="px-6 py-3 bg-[#1e2d12] border border-[#2e3d1a] text-white font-semibold text-sm rounded-full hover:border-[#c5f135]/40 transition"
      >
        Back to Dashboard
      </button>
    </div>
  )
}

export default function CancelPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    }>
      <CancelContent />
    </Suspense>
  )
}
