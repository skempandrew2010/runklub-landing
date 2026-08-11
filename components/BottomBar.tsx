"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, Trophy, UserCircle, Home, Stamp, Flame } from "lucide-react"
import { useNavIdentity } from "@/hooks/useNavIdentity"
import { useViewMode } from "@/hooks/useViewMode"

export default function BottomBar() {
  const pathname = usePathname()
  const { role, hasUnread } = useNavIdentity()
  const isManager = role === "manager"
  const { viewMode } = useViewMode(isManager)
  const showCoachTab = isManager && viewMode === "coach"

  const tabs = [
    { href: "/",           label: "Home",     Icon: Home,    badge: !showCoachTab && hasUnread },
    { href: "/explore",    label: "Discover", Icon: Compass, badge: false },
    { href: "/challenges", label: "Missions", Icon: Flame,   badge: false },
    ...(showCoachTab
      ? [{ href: "/director", label: "Director", Icon: Trophy,     badge: hasUnread }]
      : [{ href: "/passport", label: "Passport", Icon: Stamp,      badge: false }]),
    { href: "/profile",    label: "Profile",  Icon: UserCircle, badge: false },
  ]

  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a2110] border-t border-[#2e3d1a] pb-safe">
      <div className="flex items-stretch h-16">
        {tabs.map(({ href, label, Icon, badge }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
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
