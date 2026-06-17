"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// This page exists so the root URL handles Supabase auth redirects correctly.
// A server-side redirect (next.config.ts) would drop the #access_token hash
// before the browser can read it. A client-side redirect preserves the hash.
export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash
    const isAuthRedirect =
      hash.includes("access_token=") &&
      (hash.includes("type=invite") || hash.includes("type=magiclink"))

    if (isAuthRedirect) {
      // Forward to /welcome with the auth hash so Supabase can sign the user in
      router.replace(`/welcome${hash}`)
    } else {
      router.replace("/explore")
    }
  }, [router])

  return (
    <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
    </div>
  )
}
