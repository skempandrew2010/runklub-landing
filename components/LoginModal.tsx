"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, X } from "lucide-react"

type Props = {
  onClose: () => void
  onSuccess?: () => void
}

export default function LoginModal({ onClose, onSuccess }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [isSignup, setIsSignup] = useState(false)

  const handleSubmit = async () => {
    if (!email || !password) return
    setError("")
    setLoading(true)

    if (isSignup) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      onClose()
      router.push("/onboarding")
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }

    if (onSuccess) onSuccess()
    onClose()
  }

  const inputClass = "w-full bg-[#1e2d12] border border-[#2e3d1a] rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/60 transition text-sm"

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-[#1a2110] sm:rounded-2xl rounded-t-3xl shadow-2xl p-6 space-y-4 z-10 border border-[#2e3d1a]">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/30 hover:text-white transition">
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-black text-white">{isSignup ? "Create account" : "Welcome back"}</h2>
          <p className="text-sm text-white/40 mt-0.5">{isSignup ? "Join RunKlub" : "Sign in to continue"}</p>
        </div>

        <div className="space-y-2.5">
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          <div className="relative">
            <input type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} className={inputClass + " pr-10"} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button onClick={handleSubmit} disabled={loading || !email || !password} className="w-full bg-[#c5f135] text-[#1a2110] font-black py-3 rounded-xl hover:bg-[#d4ff45] transition disabled:opacity-40 text-sm">
          {loading ? "Loading…" : isSignup ? "Create Account" : "Log In"}
        </button>

        <p className="text-center text-xs text-white/40">
          {isSignup ? "Already have an account?" : "Don't have an account?"}
          <button onClick={() => { setIsSignup(!isSignup); setError("") }} className="ml-1 text-[#c5f135] font-semibold hover:underline">
            {isSignup ? "Log in" : "Sign up"}
          </button>
        </p>
      </div>
    </div>
  )
}
