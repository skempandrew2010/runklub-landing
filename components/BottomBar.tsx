"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, Trophy, UserCircle, Home, Stamp, Flame, BarChart3, PlusCircle } from "lucide-react"
import { useNavIdentity } from "@/hooks/useNavIdentity"
import { useViewMode } from "@/hooks/useViewMode"

export default function BottomBar() {
  const pathname = usePathname()
  const { role, hasUnread, hasClub, isCoach } = useNavIdentity()
  const isManager = role === "manager"
  const { viewMode } = useViewMode(isManager || isCoach)
  const showDirectorTabs = (isManager || isCoach) && viewMode === "director"
  // Only prompt "Create a Klub" when there's truly nowhere else to go —
  // someone who already coaches elsewhere gets Analytics/Coaches instead,
  // even if they also hold the manager role with no klub of their own yet.
  const needsClub = showDirectorTabs && isManager && !hasClub && !isCoach

  const tabs = [
    { key: "home",      href: "/",           label: "Home",     Icon: Home,    badge: !showDirectorTabs && hasUnread },
    { key: "discover",  href: "/explore",    label: "Discover", Icon: Compass, badge: false },
    ...(showDirectorTabs
      ? [needsClub
          ? { key: "analytics", href: "/submit-club", label: "Create a Klub", Icon: PlusCircle, badge: false }
          : { key: "analytics", href: "/director/analytics", label: "Analytics", Icon: BarChart3, badge: false }]
      : [{ key: "missions", href: "/challenges", label: "Missions", Icon: Flame, badge: false }]),
    ...(showDirectorTabs
      ? [needsClub
          ? { key: "director", href: "/submit-club", label: "Create a Klub", Icon: PlusCircle, badge: false }
          : { key: "director", href: "/director", label: hasClub ? "Director" : "Coaches", Icon: Trophy, badge: hasUnread }]
      : [{ key: "passport", href: "/passport", label: "Passport", Icon: Stamp, badge: false }]),
    { key: "profile",   href: "/profile",    label: "Profile",  Icon: UserCircle, badge: false },
  ]

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    // "/director" and "/director/analytics" share a prefix — don't let the
    // shorter Director tab light up while actually viewing Analytics.
    if (href === "/director") return pathname === "/director" || (pathname.startsWith("/director/") && !pathname.startsWith("/director/analytics"))
    return pathname.startsWith(href)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a2110] border-t border-[#2e3d1a] pb-safe">
      <div className="flex items-stretch h-16">
        {tabs.map(({ key, href, label, Icon, badge }) => {
          const active = isActive(href)
          return (
            <Link
              key={key}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
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
              <span className={`text-[10px] font-semibold tracking-wide transition-colors ${active ? "text-[#c5f135]" : "text-white/35"}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
