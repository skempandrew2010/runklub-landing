"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, MapPin, MessageSquare, Send } from "lucide-react"
import { formatRunTime } from "@/lib/timezone"
import ModalPortal from "@/components/ModalPortal"

export type RunChatTarget = {
  type: "run"
  id: string
  title: string
  date: string
  time: string
  timezone?: string | null
  distance?: string | null
  meeting_point?: string | null
  clubName: string
  clubImageUrl?: string | null
}

export type ClubChatTarget = {
  type: "club"
  id: string
  clubName: string
  clubImageUrl?: string | null
}

export type ChatTarget = RunChatTarget | ClubChatTarget

type ChatMessage = {
  id: string
  run_id: string | null
  club_id: string | null
  user_id: string
  recipient_id: string | null
  message: string
  created_at: string
  profiles: { display_name: string | null; avatar_url: string | null } | null
}

export type DmTarget = { userId: string; name: string; avatarUrl: string | null }

function formatTime(target: { date: string; time: string; timezone?: string | null }) {
  return formatRunTime(target)
}

function formatChatTime(iso: string) {
  const d = new Date(iso)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return "now"
  if (diffMin < 60) return `${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

export default function RunChatPanel({
  target,
  userId,
  onClose,
  initialDm,
}: {
  target: ChatTarget
  userId: string
  onClose: () => void
  initialDm?: DmTarget
}) {
  const [dm, setDm] = useState<DmTarget | null>(initialDm ?? null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const targetColumn = target.type === "run" ? "run_id" : "club_id"

  const loadMessages = useCallback(async () => {
    setLoading(true)
    let query = supabase.from("run_chats").select("*, profiles(display_name, avatar_url)").eq(targetColumn, target.id)
    query = dm
      ? query.or(`and(user_id.eq.${userId},recipient_id.eq.${dm.userId}),and(user_id.eq.${dm.userId},recipient_id.eq.${userId})`)
      : query.is("recipient_id", null)
    const { data } = await query.order("created_at", { ascending: true })
    setMessages((data || []) as ChatMessage[])
    setLoading(false)
  }, [targetColumn, target.id, dm, userId])

  useEffect(() => {
    loadMessages()
    const channel = supabase
      .channel(`${target.type}-chat-${target.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "run_chats", filter: `${targetColumn}=eq.${target.id}` }, () => loadMessages())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [target.type, target.id, targetColumn, loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || sending || text.length > 500) return
    setSending(true)
    setInput("")
    await supabase.from("run_chats").insert({
      run_id: target.type === "run" ? target.id : null,
      club_id: target.type === "club" ? target.id : null,
      user_id: userId,
      recipient_id: dm?.userId ?? null,
      message: text,
    })
    setSending(false)
    inputRef.current?.focus()
  }

  const startDm = (msg: ChatMessage) => {
    if (dm || msg.user_id === userId) return
    setDm({ userId: msg.user_id, name: msg.profiles?.display_name || "Runner", avatarUrl: msg.profiles?.avatar_url ?? null })
  }

  const clubInitials = initialsOf(target.clubName)

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm sm:max-h-[70vh] bg-[#111a0a] border border-[#2e3d1a] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden animate-[fadeUp_0.25s_ease-out_forwards]"
        onClick={(e) => e.stopPropagation()}
      >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2e3d1a] bg-[#1a2110] shrink-0">
        <button onClick={dm ? () => setDm(null) : onClose} className="text-white/50 hover:text-white transition p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        {dm ? (
          <>
            <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-[#2e3d1a]">
              {dm.avatarUrl
                ? <img src={dm.avatarUrl} alt="" className="w-full h-full object-cover" />
                : <span className="text-xs font-bold text-[#c5f135]">{initialsOf(dm.name)}</span>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{dm.name}</p>
              <p className="text-[10px] text-[#c5f135] font-bold uppercase tracking-wide">Private message</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-[#2e3d1a]">
              {target.clubImageUrl
                ? <img src={target.clubImageUrl} alt="" className="w-full h-full object-cover" />
                : <span className="text-xs font-black text-[#c5f135]">{clubInitials}</span>
              }
            </div>
            <div className="flex-1 min-w-0">
              {target.type === "run" ? (
                <>
                  <p className="text-sm font-bold text-white truncate">{target.title}</p>
                  <p className="text-xs text-white/40 truncate">
                    {target.clubName} · {new Date(target.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at {formatTime(target)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-white truncate">{target.clubName}</p>
                  <p className="text-xs text-white/40 truncate">Klub Chat</p>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Run details strip - group view only */}
      {!dm && target.type === "run" && (target.distance || target.meeting_point) && (
        <div className="shrink-0 px-4 py-2.5 border-b border-[#2e3d1a] bg-[#141f0d] flex flex-wrap gap-2">
          {target.distance && (
            <span className="flex items-center gap-1.5 bg-[#1e2d12] rounded-full px-3 py-1.5 text-xs font-medium text-white/70">
              {target.distance}
            </span>
          )}
          {target.meeting_point && (
            <span className="flex items-center gap-1.5 bg-[#1e2d12] rounded-full px-3 py-1.5 text-xs font-medium text-white/70 max-w-[60%]">
              <MapPin className="w-3 h-3 text-[#c5f135] shrink-0" />
              <span className="truncate">{target.meeting_point}</span>
            </span>
          )}
        </div>
      )}

      {/* Messages - a fixed compact height so this reads as a popup, not a full page */}
      <div className="h-72 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center pb-20">
            <MessageSquare className="w-10 h-10 text-white/15 mb-3" />
            <p className="text-white/40 text-sm font-medium">{dm ? `No messages with ${dm.name} yet` : "No messages yet"}</p>
            <p className="text-white/25 text-xs mt-1">
              {dm ? "Say hi!" : target.type === "run" ? "Ask a question about this run! Tap a name to message them privately." : "Ask a question or say hi! Tap a name to message them privately."}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === userId
            const name = msg.profiles?.display_name || "Runner"
            const initial = name[0]?.toUpperCase() || "?"
            return (
              <div key={msg.id} className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                {!isMe && (
                  <button
                    onClick={() => startDm(msg)}
                    disabled={!!dm}
                    title={dm ? undefined : `Message ${name} privately`}
                    className="w-7 h-7 rounded-full bg-[#2e3d1a] flex items-center justify-center shrink-0 mt-auto overflow-hidden disabled:cursor-default"
                  >
                    {msg.profiles?.avatar_url
                      ? <img src={msg.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-xs font-bold text-[#c5f135]">{initial}</span>
                    }
                  </button>
                )}
                <div className={`max-w-[72%] flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
                  {!isMe && (
                    <button
                      onClick={() => startDm(msg)}
                      disabled={!!dm}
                      className="text-[10px] text-white/35 px-1 font-medium hover:text-[#c5f135] transition disabled:hover:text-white/35"
                    >
                      {name}
                    </button>
                  )}
                  <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${isMe ? "bg-[#c5f135] text-[#1a2110] font-medium rounded-br-sm" : "bg-[#1e2d12] text-white rounded-bl-sm"}`}>
                    {msg.message}
                  </div>
                  <p className="text-[10px] text-white/25 px-1">{formatChatTime(msg.created_at)}</p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 py-3 border-t border-[#2e3d1a] bg-[#1a2110] flex items-end gap-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder={dm ? `Message ${dm.name}…` : target.type === "run" ? "Ask about this run…" : "Message the klub…"}
          maxLength={500}
          rows={1}
          className="flex-1 bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-[#c5f135]/50 resize-none transition"
          style={{ maxHeight: "120px" }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full bg-[#c5f135] flex items-center justify-center shrink-0 hover:bg-[#d4ff45] transition disabled:opacity-30"
        >
          <Send className="w-4 h-4 text-[#1a2110]" />
        </button>
      </div>
      </div>
    </div>
    </ModalPortal>
  )
}
