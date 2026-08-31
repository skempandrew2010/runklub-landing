"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Compass, Trophy, UserCircle, Home, Stamp, Flame, BarChart3, PlusCircle } from "lucide-react"
import { useNavIdentity } from "@/hooks/useNavIdentity"
import { useViewMode } from "@/hooks/useViewMode"
import NavClubSwitcher from "@/components/NavClubSwitcher"
import NotificationBell from "@/components/NotificationBell"

export default function Navbar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, role, avatarUrl, loaded, hasUnread, hasClub, isCoach, clubCount, primaryClubName, coachClubs } = useNavIdentity()
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
  // Coaching more than one klub with no director klub of your own: clicking
  // the tab opens a switcher instead of navigating straight in, since there's
  // no single obvious klub to land on.
  const coachOnlyMultiClub = isCoach && !isManager && coachClubs.length > 1
  const activeClubId = searchParams.get("club_id")
  const directorSublabel = coachOnlyMultiClub
    ? coachClubs.find((c) => c.id === activeClubId)?.name ?? primaryClubName ?? undefined
    : !willShowPicker && clubCount > 1 ? primaryClubName ?? undefined : undefined

  const tabs = [
    { key: "home",     href: "/",           label: "Home",       Icon: Home,    badge: !showDirectorTabs && hasUnread },
    { key: "discover", href: "/explore",    label: "Discover",   Icon: Compass, badge: false },
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
      : [{ key: "missions", href: "/challenges", label: "Missions", Icon: Flame, badge: false }]),
    ...(showDirectorTabs
      ? [needsClub
          ? { key: "director", href: "/submit-club", label: "Create a Klub", Icon: PlusCircle, badge: false }
          : { key: "director", href: "/director", label: hasClub ? "Director" : "Coaches", Icon: Trophy, badge: hasUnread, sublabel: directorSublabel }]
      : [{ key: "passport", href: "/passport", label: "Passport", Icon: Stamp, badge: false }]),
  ]

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    // "/director" shares a prefix with its sibling standalone pages -
    // don't let the shorter Director tab light up while actually viewing
    // one of those.
    if (href === "/director") return pathname === "/director" || (pathname.startsWith("/director/") && !pathname.startsWith("/director/analytics") && !pathname.startsWith("/director/passport"))
    return pathname.startsWith(href)
  }

  const profileActive = pathname.startsWith("/profile")
  const initials = user?.email ? user.email[0].toUpperCase() : null

  // Sliding highlight behind the active tab - same mechanic as the director
  // dashboard's side tab nav (a pill that glides via CSS transform instead
  // of the background just popping in/out on each tab independently).
  // Measured via refs rather than fixed math since these tabs vary in width
  // (icon + label, sometimes a sublabel) and the label hides below `sm`.
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [highlight, setHighlight] = useState<{ left: number; width: number } | null>(null)
  const activeKey = tabs.find((t) => isActive(t.href))?.key ?? null

  useEffect(() => {
    const measure = () => {
      const el = activeKey ? tabRefs.current.get(activeKey) : null
      setHighlight(el ? { left: el.offsetLeft, width: el.offsetWidth } : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (tabsContainerRef.current) ro.observe(tabsContainerRef.current)
    return () => ro.disconnect()
  }, [activeKey])

  return (
    <nav className="sticky top-0 z-50 bg-[#1a2110] border-b border-[#2e3d1a]" style={{ paddingTop: 'calc(var(--safe-top) + var(--nav-extra))' }}>
      <div className="max-w-6xl mx-auto flex items-center justify-between sm:justify-start px-5 sm:px-6 h-[68px]">

        {/* Logo - left */}
        <div className="sm:flex-1">
          <Link href="/explore" className="text-2xl font-black tracking-tight">
            <span className="text-white">Run</span><span className="text-[#c5f135]">Klub</span>
          </Link>
        </div>

        {/* Main nav tabs - centered */}
        <div ref={tabsContainerRef} className="relative flex items-center gap-5 sm:gap-6">
          {highlight && (
            <div
              className="absolute top-0 bottom-0 rounded-xl bg-[#c5f135]/10 transition-[left,width] duration-300 ease-out pointer-events-none"
              style={{ left: highlight.left, width: highlight.width }}
            />
          )}
          {tabs.map((tab) => {
            const { key, href, label, Icon, badge } = tab
            const sublabel = "sublabel" in tab ? tab.sublabel : undefined
            const active = isActive(href)
            const triggerClassName = `relative z-10 flex flex-col items-center justify-center gap-1 px-2 sm:px-4 py-2 rounded-xl transition ${active ? "" : "hover:bg-[#2e3d1a]"}`
            const content = (
              <>
                <div className="relative">
                  <Icon
                    className={`w-5 h-5 transition-colors ${active ? "text-[#c5f135]" : "text-white/35"}`}
                    strokeWidth={active ? 2.5 : 1.75}
                  />
                  {badge && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#c5f135] ring-2 ring-[#1a2110]" />
                  )}
                </div>
                <span className={`hidden sm:block text-[10px] font-semibold tracking-wide leading-tight transition-colors ${active ? "text-[#c5f135]" : "text-white/30"}`}>
                  {label}
                </span>
                {sublabel && (
                  <span className={`hidden sm:block text-[8px] leading-tight max-w-[80px] truncate transition-colors ${active ? "text-[#c5f135]/60" : "text-white/20"}`}>
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
                  triggerClassName={triggerClassName}
                  registerRef={(el) => { if (el) tabRefs.current.set(key, el); else tabRefs.current.delete(key) }}
                >
                  {content}
                </NavClubSwitcher>
              )
            }

            return (
              <Link
                key={key}
                href={href}
                ref={(el) => { if (el) tabRefs.current.set(key, el); else tabRefs.current.delete(key) }}
                className={triggerClassName}
              >
                {content}
              </Link>
            )
          })}
        </div>

        {/* Notifications + Profile / Log In - right corner */}
        <div className="flex items-center justify-end gap-1 sm:flex-1">
          {loaded && !user ? (
            <Link
              href="/login"
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-[#c5f135] text-[#1a2110] text-xs sm:text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
            >
              Log In
            </Link>
          ) : user ? (
            <>
              <NotificationBell userId={user.id} className="w-9 h-9 rounded-xl hover:bg-[#2e3d1a]" />
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
            </>
          ) : null}
        </div>

      </div>
    </nav>
  )
}
