"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    // Method 1: PKCE code flow — Supabase appends ?code=... to the redirect URL
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          setExpired(true)
        } else {
          setReady(true)
        }
      })
      return
    }

    // Method 2: Legacy hash-based recovery token — listen for PASSWORD_RECOVERY event
    // Set a timeout so users don't get stuck on "Verifying…" if the event already fired
    const timeout = setTimeout(() => setExpired(true), 8000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        clearTimeout(timeout)
        setReady(true)
      }
    })

    // Also check if session is already in recovery state
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        clearTimeout(timeout)
        setReady(true)
      }
    })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const handleReset = async () => {
    if (password.length < 6) { setError("Password must be at least 6 characters."); return }
    if (password !== confirm) { setError("Passwords don't match."); return }
    setLoading(true)
    setError("")
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    setDone(true)
    setTimeout(() => router.push("/explore"), 2000)
  }

  const inputClass = "w-full bg-white/8 border border-white/15 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/60 transition text-base"

  return (
    <div className="relative min-h-screen bg-[#111a0a] flex flex-col items-center justify-center" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="w-full max-w-sm px-6 flex flex-col items-center">

        <div className="mb-10 text-center">
          <span className="text-4xl font-black tracking-tight">
            <span className="text-white">Run</span><span className="text-[#c5f135]">Klub</span>
          </span>
          <p className="text-white/40 text-sm mt-2">Set a new password.</p>
        </div>

        {/* Success */}
        {done && (
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#c5f135]/10 flex items-center justify-center mx-auto">
              <span className="text-2xl">✅</span>
            </div>
            <p className="text-white font-bold">Password updated!</p>
            <p className="text-white/40 text-sm">Taking you back to the app…</p>
          </div>
        )}

        {/* Expired / invalid link */}
        {!done && expired && (
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
              <span className="text-2xl">⏱</span>
            </div>
            <p className="text-white font-bold">Link expired</p>
            <p className="text-white/40 text-sm">Password reset links expire after 1 hour. Request a new one.</p>
            <button
              onClick={() => router.push("/login")}
              className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl hover:bg-[#d4ff45] transition mt-2"
            >
              Back to Log In
            </button>
          </div>
        )}

        {/* Verifying */}
        {!done && !expired && !ready && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
            <p className="text-white/40 text-sm">Verifying reset link…</p>
          </div>
        )}

        {/* Reset form */}
        {!done && !expired && ready && (
          <div className="w-full space-y-3">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="New password (6+ characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass + " pr-12"}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleReset()}
              className={inputClass}
            />
            {error && <p className="text-red-400 text-sm px-1">{error}</p>}
            <button
              onClick={handleReset}
              disabled={loading || password.length < 6 || !confirm}
              className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl hover:bg-[#d4ff45] transition disabled:opacity-40 mt-1"
            >
              {loading ? "Updating…" : "Update Password"}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
