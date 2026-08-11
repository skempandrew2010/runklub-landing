"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, Trophy, UserCircle, Home, Stamp, Flame } from "lucide-react"
import { useNavIdentity } from "@/hooks/useNavIdentity"
import { useViewMode } from "@/hooks/useViewMode"

export default function Navbar() {
  const pathname = usePathname()
  const { user, role, avatarUrl, loaded, hasUnread } = useNavIdentity()
  const isManager = role === "manager"
  const { viewMode } = useViewMode(isManager)
  const showCoachTab = isManager && viewMode === "coach"

  const tabs = [
    { href: "/",           label: "Home",       Icon: Home,    badge: !showCoachTab && hasUnread },
    { href: "/explore",    label: "Discover",   Icon: Compass, badge: false },
    { href: "/challenges", label: "Missions",   Icon: Flame,   badge: false },
    ...(showCoachTab
      ? [{ href: "/director", label: "Director", Icon: Trophy, badge: hasUnread }]
      : [{ href: "/passport", label: "Passport", Icon: Stamp, badge: false }]),
  ]

  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href)

  const profileActive = pathname.startsWith("/profile")
  const initials = user?.email ? user.email[0].toUpperCase() : null

  return (
    <nav className="sticky top-0 z-50 bg-[#1a2110] border-b border-[#2e3d1a]" style={{ paddingTop: 'calc(var(--safe-top) + var(--nav-extra))' }}>
      <div className="max-w-6xl mx-auto flex items-center justify-between sm:justify-start px-5 sm:px-6 h-[68px]">

        {/* Logo — left */}
        <div className="sm:flex-1">
          <Link href="/explore" className="text-2xl font-black tracking-tight">
            <span className="text-white">Run</span><span className="text-[#c5f135]">Klub</span>
          </Link>
        </div>

        {/* Main nav tabs — centered */}
        <div className="flex items-center gap-5 sm:gap-6">
          {tabs.map(({ href, label, Icon, badge }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-1 px-2 sm:px-4 py-2 rounded-xl transition ${active ? "bg-[#c5f135]/10" : "hover:bg-[#2e3d1a]"}`}
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
                <span className={`hidden sm:block text-[10px] font-semibold tracking-wide transition-colors ${active ? "text-[#c5f135]" : "text-white/30"}`}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>

        {/* Profile / Log In — right corner */}
        <div className="flex justify-end sm:flex-1">
          {loaded && !user ? (
            <Link
              href="/login"
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-[#c5f135] text-[#1a2110] text-xs sm:text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
            >
              Log In
            </Link>
          ) : (
            <Link
              href="/profile"
              className={`flex flex-col items-center justify-center gap-1 px-2 sm:px-4 py-2 rounded-xl transition ${profileActive ? "bg-[#c5f135]/10" : "hover:bg-[#2e3d1a]"}`}
            >
              {avatarUrl ? (
                <div className={`w-6 h-6 rounded-full overflow-hidden ${profileActive ? "ring-2 ring-[#c5f135]" : ""}`}>
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                </div>
              ) : initials ? (
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${profileActive ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#2e3d1a] border border-[#3d5220] text-[#c5f135]"}`}>
                  {initials}
                </div>
              ) : (
                <UserCircle
                  className={`w-5 h-5 transition-colors ${profileActive ? "text-[#c5f135]" : "text-white/35"}`}
                  strokeWidth={profileActive ? 2.5 : 1.75}
                />
              )}
              <span className={`hidden sm:block text-[10px] font-semibold tracking-wide transition-colors ${profileActive ? "text-[#c5f135]" : "text-white/30"}`}>
                Profile
              </span>
            </Link>
          )}
        </div>

      </div>
    </nav>
  )
}
