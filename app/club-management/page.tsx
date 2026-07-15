"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// This route has been consolidated into /director
export default function ClubManagementPage() {
  const router = useRouter()
  useEffect(() => { router.replace("/director") }, [router])
  return (
    <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
    </div>
  )
}
