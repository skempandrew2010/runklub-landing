"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash; the client SDK
    // picks it up automatically via onAuthStateChange.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleReset = async () => {
    if (password.length < 6) return
    setLoading(true)
    setError("")
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push("/")
  }

  const inputClass = "w-full bg-white/8 border border-white/15 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/60 transition text-base"

  return (
    <div className="fixed inset-0 bg-[#111a0a] flex flex-col items-center justify-center">
      <div className="w-full max-w-sm px-6 flex flex-col items-center">
        <div className="mb-10 text-center">
          <span className="text-4xl font-black tracking-tight">
            <span className="text-white">Run</span><span className="text-[#c5f135]">Klub</span>
          </span>
          <p className="text-white/40 text-sm mt-2">Set a new password.</p>
        </div>

        {!ready ? (
          <p className="text-white/40 text-sm text-center">Verifying reset link…</p>
        ) : (
          <div className="w-full space-y-3">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="New password (6+ characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleReset()}
                className={inputClass + " pr-12"}
                autoFocus
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {error && <p className="text-red-400 text-sm px-1">{error}</p>}
            <button
              onClick={handleReset}
              disabled={loading || password.length < 6}
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
