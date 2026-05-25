"use client"

import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"

const NavBar = dynamic(() => import("./navBar"), {
  ssr: false,
  loading: () => <nav className="sticky top-0 z-50 bg-[#1a2110] border-b border-[#2e3d1a] h-[68px]" />,
})

const SHELL_HIDDEN_ROUTES = ["/login", "/onboarding"]

export default function ShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hideShell = pathname === "/" || SHELL_HIDDEN_ROUTES.some((r) => pathname.startsWith(r))

  return (
    <>
      {!hideShell && <NavBar />}
      {children}
    </>
  )
}
