"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Compass, Trophy, UserCircle, Home, Stamp, BarChart3, PlusCircle } from "lucide-react"
import { useNavIdentity } from "@/hooks/useNavIdentity"
import { useViewMode } from "@/hooks/useViewMode"
import NavClubSwitcher from "@/components/NavClubSwitcher"

export default function BottomBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { role, hasUnread, hasClub, isCoach, clubCount, primaryClubName, coachClubs } = useNavIdentity()
  const isManager = role === "manager"
  const { viewMode } = useViewMode(isManager || isCoach)
  const showDirectorTabs = (isManager || isCoach) && viewMode === "director"
  // Only prompt "Create a Klub" when there's truly nowhere else to go -
  // someone who already coaches elsewhere gets Analytics/Coaches instead,
  // even if they also hold the manager role with no klub of their own yet.
  const needsClub = showDirectorTabs && isManager && !hasClub && !isCoach
  // With just one klub relationship, "Director"/"Coaches" alone is
  // unambiguous. With more than one of the *same* kind (e.g. two coached
  // klubs), name the one tapping in actually lands on. Being both a
  // director and a coach shows the /director?as= picker instead of landing
  // anywhere specific, so naming one there would be a straight-up lie.
  const willShowPicker = isManager && isCoach
  // Coaching more than one klub with no director klub of your own: tapping
  // the tab opens a switcher instead of navigating straight in.
  const coachOnlyMultiClub = isCoach && !isManager && coachClubs.length > 1
  const activeClubId = searchParams.get("club_id")
  const directorSublabel = coachOnlyMultiClub
    ? coachClubs.find((c) => c.id === activeClubId)?.name ?? primaryClubName ?? undefined
    : !willShowPicker && clubCount > 1 ? primaryClubName ?? undefined : undefined

  const tabs = [
    { key: "home",      href: "/",           label: "Home",     Icon: Home,    badge: !showDirectorTabs && hasUnread },
    { key: "discover",  href: "/explore",    label: "Discover", Icon: Compass, badge: false },
    ...(showDirectorTabs
      ? [needsClub
          ? { key: "insights", href: "/submit-club", label: "Create a Klub", Icon: PlusCircle, badge: false }
          // Klub owners manage Passport payout enrollment here - a
          // separate, standalone page (own billing decision, not part of
          // club management). Coaches without a klub of their own keep
          // seeing Analytics instead, since they have no equivalent to
          // /director's Analytics tab in their own CoachDashboard.
          : isManager && hasClub
            ? { key: "insights", href: "/director/passport", label: "Passport", Icon: Stamp, badge: false }
            : { key: "insights", href: "/director/analytics", label: "Analytics", Icon: BarChart3, badge: false }]
      : []),
    ...(showDirectorTabs
      ? [needsClub
          ? { key: "director", href: "/submit-club", label: "Create a Klub", Icon: PlusCircle, badge: false }
          : { key: "director", href: "/director", label: hasClub ? "Director" : "Coaches", Icon: Trophy, badge: hasUnread, sublabel: directorSublabel }]
      : [{ key: "passport", href: "/passport", label: "Passport", Icon: Stamp, badge: false }]),
    { key: "profile",   href: "/profile",    label: "Profile",  Icon: UserCircle, badge: false },
  ]

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    // "/director" shares a prefix with its sibling standalone pages -
    // don't let the shorter Director tab light up while actually viewing
    // one of those.
    if (href === "/director") return pathname === "/director" || (pathname.startsWith("/director/") && !pathname.startsWith("/director/analytics") && !pathname.startsWith("/director/passport"))
    return pathname.startsWith(href)
  }

  const activeIndex = tabs.findIndex((t) => isActive(t.href))

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 px-3 mb-safe pointer-events-none">
      <div
        className="relative flex items-stretch h-[60px] mb-2 rounded-[28px] bg-[#1a2110]/55 backdrop-blur-2xl backdrop-saturate-150 border border-white/15 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_30px_rgba(0,0,0,0.4)] pointer-events-auto"
      >
        {activeIndex >= 0 && (
          // Outer element only handles the horizontal slide (full tab width,
          // flex-centered) so the visible pill's own size/position can be
          // tuned independently without fighting the slide math. Sized to
          // wrap the icon+label block together, not just the icon - that
          // block sits centered as a unit within the tab (justify-center),
          // so the pill is positioned to match its actual footprint rather
          // than the tab's raw height.
          <div
            className="absolute inset-y-0 flex items-start justify-center pointer-events-none transition-transform duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${100 / tabs.length}%`, transform: `translateX(${activeIndex * 100}%)` }}
          >
            <div className="w-[calc(100%-10px)] h-12 mt-[7px] rounded-[22px] bg-[#c5f135]/12 border border-[#c5f135]/25" />
          </div>
        )}
        {tabs.map((tab) => {
          const { key, href, label, Icon, badge } = tab
          const sublabel = "sublabel" in tab ? tab.sublabel : undefined
          const active = isActive(href)
          const triggerClassName = "relative flex-1 flex flex-col items-center justify-center gap-0.5 px-1 transition-colors"
          const content = (
            <>
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-colors ${active ? "text-[#c5f135]" : "text-white/40"}`}
                  strokeWidth={active ? 2.5 : 1.75}
                />
                {badge && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#c5f135] ring-2 ring-[#1a2110]" />
                )}
              </div>
              <span className={`text-[10px] font-semibold tracking-wide leading-tight transition-colors ${active ? "text-[#c5f135]" : "text-white/40"}`}>
                {label}
              </span>
              {sublabel && (
                <span className={`text-[8px] leading-tight truncate max-w-full transition-colors ${active ? "text-[#c5f135]/60" : "text-white/25"}`}>
                  {sublabel}
                </span>
              )}
            </>
          )

          if (key === "director" && coachOnlyMultiClub) {
            return (
              <NavClubSwitcher
                key={key}
                clubs={coachClubs}
                activeClubId={activeClubId}
                openUp
                triggerClassName={triggerClassName}
              >
                {content}
              </NavClubSwitcher>
            )
          }

          return (
            <Link key={key} href={href} className={triggerClassName}>
              {content}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
