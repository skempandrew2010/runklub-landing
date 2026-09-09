"use client"

import { useState, useEffect, Suspense } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, ArrowRight } from "lucide-react"
import { isNativeApp } from "@/utils/platform"
import { logHandoff } from "@/utils/openExternal"

type Mode = "splash" | "landing" | "login" | "signup" | "forgot"

// Custom scheme registered in ios/App/App/Info.plist (CFBundleURLTypes) and
// in Supabase's Auth > URL Configuration allowed redirect list - OAuthDeepLinkListener
// listens for the app being reopened on this URL to finish native sign-in.
const NATIVE_OAUTH_REDIRECT = "fit.runklub.app://auth-callback"

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.85.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 17 20" fill="currentColor" aria-hidden="true">
      <path d="M13.94 10.6c-.02-2.16 1.77-3.2 1.85-3.25-1.01-1.48-2.58-1.68-3.14-1.7-1.34-.14-2.6.79-3.28.79-.68 0-1.72-.77-2.83-.75-1.46.02-2.8.85-3.55 2.16-1.51 2.62-.39 6.51 1.09 8.64.72 1.04 1.58 2.21 2.71 2.17 1.09-.04 1.5-.7 2.82-.7 1.31 0 1.68.7 2.83.68 1.17-.02 1.91-1.06 2.62-2.11.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.87-2.3-3.49ZM11.78 3.9c.6-.72.99-1.72.88-2.72-.85.03-1.89.57-2.5 1.28-.55.63-1.03 1.65-.9 2.62.95.07 1.92-.48 2.52-1.18Z" />
    </svg>
  )
}

// useSearchParams() (for the oauth_error redirect below) needs a Suspense
// boundary or Next.js can't statically prerender this page at build time.
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="relative min-h-screen bg-[#111a0a] flex items-center justify-center">
        <span className="text-4xl font-black tracking-tight">
          <span className="text-white">Run</span><span className="text-[#c5f135]">Klub</span>
        </span>
      </div>
    }>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<Mode>("splash")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [resetSent, setResetSent] = useState(false)
  const [splashVisible, setSplashVisible] = useState(true)

  // A failed native OAuth redirect (see OAuthDeepLinkListener) lands back
  // here with the failure reason - skip the splash/landing flow entirely
  // and put them straight in front of the error instead of a silent dead end.
  useEffect(() => {
    const oauthError = searchParams.get("oauth_error")
    if (oauthError) {
      setSplashVisible(false)
      setMode("login")
      setError(oauthError)
    }
  }, [searchParams])

  // Splash → then either redirect (logged in) or show landing
  useEffect(() => {
    // A failed-OAuth landing already set mode/error above - don't let this
    // effect's own timers stomp back over it a moment later.
    if (searchParams.get("oauth_error")) return

    const t1 = setTimeout(() => setSplashVisible(false), 1200)
    let settled = false
    const showLanding = () => { if (!settled) { settled = true; setMode("landing") } }

    const t2 = setTimeout(() => {
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            const { data: prof } = await supabase.from("profiles").select("role").eq("id", session.user.id).single()
            if (!settled) {
              settled = true
              router.replace(prof?.role === "admin" ? "/admin/claims" : "/")
            }
            return
          }
        } catch {
          // Restrictive storage contexts (e.g. Safari Private Browsing) can make
          // getSession() throw — fall through to the guest landing either way.
        }
        showLanding()
      })()
    }, 1600)

    // Guaranteed fallback — a hung (not rejected) auth check, e.g. from lock
    // contention with the refresh-token check in lib/supabase.ts, must never
    // leave the user stuck on the splash screen forever.
    const t3 = setTimeout(showLanding, 4500)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [router, searchParams])

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true)
    setError("")
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message === "Invalid login credentials") {
        setError("Wrong email or password. If you don't have an account, go back and tap 'Get Started'.")
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }

    // Returning user — skip onboarding if already done
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("role, onboarding_complete").eq("id", user.id).single()
      if (profile?.role === "admin") {
        router.push("/admin/claims")
      } else {
        router.push(profile?.onboarding_complete ? "/" : "/onboarding")
      }
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
    if (!name.trim() || !email || !password) return
    setLoading(true)
    setError("")
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    if (data.user) {
      await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", data.user.id)
    }
    router.push("/onboarding")
  }

  // Google and Apple both refuse to authenticate inside an embedded WKWebView,
  // so native sign-in opens the OAuth flow in an in-app Safari sheet instead
  // of a plain redirect (which is also why it used to boot people out to the
  // system Safari app entirely - that was Google/Apple's own webview
  // rejection kicking in, not something the app was doing on purpose).
  // OAuthDeepLinkListener (mounted in ShellWrapper) picks up the redirect
  // back into the app and finishes the sign-in.
  const handleOAuth = async (provider: "google" | "apple") => {
    setError("")
    if (isNativeApp()) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: NATIVE_OAUTH_REDIRECT, skipBrowserRedirect: true },
      })
      if (error) {
        logHandoff("oauth-signin-error", { provider, error: error.message })
        setError(error.message)
        return
      }
      if (data?.url) {
        // "Safari cannot open the page because the address is invalid" has
        // been reported here even on a fresh native build - couldn't repro
        // or inspect it directly (no device/Web Inspector available), so
        // logging the exact URL and outcome to surface in Vercel's logs on
        // the next real occurrence instead of guessing further.
        logHandoff("oauth-browser-open-attempt", { provider, targetUrl: data.url })
        try {
          const { Browser } = await import("@capacitor/browser")
          await Browser.open({ url: data.url })
        } catch (err) {
          logHandoff("oauth-browser-open-threw", { provider, targetUrl: data.url, error: String(err) })
        }
      } else {
        logHandoff("oauth-no-url", { provider })
      }
      return
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
  }

  const inputClass = "w-full bg-white/8 border border-white/15 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:border-[#c5f135]/60 transition text-base"

  return (
    <div className="relative min-h-screen bg-[#111a0a] flex flex-col items-center justify-center overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>

      {/* ── SPLASH ── */}
      {(mode === "splash") && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-500 ${splashVisible ? "opacity-100" : "opacity-0"}`}>
          <div className="animate-[fadeScaleIn_0.6s_ease-out_forwards]">
            <span className="text-5xl font-black tracking-tight">
              <span className="text-white">Run</span><span className="text-[#c5f135]">Klub</span>
            </span>
          </div>
          <p className="text-white/30 text-sm mt-3 tracking-widest uppercase text-center px-4">Find Your People. Find Your Pace.</p>
        </div>
      )}

      {/* ── LANDING / AUTH ── */}
      {mode !== "splash" && (
        <div className="w-full max-w-sm px-6 flex flex-col items-center animate-[fadeUp_0.45s_ease-out_forwards]">

          {/* Logo */}
          <div className={`text-center ${mode === "landing" ? "mb-6" : "mb-10"}`}>
            <span className="text-4xl font-black tracking-tight">
              <span className="text-white">Run</span><span className="text-[#c5f135]">Klub</span>
            </span>
            <p className="text-white/40 text-sm mt-2">
              {mode === "login" ? "Welcome back." : mode === "signup" ? "Create your account." : "Find Your People. Find Your Pace."}
            </p>
          </div>

          {/* ── Landing benefits ── */}
          {mode === "landing" && (
            <div className="w-full space-y-2.5 mb-8">
              {[
                { emoji: "👟", title: "Running is easier with others", sub: "Stay consistent, push harder, and actually show up." },
                { emoji: "🗺️", title: "Explore your city through klubs", sub: "Discover routes and neighborhoods you'd never find alone." },
                { emoji: "🤝", title: "Meet people through movement", sub: "The best friendships start at mile one." },
              ].map(({ emoji, title, sub }) => (
                <div key={title} className="flex items-start gap-3.5 bg-white/4 rounded-2xl px-4 py-3.5">
                  <span className="text-xl mt-0.5 shrink-0">{emoji}</span>
                  <div>
                    <p className="text-sm font-bold text-white leading-snug">{title}</p>
                    <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

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

              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-white/25 text-xs">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <button onClick={() => handleOAuth("google")} className="w-full flex items-center justify-center gap-2 border border-white/15 rounded-2xl py-3.5 text-white/80 text-sm font-semibold hover:bg-white/5 transition">
                <GoogleIcon />
                Continue with Google
              </button>
              <button onClick={() => handleOAuth("apple")} className="w-full flex items-center justify-center gap-2 border border-white/15 rounded-2xl py-3.5 text-white/80 text-sm font-semibold hover:bg-white/5 transition">
                <AppleIcon />
                Continue with Apple
              </button>
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
              <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus />
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              <div className="relative">
                <input type={showPassword ? "text" : "password"} placeholder="Password (6+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSignup()} className={inputClass + " pr-12"} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {error && <p className="text-red-400 text-sm px-1">{error}</p>}
              <button onClick={handleSignup} disabled={loading || !name.trim() || !email || password.length < 6} className="w-full bg-[#c5f135] text-[#1a2110] font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#d4ff45] transition disabled:opacity-40 mt-1">
                {loading ? "Creating account…" : <><span>Get Started</span><ArrowRight className="w-4 h-4" /></>}
              </button>
              <p className="text-[11px] text-white/30 text-center leading-relaxed px-2">
                By signing up, you agree to our{" "}
                <a href="/terms" className="text-white/50 underline hover:text-white/70 transition">Terms of Service</a>
                {" "}and{" "}
                <a href="/privacy" className="text-white/50 underline hover:text-white/70 transition">Privacy Policy</a>.
              </p>

              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-white/25 text-xs">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <button onClick={() => handleOAuth("google")} className="w-full flex items-center justify-center gap-2 border border-white/15 rounded-2xl py-3.5 text-white/80 text-sm font-semibold hover:bg-white/5 transition">
                <GoogleIcon />
                Continue with Google
              </button>
              <button onClick={() => handleOAuth("apple")} className="w-full flex items-center justify-center gap-2 border border-white/15 rounded-2xl py-3.5 text-white/80 text-sm font-semibold hover:bg-white/5 transition">
                <AppleIcon />
                Continue with Apple
              </button>

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
