"use client"

import dynamic from "next/dynamic"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const NavBar = dynamic(() => import("./navBar"), {
  ssr: false,
  loading: () => <nav className="sticky top-0 z-50 bg-[#1a2110] border-b border-[#2e3d1a]" style={{ height: 'var(--navbar-h)' }} />,
})

const SHELL_HIDDEN_ROUTES = ["/login", "/onboarding"]

const PUBLIC_ROUTES = [
  "/login",
  "/onboarding",
  "/terms",
  "/privacy",
  "/community",
  "/auth",
  "/explore",
  "/clubs",
]

export default function ShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r))
  const hideShell = SHELL_HIDDEN_ROUTES.some((r) => pathname.startsWith(r))

  const [authed, setAuthed] = useState<boolean | null>(isPublic ? true : null)

  useEffect(() => {
    if (isPublic) {
      setAuthed(true)
      return
    }

    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        // Invalid / expired refresh token — clear stale session and redirect
        supabase.auth.signOut().finally(() => router.replace("/login"))
      } else {
        setAuthed(true)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login")
      } else {
        setAuthed(true)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [pathname, isPublic, router])

  if (authed === null) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      {!hideShell && <NavBar />}
      {children}
    </>
  )
}
