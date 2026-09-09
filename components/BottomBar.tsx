"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Compass, Trophy, UserCircle, Home, Stamp, PlusCircle } from "lucide-react"
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
  // someone who already coaches elsewhere gets Passport/Coaches instead,
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
          // club management). Coaches without a klub of their own see a
          // read-only Passport-runs viewer instead (which of their runs are
          // Passport events, and who's redeemed for each), also its own
          // page rather than a CoachDashboard tab.
          : isManager && hasClub
            ? { key: "insights", href: "/director/passport", label: "Passport", Icon: Stamp, badge: false }
            : { key: "insights", href: "/director/coach-passport", label: "Passport", Icon: Stamp, badge: false }]
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
    if (href === "/director") {
      return pathname === "/director" || (
        pathname.startsWith("/director/") &&
        !pathname.startsWith("/director/analytics") &&
        !pathname.startsWith("/director/passport") &&
        !pathname.startsWith("/director/coach-passport")
      )
    }
    return pathname.startsWith(href)
  }

  const activeIndex = tabs.findIndex((t) => isActive(t.href))
  const activeKey = activeIndex >= 0 ? tabs[activeIndex].key : null

  // Tabs are equal-width by default, except the one carrying a club-name
  // sublabel (the Director/Coaches tab, when coaching/owning more than one
  // klub) - that one sizes to its actual text instead of clipping a long
  // klub name, with the rest sharing whatever width remains. The active
  // highlight can't rely on fixed percentage math once widths vary, so it's
  // measured from the real DOM instead (same mechanic as the desktop navBar).
  const containerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  useEffect(() => {
    const measure = () => {
      const el = activeKey ? tabRefs.current.get(activeKey) : null
      // A small inset (not a full match to the tab's own edges) so the pill
      // reads as a highlight rather than a hard-edged box. Kept tighter than
      // it looks like it needs to be, since cross-platform text metrics
      // (iOS vs. this measurement running in a desktop browser) aren't
      // pixel-identical - too generous a margin here previously meant the
      // pill fell short of covering a long klub name's sublabel on-device.
      setPill(el ? { left: el.offsetLeft + 2, width: el.offsetWidth - 4 } : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [activeKey, directorSublabel])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 px-3 mb-safe pointer-events-none">
      <div
        ref={containerRef}
        className="relative flex items-stretch h-[60px] mb-2 rounded-[28px] bg-[#1a2110]/55 backdrop-blur-2xl backdrop-saturate-150 border border-white/15 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_30px_rgba(0,0,0,0.4)] pointer-events-auto"
      >
        {pill && (
          <div
            className="absolute h-12 top-[7px] rounded-[22px] bg-[#c5f135]/12 border border-[#c5f135]/25 pointer-events-none transition-[left,width] duration-300 ease-out"
            style={{ left: pill.left, width: pill.width }}
          />
        )}
        {tabs.map((tab) => {
          const { key, href, label, Icon, badge } = tab
          const sublabel = "sublabel" in tab ? tab.sublabel : undefined
          const active = isActive(href)
          // The sublabel-carrying tab (flex-none = "0 0 auto") sizes to its
          // content and never shrinks below it, so a long klub name always
          // gets the room it needs - capped by the sublabel's own
          // max-w-[45vw] so a pathological name can't blow out the bar.
          // flex-initial (shrink allowed) looked right until the bar got
          // tight, at which point this tab shrank along with the others and
          // clipped the name the pill was supposed to fully cover. Every
          // other tab stays flex-1 (grow+shrink) and min-w-0 so they're the
          // ones that absorb the squeeze instead.
          const triggerClassName = `relative flex flex-col items-center justify-center gap-0.5 px-2 min-w-0 transition-colors ${sublabel ? "flex-none" : "flex-1"}`
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
              <span className={`text-[10px] font-semibold tracking-wide leading-tight whitespace-nowrap transition-colors ${active ? "text-[#c5f135]" : "text-white/40"}`}>
                {label}
              </span>
              {sublabel && (
                <span className={`text-[8px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis max-w-[45vw] transition-colors ${active ? "text-[#c5f135]/60" : "text-white/25"}`}>
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
    </nav>
  )
}
