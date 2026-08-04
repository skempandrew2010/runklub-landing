import Link from "next/link"
import { Mail } from "lucide-react"
import { interceptExternalClick } from "@/utils/openExternal"

export default function Footer() {
  return (
    <div className="border-t border-[#2e3d1a] px-6 pt-8 pb-6 space-y-5">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black text-white">Run<span className="text-[#c5f135]">Klub</span></p>
          <p className="text-xs text-white/30 mt-0.5">Find verified run klubs anywhere.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <a
            href="https://www.instagram.com/runklubapp/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => interceptExternalClick(e, "https://www.instagram.com/runklubapp/")}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1e2d12] border border-[#2e3d1a] text-white/60 hover:text-white hover:border-[#c5f135]/40 transition text-xs font-semibold"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
            </svg>
            @runklubapp
          </a>
          <a
            href="mailto:runklubinfo@gmail.com"
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1e2d12] border border-[#2e3d1a] text-white/60 hover:text-white hover:border-[#c5f135]/40 transition text-xs font-semibold"
          >
            <Mail className="w-3.5 h-3.5" />
            runklubinfo@gmail.com
          </a>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#2e3d1a]">
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          <Link href="/terms" className="text-xs text-white/25 hover:text-white/50 transition">Terms of Service</Link>
          <Link href="/privacy" className="text-xs text-white/25 hover:text-white/50 transition">Privacy Policy</Link>
          <Link href="/community" className="text-xs text-white/25 hover:text-white/50 transition">Community Guidelines</Link>
        </div>
        <p className="text-xs text-white/15">© {new Date().getFullYear()} RunKlub</p>
      </div>
    </div>
  )
}
