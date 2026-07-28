"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// The Hub now lives at "/" for signed-in users — this route just forwards
// old links/bookmarks there instead of duplicating the page.
export default function TodayRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/")
  }, [router])
  return null
}
