"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useEffect, useState } from "react"
import { Compass, CalendarCheck, Trophy, UserCircle, MessageSquare } from "lucide-react"
import { localDateStr } from "@/utils/dates"

export default function Navbar() {
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [role, setRole] = useState<string>("member")
  const [loaded, setLoaded] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)

  // Clear unread badge when user visits the director tab
  useEffect(() => {
    if (pathname.startsWith("/director")) {
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
          supabase.from("profiles").select("role").eq("id", user.id).single(),
        ])
        if (profileRes.data?.role) setRole(profileRes.data.role)

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
      if (!session?.user) { setRole("member"); setHasUnread(false) }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const isManager = role === "manager"

  const tabs = [
    { href: "/",         label: "Discover",                               Icon: Compass,        badge: false },
    { href: "/today",    label: "Hub",                                    Icon: CalendarCheck,  badge: false },
    { href: "/director", label: isManager ? "Director" : "Messages",     Icon: isManager ? Trophy : MessageSquare, badge: hasUnread },
  ]

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)

  const profileActive = pathname.startsWith("/profile")
  const initials = user?.email ? user.email[0].toUpperCase() : null

  return (
    <nav className="sticky top-0 z-50 bg-[#1a2110] border-b border-[#2e3d1a]">
      <div className="max-w-6xl mx-auto flex items-center px-6 h-[68px]">

        {/* Logo — left */}
        <div className="flex-1">
          <Link href="/" className="text-2xl font-black tracking-tight">
            <span className="text-white">Run</span><span className="text-[#c5f135]">Klub</span>
          </Link>
        </div>

        {/* Main nav tabs — centered */}
        <div className="flex items-center gap-1.5">
          {tabs.map(({ href, label, Icon, badge }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-xl transition ${active ? "bg-[#c5f135]/10" : "hover:bg-[#2e3d1a]"}`}
              >
                <div className="relative">
                  <Icon
                    className={`w-5 h-5 transition-colors ${active ? "text-[#c5f135]" : "text-white/35"}`}
                    strokeWidth={active ? 2.5 : 1.75}
                  />
                  {badge && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#c5f135] ring-2 ring-[#1a2110]" />
                  )}
                </div>
                <span className={`text-[10px] font-semibold tracking-wide transition-colors ${active ? "text-[#c5f135]" : "text-white/30"}`}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>

        {/* Profile / Log In — right corner */}
        <div className="flex-1 flex justify-end">
          {loaded && !user ? (
            <Link
              href="/login"
              className="px-4 py-2 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
            >
              Log In
            </Link>
          ) : (
            <Link
              href="/profile"
              className={`flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-xl transition ${profileActive ? "bg-[#c5f135]/10" : "hover:bg-[#2e3d1a]"}`}
            >
              {initials ? (
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${profileActive ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#2e3d1a] border border-[#3d5220] text-[#c5f135]"}`}>
                  {initials}
                </div>
              ) : (
                <UserCircle
                  className={`w-5 h-5 transition-colors ${profileActive ? "text-[#c5f135]" : "text-white/35"}`}
                  strokeWidth={profileActive ? 2.5 : 1.75}
                />
              )}
              <span className={`text-[10px] font-semibold tracking-wide transition-colors ${profileActive ? "text-[#c5f135]" : "text-white/30"}`}>
                Profile
              </span>
            </Link>
          )}
        </div>

      </div>
    </nav>
  )
}
