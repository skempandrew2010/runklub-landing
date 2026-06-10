import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Page Not Found",
}

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#1a2110] flex flex-col items-center justify-center px-6 text-center">
      <div className="mb-6">
        <span className="text-8xl font-black text-[#c5f135] leading-none">404</span>
      </div>
      <h1 className="text-xl font-bold text-white mb-2">Page not found</h1>
      <p className="text-white/40 text-sm max-w-xs mb-8">
        This page doesn&apos;t exist or may have been moved. Head back to discover run clubs near you.
      </p>
      <Link
        href="/explore"
        className="px-6 py-3 bg-[#c5f135] text-[#1a2110] font-black text-sm rounded-2xl hover:bg-[#d4ff45] transition"
      >
        Discover Clubs
      </Link>
    </div>
  )
}
