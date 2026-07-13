"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { TEST_MANAGER_USER_ID, TEST_MEMBER_USER_ID } from "./testAccounts"
import { CLUB_ID } from "./constants"

type AccessScope = "manager" | "tester"

// "manager" -> admins + the test manager account (club-model manager dashboard)
// "tester"  -> admins + either test account (join simulator, email preview, member view)
//
// Pass skip: true when this page has its own separate, valid way in (e.g. an
// invite token) — the hook then does nothing at all: no auth check, no
// redirect, and always reports "not ready" so callers fall back to their own
// readiness signal instead of accidentally bouncing an anonymous invitee to /login.
export function useClubModelAccess(scope: AccessScope, skip = false) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (skip) return
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single()
      if (profile?.role === "admin") { setReady(true); return }

      const allowed = scope === "manager"
        ? user.id === TEST_MANAGER_USER_ID
        : user.id === TEST_MANAGER_USER_ID || user.id === TEST_MEMBER_USER_ID

      if (!allowed) { router.push("/"); return }

      // Gated by the club's billing tier: the club-management system is a
      // Starter/Pro/Premium feature (Starter and Pro are capped on regions,
      // enforced server-side in the mutate route). The test club acts as the
      // one club this prototype supports today, so its tier is the whole gate.
      const { data: club } = await supabase.from("clubs").select("tier").eq("id", CLUB_ID).single()
      if (club?.tier !== "starter" && club?.tier !== "pro" && club?.tier !== "premium") { router.push("/"); return }

      setReady(true)
    }
    check()
  }, [router, scope, skip])

  return skip ? false : ready
}
