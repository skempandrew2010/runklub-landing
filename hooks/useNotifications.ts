"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { NotificationRow } from "@/lib/notifications"

const PAGE_SIZE = 30

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!userId) { setNotifications([]); setLoading(false); return }
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
      .then(({ data }) => {
        setNotifications((data as NotificationRow[]) ?? [])
        setLoading(false)
      })
  }, [userId])

  useEffect(() => { load() }, [load])

  // New rows land instantly (a DM, a join request) instead of needing a
  // refresh - same channel-per-user pattern as the chat panel's messages.
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          setNotifications((prev) => [payload.new as NotificationRow, ...prev].slice(0, PAGE_SIZE))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const unreadCount = notifications.filter((n) => !n.read_at).length

  const markRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)))
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null)
  }

  const markAllRead = async () => {
    if (!userId) return
    const now = new Date().toISOString()
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })))
    await supabase.from("notifications").update({ read_at: now }).eq("user_id", userId).is("read_at", null)
  }

  return { notifications, unreadCount, loading, markRead, markAllRead, reload: load }
}
