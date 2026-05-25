"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, ArrowRight } from "lucide-react"

type Mode = "splash" | "landing" | "login" | "signup" | "forgot"

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("splash")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [resetSent, setResetSent] = useState(false)
  const [splashVisible, setSplashVisible] = useState(true)

  // 1.5s splash → landing
  useEffect(() => {
    const t1 = setTimeout(() => setSplashVisible(false), 1200)
    const t2 = setTimeout(() => setMode("landing"), 1600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true)
    setError("")
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }

    // Returning user — skip onboarding if already done
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("onboarding_complete").eq("id", user.id).single()
      router.push(profile?.onboarding_complete ? "/" : "/onboarding")
    }
  }

  const handleForgot = async () => {
    if (!email) return
    setLoading(true)
    setError("")
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setResetSent(true)
  }

  const handleSignup = async () => {
    if (!email || !password) return
    setLoading(true)
    setError("")
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push("/onboarding")
  }

  const inputClass = "w-full bg-white/8 border border-white/15 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/60 transition text-base"

  return (
    <div className="fixed inset-0 bg-[#111a0a] flex flex-col items-center justify-center overflow-hidden">

      {/* ── SPLASH ── */}
      {(mode === "splash") && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-500 ${splashVisible ? "opacity-100" : "opacity-0"}`}>
          <div className="animate-[fadeScaleIn_0.6s_ease-out_forwards]">
            <span className="text-5xl font-black tracking-tight">
              <span className="text-white">Run</span><span className="text-[#c5f135]">Klub</span>
            </span>
          </div>
          <p className="text-white/30 text-sm mt-3 tracking-widest uppercase">Run with anyone, anywhere.</p>
        </div>
      )}

      {/* ── LANDING / AUTH ── */}
      {mode !== "splash" && (
        <div className="w-full max-w-sm px-6 flex flex-col items-center animate-[fadeUp_0.45s_ease-out_forwards]">

          {/* Logo */}
          <div className="mb-10 text-center">
            <span className="text-4xl font-black tracking-tight">
              <span className="text-white">Run</span><span className="text-[#c5f135]">Klub</span>
            </span>
            <p className="text-white/40 text-sm mt-2">
              {mode === "login" ? "Welcome back." : mode === "signup" ? "Create your account." : "Run with anyone, anywhere."}
            </p>
          </div>

          {/* ── Login form ── */}
          {mode === "login" && (
            <div className="w-full space-y-3">
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoFocus />
              <div className="relative">
                <input type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} className={inputClass + " pr-12"} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {error && <p className="text-red-400 text-sm px-1">{error}</p>}
              <button onClick={handleLogin} disabled={loading || !email || !password} className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl hover:bg-[#d4ff45] transition disabled:opacity-40 mt-1">
                {loading ? "Signing in…" : "Log In"}
              </button>
              <div className="flex items-center justify-between px-1">
                <button onClick={() => { setMode("landing"); setError("") }} className="text-white/40 text-sm py-2 hover:text-white/70 transition">
                  ← Back
                </button>
                <button onClick={() => { setMode("forgot"); setError(""); setResetSent(false) }} className="text-white/40 text-sm py-2 hover:text-white/70 transition">
                  Forgot password?
                </button>
              </div>
            </div>
          )}

          {/* ── Forgot password ── */}
          {mode === "forgot" && (
            <div className="w-full space-y-3">
              {resetSent ? (
                <div className="text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#c5f135]/10 flex items-center justify-center mx-auto">
                    <span className="text-2xl">✉️</span>
                  </div>
                  <p className="text-white font-bold">Check your email</p>
                  <p className="text-white/40 text-sm">We sent a password reset link to <span className="text-white/70">{email}</span>.</p>
                  <button onClick={() => { setMode("login"); setResetSent(false) }} className="w-full text-white/40 text-sm py-2 hover:text-white/70 transition mt-2">
                    ← Back to Log In
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-white/50 text-sm text-center pb-1">Enter your email and we'll send you a reset link.</p>
                  <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleForgot()} className={inputClass} autoFocus />
                  {error && <p className="text-red-400 text-sm px-1">{error}</p>}
                  <button onClick={handleForgot} disabled={loading || !email} className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl hover:bg-[#d4ff45] transition disabled:opacity-40 mt-1">
                    {loading ? "Sending…" : "Send Reset Link"}
                  </button>
                  <button onClick={() => { setMode("login"); setError("") }} className="w-full text-white/40 text-sm py-2 hover:text-white/70 transition">
                    ← Back to Log In
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Signup form ── */}
          {mode === "signup" && (
            <div className="w-full space-y-3">
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoFocus />
              <div className="relative">
                <input type={showPassword ? "text" : "password"} placeholder="Password (6+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSignup()} className={inputClass + " pr-12"} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {error && <p className="text-red-400 text-sm px-1">{error}</p>}
              <button onClick={handleSignup} disabled={loading || !email || password.length < 6} className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#d4ff45] transition disabled:opacity-40 mt-1">
                {loading ? "Creating account…" : <><span>Get Started</span><ArrowRight className="w-4 h-4" /></>}
              </button>

              {/* Social placeholders */}
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-white/25 text-xs">or continue with</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {["Google", "Apple"].map((p) => (
                  <button key={p} disabled className="flex items-center justify-center gap-2 border border-white/10 rounded-2xl py-3.5 text-white/30 text-sm font-semibold cursor-not-allowed">
                    {p}
                    <span className="text-[10px] text-white/20 font-normal">soon</span>
                  </button>
                ))}
              </div>

              <button onClick={() => { setMode("landing"); setError("") }} className="w-full text-white/40 text-sm py-2 hover:text-white/70 transition">
                ← Back
              </button>
            </div>
          )}

          {/* ── Landing choice ── */}
          {mode === "landing" && (
            <div className="w-full space-y-3">
              <button onClick={() => setMode("signup")} className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#d4ff45] transition">
                Get Started <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => setMode("login")} className="w-full border border-white/15 text-white font-semibold text-base py-4 rounded-2xl hover:border-white/30 hover:bg-white/5 transition">
                Log In
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes fadeScaleIn {
          from { opacity: 0; transform: scale(0.88); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
