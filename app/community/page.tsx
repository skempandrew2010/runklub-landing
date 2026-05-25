import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-10">

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <div className="mb-10">
          <p className="text-xs font-bold text-[#c5f135]/60 uppercase tracking-widest mb-2">Legal</p>
          <h1 className="text-3xl font-black text-white">Community Guidelines</h1>
          <p className="text-sm text-white/35 mt-2">Last updated: May 2026</p>
        </div>

        <div className="mb-8 bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5">
          <p className="text-sm text-white/70 leading-relaxed">
            RunKlub exists to make running more accessible and community-driven. These guidelines
            exist to keep it a welcoming, honest, and safe place for everyone — whether you're a
            runner looking for a crew or a club manager building your community.
          </p>
        </div>

        <div className="space-y-8 text-sm text-white/60 leading-relaxed">

          <section className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#c5f135]" />
              <h2 className="text-base font-bold text-white">Be Accurate</h2>
            </div>
            <p>
              Only list clubs and runs that are real. Provide accurate meeting times, locations,
              and descriptions. If details change, update them promptly — other runners are
              counting on that information to show up at the right place and time.
            </p>
            <p>
              Don't impersonate other clubs, use another club's name or branding, or create
              listings for events you don't organize.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#c5f135]" />
              <h2 className="text-base font-bold text-white">Be Welcoming</h2>
            </div>
            <p>
              RunKlub is for every runner — regardless of pace, experience, background, age, gender,
              or ability. Clubs listed here should be welcoming to new runners and respectful of all
              members and visitors.
            </p>
            <p>
              Discrimination, hate speech, or exclusionary language of any kind will result in
              immediate removal.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#c5f135]" />
              <h2 className="text-base font-bold text-white">Be Respectful</h2>
            </div>
            <p>
              Treat other runners and club managers with respect. Run chats and club descriptions
              should be free of harassment, personal attacks, threats, and offensive content.
            </p>
            <p>
              Disagreements happen — handle them constructively or bring them to us. Don't use
              the platform to settle personal disputes.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#c5f135]" />
              <h2 className="text-base font-bold text-white">No Spam or Self-Promotion</h2>
            </div>
            <p>
              Don't use RunKlub to mass-promote unrelated products, services, or events. Run chats
              are for coordinating runs — not for advertising. Club email newsletters should only
              be sent to members who have opted in and should contain relevant club information.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#c5f135]" />
              <h2 className="text-base font-bold text-white">Prioritize Safety</h2>
            </div>
            <p>
              As a club manager, you are responsible for communicating relevant safety information
              to attendees — including route conditions, terrain, and any physical requirements.
              Be honest about pace and difficulty so runners can make informed decisions.
            </p>
            <p>
              Do not organize events in unsafe conditions or locations, or encourage behavior that
              puts runners at risk.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#c5f135]" />
              <h2 className="text-base font-bold text-white">No Illegal Activity</h2>
            </div>
            <p>
              Don't use RunKlub for anything illegal. This includes listing events that involve
              trespassing, organizing unlicensed races on public roads without permits, or any
              other activity that violates local laws.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">Enforcement</h2>
            <p>
              We review reports and take action at our discretion. Violations may result in content
              removal, account suspension, or a permanent ban — depending on severity. Repeated
              minor violations are treated the same as a single serious one.
            </p>
            <p>
              We're a small team and rely on the community to flag issues. If you see something
              that violates these guidelines, reach out at{" "}
              <a href="mailto:runklubinfo@gmail.com" className="text-[#c5f135] hover:underline">
                runklubinfo@gmail.com
              </a>
            </p>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-[#2e3d1a] flex flex-wrap gap-4 text-xs text-white/25">
          <Link href="/terms" className="hover:text-white/50 transition">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-white/50 transition">Privacy Policy</Link>
        </div>

      </div>
    </div>
  )
}
