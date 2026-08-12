"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import HubContent from "@/components/HubContent"
import DirectorHomeContent from "@/components/DirectorHomeContent"
import CoachHomeSummary from "@/components/CoachHomeSummary"
import { useNavIdentity } from "@/hooks/useNavIdentity"
import { useViewMode } from "@/hooks/useViewMode"

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<"below" | "visible" | "above">("below")

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("visible")
        } else {
          setState(entry.boundingClientRect.top < 0 ? "above" : "below")
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`transition-all duration-700 ease-out ${
        state === "visible" ? "opacity-100 translate-y-0" :
        state === "above"   ? "opacity-0 -translate-y-5" :
                              "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  )
}

export default function RootPage() {
  const router = useRouter()
  const [signedIn, setSignedIn] = useState(false)
  const { user, role, loaded: identityLoaded, isCoach, hasClub } = useNavIdentity()
  const isManager = role === "manager"
  const { viewMode } = useViewMode(isManager || isCoach)

  useEffect(() => {
    const hash = window.location.hash
    const isAuthRedirect =
      hash.includes("access_token=") &&
      (hash.includes("type=invite") || hash.includes("type=magiclink"))
    if (isAuthRedirect) router.replace(`/welcome${hash}`)
  }, [router])

  // Signed-in users get the Hub here instead of the marketing page. Defaults
  // to the marketing page (better for anonymous-visitor SEO/first paint) and
  // swaps in once we positively confirm a session.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setSignedIn(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (signedIn) {
    if (!identityLoaded) {
      return (
        <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
        </div>
      )
    }
    // Prefer whichever role actually has something to show — role=manager
    // with no klub of their own yet, who's also an active coach elsewhere,
    // should land on their real coach summary, not an empty "no klub" page.
    if (isManager && hasClub && viewMode === "director") return <DirectorHomeContent userId={user.id} />
    if (isCoach && viewMode === "director") return <CoachHomeSummary userId={user.id} />
    if (isManager && viewMode === "director") return <DirectorHomeContent userId={user.id} />
    return <HubContent />
  }

  return (
    <div className="min-h-screen bg-[#1a2110] text-white">

      {/* Hero — no fade, visible on load */}
      <section className="flex flex-col items-center justify-center text-center px-6 pt-24 pb-20">
        <h1 className="text-5xl sm:text-6xl font-black leading-tight tracking-tight max-w-2xl">
          Find your people.<br />
          <span className="text-[#c5f135] italic">Find your pace.</span>
        </h1>
        <p className="mt-6 text-white/50 text-base sm:text-lg max-w-md leading-relaxed">
          RunKlub connects runners with local run klubs, from free community runs to coached training programs. Show up, meet people, run faster.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 mt-10">
          <Link href="/explore" className="px-8 py-4 bg-[#c5f135] text-[#1a2110] font-black rounded-full text-lg hover:bg-[#d4fb4d] transition">
            Find a Klub
          </Link>
          <Link href="/submit-club" className="px-8 py-4 border border-[#3d5220] text-white font-black rounded-full text-lg hover:bg-[#1e2d12] transition">
            Create a Klub
          </Link>
        </div>
      </section>

      {/* What is RunKlub */}
      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-[#2e3d1a]">
        <FadeIn>
          <h2 className="text-2xl font-black text-white mb-4">What is RunKlub?</h2>
          <p className="text-white/50 leading-relaxed text-base">
            RunKlub is a platform for run klubs and the runners who love them. Whether you&apos;re a casual jogger looking for weekend company or a competitive runner chasing a PR, there&apos;s a klub for you. We make it easy for klubs to share their schedule, grow their community, and keep their members coming back, and easy for runners to find exactly the right crew.
          </p>
        </FadeIn>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10">
          {[
            { stat: "700+", label: "Run Klubs across the US" },
            { stat: "Weekly", label: "Runs in your city" },
            { stat: "All levels", label: "From 5K to ultra" },
          ].map(({ stat, label }, i) => (
            <FadeIn key={stat} delay={i * 100}>
              <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5">
                <p className="text-[#c5f135] text-3xl font-black mb-1">{stat}</p>
                <p className="text-white/50 text-sm">{label}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Founder story */}
      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-[#2e3d1a]">
        <FadeIn>
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-3">Our story</p>
          <h2 className="text-2xl font-black text-white mb-6">Built by runners, for runners.</h2>
          <div className="space-y-4 text-white/50 leading-relaxed text-base">
            <p>
              Andrew and Sean met at St. Olaf College, where they ran together on the cross country and track and field teams for four years. Both earned All-American honors along the way, Andrew on the cross country course and Sean on the track. After graduating, they ended up in Boulder, CO, one of the best running cities in the country.
            </p>
            <p>
              The idea for RunKlub came from a frustrating experience. Andrew was in Las Vegas for the Rock and Roll Half Marathon and wanted to find a local run klub to get some miles in during the days leading up to the race. No matter where he looked, he could not find what he needed. It was not the first time either. He had run into the same wall while traveling before, knowing klubs were out there but having no easy way to find them.
            </p>
            <p>
              When he got back to Boulder, he asked Sean if he wanted to help him build a solution. They got to work, and RunKlub was born. The goal is simple: no runner, whether at home or on the road, should ever struggle to find their people.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={100}>
          <div className="mt-8 rounded-2xl overflow-hidden border border-[#2e3d1a]">
            <img
              src="/andrew-sean-together.jpg"
              alt="Andrew and Sean at St. Olaf"
              className="w-full object-cover"
              style={{ maxHeight: "360px", objectPosition: "center 52%" }}
            />
            <p className="text-xs text-white/30 px-4 py-2.5 bg-[#1e2d12]">Andrew & Sean at St. Olaf College</p>
          </div>
        </FadeIn>

        <FadeIn delay={150}>
          <div className="mt-8 flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full border-2 border-[#3d5220] overflow-hidden shrink-0">
                <img src="/andrew-skemp.jpg" alt="Andrew Skemp" className="w-full h-full object-cover scale-[2.2]" style={{ objectPosition: "center 52%", transformOrigin: "center 52%" }} />
              </div>
              <div>
                <p className="font-black text-white text-sm">Andrew Skemp</p>
                <p className="text-white/40 text-xs">Co-founder, RunKlub</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full border-2 border-[#3d5220] overflow-hidden shrink-0">
                <img src="/sean-hartney.jpg" alt="Sean Hartney" className="w-full h-full object-cover scale-[2.2]" style={{ objectPosition: "38% 22%", transformOrigin: "38% 22%" }} />
              </div>
              <div>
                <p className="font-black text-white text-sm">Sean Hartney</p>
                <p className="text-white/40 text-xs">Co-founder, RunKlub</p>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* Director plans */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-[#2e3d1a]">
        <FadeIn>
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-3">For Directors</p>
          <h2 className="text-2xl font-black text-white mb-3">Run your klub, your way.</h2>
          <p className="text-white/50 text-base mb-10 max-w-xl">Every klub starts free. Upgrade when you&apos;re ready to grow your community.</p>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          <FadeIn delay={0}>
            <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5 flex flex-col h-full">
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Free</p>
              <p className="text-3xl font-black text-white mb-0.5">$0</p>
              <p className="text-xs text-white/30 mb-5">forever</p>
              <ul className="space-y-2.5 flex-1">
                {["Public klub listing", "Unlimited run posts", "Run chat for members", "Push notifications"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/55">
                    <span className="text-[#c5f135]/60 shrink-0 mt-px">✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link href="/submit-club" className="mt-6 block text-center px-4 py-2.5 rounded-xl border border-[#3d5220] text-white/60 text-sm font-bold hover:border-[#c5f135]/30 hover:text-white/80 transition">
                Get started
              </Link>
            </div>
          </FadeIn>

          <FadeIn delay={80}>
            <div className="bg-[#1e2d12] border border-[#c5f135]/20 rounded-2xl p-5 flex flex-col h-full">
              <p className="text-[10px] font-bold text-[#c5f135]/70 uppercase tracking-widest mb-1">Starter</p>
              <p className="text-3xl font-black text-white mb-0.5">$24.99</p>
              <p className="text-xs text-white/30 mb-5">per month · 1-month free trial</p>
              <ul className="space-y-2.5 flex-1">
                {["Everything in Free", "Member-only runs", "Weekly email reminders", "Charge members to join", "Workout library", "Verified badge"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/55">
                    <span className="text-[#c5f135]/60 shrink-0 mt-px">✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link href="/submit-club" className="mt-6 block text-center px-4 py-2.5 rounded-xl bg-[#c5f135]/10 border border-[#c5f135]/30 text-[#c5f135] text-sm font-bold hover:bg-[#c5f135]/20 transition">
                Start free trial
              </Link>
            </div>
          </FadeIn>

          <FadeIn delay={160}>
            <div className="bg-[#1a2d0a] border border-[#c5f135]/35 rounded-2xl p-5 flex flex-col h-full relative overflow-hidden">
              <div className="absolute top-3 right-3 text-[9px] font-black px-2 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110]">POPULAR</div>
              <p className="text-[10px] font-bold text-[#c5f135]/70 uppercase tracking-widest mb-1">Growth</p>
              <p className="text-3xl font-black text-white mb-0.5">$49.99</p>
              <p className="text-xs text-white/30 mb-5">per month</p>
              <ul className="space-y-2.5 flex-1">
                {["Everything in Starter", "Multiple locations", "Pace groups", "Up to 10 coaches", "Newsletter to members", "Priority search placement"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/55">
                    <span className="text-[#c5f135] shrink-0 mt-px">✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link href="/submit-club" className="mt-6 block text-center px-4 py-2.5 rounded-xl bg-[#c5f135] text-[#1a2110] text-sm font-black hover:bg-[#d4ff45] transition">
                Get Growth
              </Link>
            </div>
          </FadeIn>

          <FadeIn delay={240}>
            <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5 flex flex-col h-full">
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Enterprise</p>
              <p className="text-3xl font-black text-white mb-0.5">$99.99</p>
              <p className="text-xs text-white/30 mb-5">per month</p>
              <ul className="space-y-2.5 flex-1">
                {["Everything in Growth", "Unlimited branches", "First in city search", "Training schedules", "Event payments at 1%", "Unlimited coaches"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/55">
                    <span className="text-[#c5f135]/60 shrink-0 mt-px">✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link href="/submit-club" className="mt-6 block text-center px-4 py-2.5 rounded-xl border border-[#3d5220] text-white/60 text-sm font-bold hover:border-[#c5f135]/30 hover:text-white/80 transition">
                Get Enterprise
              </Link>
            </div>
          </FadeIn>

        </div>

        <FadeIn delay={100}>
          <p className="text-xs text-white/25 text-center mt-6">All plans include a free klub page. No contract, cancel anytime.</p>
        </FadeIn>
      </section>

      {/* CTA footer */}
      <section className="border-t border-[#2e3d1a] py-16 text-center px-6">
        <FadeIn>
          <h2 className="text-3xl font-black text-white mb-4">Ready to find your crew?</h2>
          <p className="text-white/40 text-sm mb-8">Join hundreds of runners already using RunKlub.</p>
          <Link href="/explore" className="inline-block px-10 py-4 bg-[#c5f135] text-[#1a2110] font-black rounded-full text-lg hover:bg-[#d4fb4d] transition">
            Browse Run Klubs
          </Link>
        </FadeIn>
      </section>

    </div>
  )
}
