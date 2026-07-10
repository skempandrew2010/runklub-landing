"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Search, Mail, Check, ArrowLeft } from "lucide-react"

type Signup = {
  id: string
  display_name: string | null
  email: string
  created_at: string
  signup_reminder_sent_at: string | null
}

export default function AdminSignupsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [signups, setSignups] = useState<Signup[]>([])
  const [search, setSearch] = useState("")
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single()
      if (profile?.role !== "admin") { router.push("/"); return }

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/admin/signups", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (res.ok) {
        const json = await res.json()
        setSignups(json.signups ?? [])
      }
      setLoading(false)
    }
    load()
  }, [router])

  const sendReminder = async (userId: string) => {
    setSending(userId)
    setErrors((prev) => { const n = { ...prev }; delete n[userId]; return n })
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/admin/send-signup-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ user_id: userId }),
    })
    if (res.ok) {
      const now = new Date().toISOString()
      setSent((prev) => new Set(prev).add(userId))
      setSignups((prev) => prev.map((s) => s.id === userId ? { ...s, signup_reminder_sent_at: now } : s))
    } else {
      const json = await res.json().catch(() => ({}))
      setErrors((prev) => ({ ...prev, [userId]: json.error ?? "Failed to send." }))
    }
    setSending(null)
  }

  const searchLower = search.toLowerCase()
  const filtered = search
    ? signups.filter((s) =>
        (s.display_name ?? "").toLowerCase().includes(searchLower) || s.email.toLowerCase().includes(searchLower)
      )
    : signups

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <button
          onClick={() => router.push("/admin/claims")}
          className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/70 transition mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Club Management
        </button>
        <div className="mb-6">
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-black text-white">Incomplete Signups</h1>
          <p className="text-sm text-white/40 mt-1">Accounts that signed up but never finished onboarding.</p>
        </div>

        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1e2d12] border border-[#2e3d1a] rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
            <p className="text-white/40 text-sm">{search ? "No one matches your search." : "Everyone has completed signup."}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => {
              const isSending = sending === s.id
              const wasSent = sent.has(s.id) || !!s.signup_reminder_sent_at
              return (
                <div key={s.id} className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{s.display_name || s.email}</p>
                    <p className="text-xs text-white/30 truncate">{s.email}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-white/20">Signed up {fmtDate(s.created_at)}</span>
                      {s.signup_reminder_sent_at && (
                        <span className="text-[10px] text-[#c5f135]/40">Reminded {fmtDate(s.signup_reminder_sent_at)}</span>
                      )}
                    </div>
                    {errors[s.id] && <p className="text-red-400 text-xs mt-1">{errors[s.id]}</p>}
                  </div>
                  <button
                    onClick={() => sendReminder(s.id)}
                    disabled={isSending || wasSent}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition disabled:opacity-40 bg-[#1a2110] border border-[#2e3d1a] text-white/50 hover:text-[#c5f135] hover:border-[#c5f135]/40 shrink-0"
                  >
                    {wasSent ? <><Check className="w-3.5 h-3.5 text-[#c5f135]" /> Sent</> : isSending ? "…" : <><Mail className="w-3.5 h-3.5" /> Send reminder</>}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
