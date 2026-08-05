import { ShieldCheck } from "lucide-react"

export default function VerifiedBadge({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30 shrink-0">
        <ShieldCheck className="w-2.5 h-2.5" />
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#c5f135]/15 text-[#c5f135] border border-[#c5f135]/30">
      <ShieldCheck className="w-2.5 h-2.5" /> VERIFIED
    </span>
  )
}
