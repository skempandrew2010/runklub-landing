"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash
    const isAuthRedirect =
      hash.includes("access_token=") &&
      (hash.includes("type=invite") || hash.includes("type=magiclink"))

    if (isAuthRedirect) {
      router.replace(`/welcome${hash}`)
    }
  }, [router])

  return (
    <div className="min-h-screen bg-[#1a2110] text-white">

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 pt-24 pb-20">
        <h1 className="text-5xl sm:text-6xl font-black leading-tight tracking-tight max-w-2xl">
          Find your people.<br />
          <span className="text-[#c5f135] italic">Find your pace.</span>
        </h1>
        <p className="mt-6 text-white/50 text-base sm:text-lg max-w-md leading-relaxed">
          RunKlub connects runners with local run clubs, from free community runs to coached training programs. Show up, meet people, run faster.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 mt-10">
          <Link
            href="/explore"
            className="px-8 py-4 bg-[#c5f135] text-[#1a2110] font-black rounded-full text-lg hover:bg-[#d4fb4d] transition"
          >
            Find a Klub
          </Link>
          <Link
            href="/submit-club"
            className="px-8 py-4 border border-[#3d5220] text-white font-black rounded-full text-lg hover:bg-[#1e2d12] transition"
          >
            Create a Klub
          </Link>
        </div>
      </section>

      {/* What is RunKlub */}
      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-[#2e3d1a]">
        <h2 className="text-2xl font-black text-white mb-4">What is RunKlub?</h2>
        <p className="text-white/50 leading-relaxed text-base">
          RunKlub is a platform for run clubs and the runners who love them. Whether you&apos;re a casual jogger looking for weekend company or a competitive runner chasing a PR, there&apos;s a club for you. We make it easy for clubs to share their schedule, grow their community, and keep their members coming back, and easy for runners to find exactly the right crew.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10">
          <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5">
            <p className="text-[#c5f135] text-3xl font-black mb-1">700+</p>
            <p className="text-white/50 text-sm">Run Klubs across the US</p>
          </div>
          <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5">
            <p className="text-[#c5f135] text-3xl font-black mb-1">Weekly</p>
            <p className="text-white/50 text-sm">Runs in your city</p>
          </div>
          <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5">
            <p className="text-[#c5f135] text-3xl font-black mb-1">All levels</p>
            <p className="text-white/50 text-sm">From 5K to ultra</p>
          </div>
        </div>
      </section>

      {/* Founder story */}
      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-[#2e3d1a]">
        <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-3">Our story</p>
        <h2 className="text-2xl font-black text-white mb-6">Built by runners, for runners.</h2>
        <div className="space-y-4 text-white/50 leading-relaxed text-base">
          <p>
            Andrew and Sean met at St. Olaf College, where they ran together on the cross country and track and field teams for four years. Both earned All-American honors along the way, Andrew on the cross country course and Sean on the track. After graduating, they ended up in Boulder, CO, one of the best running cities in the country.
          </p>
          <p>
            The idea for RunKlub came from a frustrating experience. Andrew was in Las Vegas for the Rock and Roll Half Marathon and wanted to find a local run club to get some miles in during the days leading up to the race. No matter where he looked, he could not find what he needed. It was not the first time either. He had run into the same wall while traveling before, knowing clubs were out there but having no easy way to find them.
          </p>
          <p>
            When he got back to Boulder, he asked Sean if he wanted to help him build a solution. They got to work, and RunKlub was born. The goal is simple: no runner, whether at home or on the road, should ever struggle to find their people.
          </p>
        </div>

        {/* Together photo */}
        <div className="mt-8 rounded-2xl overflow-hidden border border-[#2e3d1a]">
          <img
            src="/andrew-sean-together.jpg"
            alt="Andrew and Sean at St. Olaf"
            className="w-full object-cover"
            style={{ maxHeight: "360px", objectPosition: "center 52%" }}
          />
          <p className="text-xs text-white/30 px-4 py-2.5 bg-[#1e2d12]">Andrew & Sean at St. Olaf College</p>
        </div>

        <div className="mt-8 flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full border-2 border-[#3d5220] overflow-hidden shrink-0">
              <img
                src="/andrew-skemp.jpg"
                alt="Andrew Skemp"
                className="w-full h-full object-cover scale-[2.2]"
                style={{ objectPosition: "center 52%", transformOrigin: "center 52%" }}
              />
            </div>
            <div>
              <p className="font-black text-white text-sm">Andrew Skemp</p>
              <p className="text-white/40 text-xs">Co-founder, RunKlub</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full border-2 border-[#3d5220] overflow-hidden shrink-0">
              <img
                src="/sean-hartney.jpg"
                alt="Sean Hartney"
                className="w-full h-full object-cover scale-[2.2]"
                style={{ objectPosition: "38% 22%", transformOrigin: "38% 22%" }}
              />
            </div>
            <div>
              <p className="font-black text-white text-sm">Sean Hartney</p>
              <p className="text-white/40 text-xs">Co-founder, RunKlub</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA footer */}
      <section className="border-t border-[#2e3d1a] py-16 text-center px-6">
        <h2 className="text-3xl font-black text-white mb-4">Ready to find your crew?</h2>
        <p className="text-white/40 text-sm mb-8">Join hundreds of runners already using RunKlub.</p>
        <Link
          href="/explore"
          className="inline-block px-10 py-4 bg-[#c5f135] text-[#1a2110] font-black rounded-full text-lg hover:bg-[#d4fb4d] transition"
        >
          Browse Run Clubs
        </Link>
      </section>

    </div>

  )
}
