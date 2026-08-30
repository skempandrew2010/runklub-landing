"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Bell, MessageSquare, UserPlus, ShieldCheck, Users, Clock, Mail } from "lucide-react"
import { useNotifications } from "@/hooks/useNotifications"
import type { NotificationRow, NotificationType } from "@/lib/notifications"

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  dm: MessageSquare,
  join_request: UserPlus,
  member_subscribed: ShieldCheck,
  coach_invite_accepted: Users,
  run_reminder: Clock,
  newsletter: Mail,
}

function formatRelativeTime(iso: string) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return "now"
  if (diffMin < 60) return `${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function NotificationBell({ userId, className = "" }: { userId: string; className?: string }) {
  const router = useRouter()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(userId)
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!open || !btnRef.current) { setRect(null); return }
    const update = () => setRect(btnRef.current?.getBoundingClientRect() ?? null)
    update()
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const openNotification = (n: NotificationRow) => {
    if (!n.read_at) markRead(n.id)
    setOpen(false)
    if (n.link) router.push(n.link)
  }

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className={`relative flex items-center justify-center transition ${className}`}
      >
        <Bell className={`w-5 h-5 transition-colors ${open ? "text-[#c5f135]" : "text-white/35 hover:text-white/60"}`} strokeWidth={open ? 2.5 : 1.75} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-[#c5f135] text-[#1a2110] text-[9px] font-black flex items-center justify-center ring-2 ring-[#1a2110]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && rect && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", right: Math.max(12, window.innerWidth - rect.right), top: rect.bottom + 8 }}
          className="z-50 w-[320px] max-w-[calc(100vw-24px)] max-h-[70vh] overflow-y-auto bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl shadow-2xl animate-[fadeUp_0.15s_ease-out_forwards]"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2e3d1a] sticky top-0 bg-[#1e2d12]">
            <p className="text-sm font-black text-white">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[11px] font-bold text-[#c5f135]/70 hover:text-[#c5f135] transition">
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell className="w-8 h-8 text-white/15 mx-auto mb-2" />
              <p className="text-white/40 text-sm">Nothing yet</p>
            </div>
          ) : (
            <div className="divide-y divide-[#2e3d1a]">
              {notifications.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Bell
                const unread = !n.read_at
                return (
                  <button
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left transition hover:bg-[#2e3d1a]/50 ${unread ? "bg-[#c5f135]/[0.04]" : ""}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0 overflow-hidden mt-0.5">
                      {n.avatar_url ? (
                        <img src={n.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Icon className="w-3.5 h-3.5 text-[#c5f135]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug ${unread ? "font-bold text-white" : "font-semibold text-white/70"}`}>{n.title}</p>
                      {n.body && <p className="text-[11px] text-white/40 mt-0.5 leading-snug break-words">{n.body}</p>}
                      <p className="text-[10px] text-white/25 mt-1">{formatRelativeTime(n.created_at)}</p>
                    </div>
                    {unread && <span className="w-2 h-2 rounded-full bg-[#c5f135] shrink-0 mt-1.5" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
