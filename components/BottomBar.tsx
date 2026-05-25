"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, Users, CalendarCheck, Trophy, UserCircle, MessageSquare } from "lucide-react"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function BottomBar() {
  const pathname = usePathname()
  const [role, setRole] = useState<string>("member")

  useEffect(() => {
    const loadRole = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
      if (data?.role) setRole(data.role)
    }
    loadRole()
  }, [])

  const isManager = role === "manager"

  const tabs = [
    { href: "/",          label: "Discover",                          Icon: Compass },
    { href: "/dashboard", label: "My Klubs",                          Icon: Users },
    { href: "/today",     label: "Today",                             Icon: CalendarCheck },
    { href: "/director",  label: isManager ? "Director" : "Messages", Icon: isManager ? Trophy : MessageSquare },
    { href: "/profile",   label: "Profile",                           Icon: UserCircle },
  ]

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a2110] border-t border-[#2e3d1a] pb-safe">
      <div className="flex items-stretch h-16">
        {tabs.map(({ href, label, Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
            >
              <Icon
                className={`w-5 h-5 transition-colors ${active ? "text-[#c5f135]" : "text-white/35"}`}
                strokeWidth={active ? 2.5 : 1.75}
              />
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
