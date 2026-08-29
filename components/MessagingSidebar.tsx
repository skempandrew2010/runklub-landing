"use client"

import { MessageSquare, Users } from "lucide-react"
import type { MessagingContact } from "@/hooks/useKlubMessaging"

// Compact "who can I message" panel shown on both the club page and the run
// page - group chat, my director, my coach, each opening straight into
// RunChatPanel (group or a private DM). The parent controls placement via
// className (a sticky side column on wide screens, an inline card on
// mobile where there's no room for a real side-by-side sidebar).
export default function MessagingSidebar({
  loggedIn,
  currentUserId,
  director,
  coach,
  groupChatLabel,
  groupChatSubtitle,
  onOpenGroupChat,
  onOpenDirector,
  onOpenCoach,
  onRequireLogin,
  className = "",
}: {
  loggedIn: boolean
  currentUserId?: string | null
  director: MessagingContact | null
  coach: MessagingContact | null
  groupChatLabel: string
  groupChatSubtitle?: string
  onOpenGroupChat: () => void
  onOpenDirector: () => void
  onOpenCoach: () => void
  onRequireLogin: () => void
  className?: string
}) {
  const showDirector = !!director && director.userId !== currentUserId
  const showCoach = !!coach && coach.userId !== currentUserId

  return (
    <div className={`bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl overflow-hidden ${className}`}>
      <p className="text-[10px] font-black text-white/30 uppercase tracking-widest px-4 pt-3.5 pb-1.5">Messages</p>
      <div className="px-1.5 pb-1.5">
        {!loggedIn ? (
          <Row icon={<MessageSquare className="w-4 h-4" />} title="Sign in to message" onClick={onRequireLogin} />
        ) : (
          <>
            <Row
              icon={<Users className="w-4 h-4" />}
              title={groupChatLabel}
              subtitle={groupChatSubtitle ?? "Group chat"}
              onClick={onOpenGroupChat}
            />
            {showDirector && (
              <Row icon={<MessageSquare className="w-4 h-4" />} title={director!.name} subtitle="Director" onClick={onOpenDirector} avatarUrl={director!.avatarUrl} />
            )}
            {showCoach && (
              <Row icon={<MessageSquare className="w-4 h-4" />} title={coach!.name} subtitle="My coach" onClick={onOpenCoach} avatarUrl={coach!.avatarUrl} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Row({
  icon,
  title,
  subtitle,
  onClick,
  avatarUrl,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  onClick: () => void
  avatarUrl?: string | null
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-[#2e3d1a]/60 transition text-left"
    >
      <div className="w-9 h-9 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0 text-[#c5f135] overflow-hidden">
        {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-white truncate">{title}</p>
        {subtitle && <p className="text-xs text-white/40 truncate">{subtitle}</p>}
      </div>
    </button>
  )
}
