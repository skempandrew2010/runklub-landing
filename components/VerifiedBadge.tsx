import { ShieldCheck } from "lucide-react"

/** compact renders just the check icon (tight spaces like dropdowns/map popups) instead of the full "VERIFIED" pill. */
export default function VerifiedBadge({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  if (compact) {
    return <ShieldCheck className={`w-3 h-3 text-[#c5f135] shrink-0 ${className}`} aria-label="Verified" />
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30 shrink-0 ${className}`}
    >
      <ShieldCheck className="w-2.5 h-2.5" /> VERIFIED
    </span>
  )
}
