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
  const [hasClub, setHasClub] = useState(false)
  const [isCoach, setIsCoach] = useState(false)
  const [clubCount, setClubCount] = useState(0)
  const [primaryClubName, setPrimaryClubName] = useState<string | null>(null)
  const [directorAlertCount, setDirectorAlertCount] = useState(0)

  // Clear unread badge when user visits the director tab (managers) or Home (members — it's the Hub when signed in, where chats now live)
  useEffect(() => {
    if (pathname.startsWith("/director") || pathname === "/" || pathname.startsWith("/today")) {
      localStorage.setItem("director_last_seen", new Date().toISOString())
      setHasUnread(false)
      setDirectorAlertCount(0)
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
        const [ownedRes, subsRes, coachRes] = await Promise.all([
          supabase.from("clubs").select("id, name").eq("user_id", user.id).order("created_at"),
          supabase.from("subscriptions").select("club_id").eq("user_id", user.id),
          supabase.from("coaches").select("club_id, accepted_at, clubs(name)").eq("user_id", user.id).eq("status", "active").order("accepted_at", { ascending: false }),
        ])
        const ownedClubs = (ownedRes.data ?? []) as { id: string; name: string }[]
        const coachClubs = ((coachRes.data ?? []) as any[]).filter((r) => r.clubs)
        setHasClub(ownedClubs.length > 0)
        setIsCoach(coachClubs.length > 0)
        setClubCount(ownedClubs.length + coachClubs.length)
        // Matches whichever klub DirectorHomeContent (first owned, oldest
        // first) or CoachDashboard (most recently accepted coach klub) would
        // land on by default, so the nav label never claims a different one.
        setPrimaryClubName(ownedClubs[0]?.name ?? coachClubs[0]?.clubs?.name ?? null)
        const clubIds = [
          ...(ownedClubs.map((c) => c.id)),
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

        // Director-tab badge: new followers/members plus new run chat
        // messages on klubs this user owns, since they last opened Director
        // or Home. Scoped to owned klubs only (unlike hasUnread above, which
        // also covers klubs they've merely subscribed to as a runner).
        if (ownedClubs.length > 0) {
          const ownedClubIds = ownedClubs.map((c) => c.id)
          const [newSubsRes, ownedRunsRes] = await Promise.all([
            supabase.from("subscriptions").select("id", { count: "exact", head: true }).in("club_id", ownedClubIds).gt("created_at", lastSeen),
            supabase.from("runs").select("id").in("club_id", ownedClubIds),
          ])
          const ownedRunIds = (ownedRunsRes.data ?? []).map((r: any) => r.id)
          let newChatCount = 0
          if (ownedRunIds.length > 0) {
            const { count } = await supabase
              .from("run_chats")
              .select("id", { count: "exact", head: true })
              .in("run_id", ownedRunIds)
              .gt("created_at", lastSeen)
              .neq("user_id", user.id)
            newChatCount = count ?? 0
          }
          setDirectorAlertCount((newSubsRes.count ?? 0) + newChatCount)
        }
      }
      setLoaded(true)
    }
    load()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) { setRole("member"); setHasUnread(false); setHasClub(false); setIsCoach(false); setClubCount(0); setPrimaryClubName(null); setAvatarUrl(null); setDirectorAlertCount(0) }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  return { user, role, avatarUrl, loaded, hasUnread, hasClub, isCoach, clubCount, primaryClubName, directorAlertCount }
}
