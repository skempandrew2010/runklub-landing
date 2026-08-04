import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { localDateStr } from "@/utils/dates"

export function useNavIdentity() {
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [role, setRole] = useState<string>("member")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)

  // Clear unread badge when user visits the director tab (managers) or Home (members — it's the Hub when signed in, where chats now live)
  useEffect(() => {
    if (pathname.startsWith("/director") || pathname === "/" || pathname.startsWith("/today")) {
      localStorage.setItem("director_last_seen", new Date().toISOString())
      setHasUnread(false)
    }
  }, [pathname])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) {
        const [profileRes] = await Promise.all([
          supabase.from("profiles").select("role, avatar_url").eq("id", user.id).single(),
        ])
        if (profileRes.data?.role) setRole(profileRes.data.role)
        setAvatarUrl(profileRes.data?.avatar_url ?? null)

        // Check for unread messages across the user's runs
        const lastSeen = localStorage.getItem("director_last_seen") ?? "1970-01-01T00:00:00.000Z"
        const [ownedRes, subsRes] = await Promise.all([
          supabase.from("clubs").select("id").eq("user_id", user.id),
          supabase.from("subscriptions").select("club_id").eq("user_id", user.id),
        ])
        const clubIds = [
          ...((ownedRes.data || []).map((c: any) => c.id)),
          ...((subsRes.data || []).map((s: any) => s.club_id)),
        ]
        if (clubIds.length > 0) {
          const cutoff = new Date()
          cutoff.setDate(cutoff.getDate() - 7)
          const { data: runs } = await supabase
            .from("runs")
            .select("id")
            .in("club_id", clubIds)
            .gte("date", localDateStr(cutoff))
          const runIds = (runs || []).map((r: any) => r.id)
          if (runIds.length > 0) {
            const { count } = await supabase
              .from("run_chats")
              .select("id", { count: "exact", head: true })
              .in("run_id", runIds)
              .gt("created_at", lastSeen)
              .neq("user_id", user.id)
            setHasUnread((count ?? 0) > 0)
          }
        }
      }
      setLoaded(true)
    }
    load()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) { setRole("member"); setHasUnread(false); setAvatarUrl(null) }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  return { user, role, avatarUrl, loaded, hasUnread }
}
