import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function TermsPage() {
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
          <h1 className="text-3xl font-black text-white">Terms of Service</h1>
          <p className="text-sm text-white/35 mt-2">Last updated: May 2026</p>
        </div>

        <div className="space-y-8 text-sm text-white/60 leading-relaxed">

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">1. Acceptance of Terms</h2>
            <p>
              By accessing or using RunKlub ("the Service"), you agree to be bound by these Terms of Service.
              If you do not agree to these terms, please do not use the Service. We may update these terms
              from time to time — continued use after changes constitutes acceptance.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">2. What RunKlub Is</h2>
            <p>
              RunKlub is a discovery and management platform for run clubs. It allows runners to find local
              clubs, view upcoming run events, and connect with their running community. Club managers can
              list their clubs, schedule runs, and communicate with members.
            </p>
            <p>
              RunKlub is a platform only. We do not organize, lead, or supervise any runs or events listed
              on the Service. All events are created and managed independently by club organizers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">3. Accounts</h2>
            <p>
              To access certain features you must create an account. You are responsible for keeping your
              login credentials secure and for all activity that occurs under your account. You must provide
              accurate information and keep it up to date. You must be at least 13 years old to use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">4. Club Listings and Content</h2>
            <p>
              Club managers are solely responsible for the accuracy of their club information, run event
              details, meeting locations, and any other content they post. RunKlub does not verify or
              endorse any club listing or event. Always confirm event details directly with the organizer
              before attending.
            </p>
            <p>
              By posting content on RunKlub, you grant us a non-exclusive, royalty-free license to display
              that content on the Service. You retain ownership of your content.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">5. Prohibited Conduct</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Post false, misleading, or fraudulent club or event information</li>
              <li>Harass, threaten, or harm other users</li>
              <li>Use the Service to send unsolicited messages or spam</li>
              <li>Attempt to access accounts or data you are not authorized to access</li>
              <li>Use automated tools to scrape or abuse the Service</li>
              <li>Violate any applicable law or regulation</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">6. Safety Disclaimer</h2>
            <p>
              Running involves physical risk. RunKlub is not responsible for any injury, accident, loss,
              or harm that occurs in connection with any run event found through the Service. Participants
              attend events at their own risk. Club organizers are responsible for communicating any
              relevant safety information to attendees.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">7. Termination</h2>
            <p>
              We reserve the right to suspend or terminate any account that violates these terms or that
              we determine, at our sole discretion, is harmful to the Service or its users. You may
              delete your account at any time by contacting us.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">8. Disclaimers</h2>
            <p>
              The Service is provided "as is" without warranties of any kind. We do not guarantee
              uninterrupted access, accuracy of listings, or fitness for a particular purpose. To the
              maximum extent permitted by law, RunKlub is not liable for any indirect, incidental,
              or consequential damages arising from your use of the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">9. Contact</h2>
            <p>
              Questions about these terms? Reach us at{" "}
              <a href="mailto:runklubinfo@gmail.com" className="text-[#c5f135] hover:underline">
                runklubinfo@gmail.com
              </a>
            </p>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-[#2e3d1a] flex flex-wrap gap-4 text-xs text-white/25">
          <Link href="/privacy" className="hover:text-white/50 transition">Privacy Policy</Link>
          <Link href="/community" className="hover:text-white/50 transition">Community Guidelines</Link>
        </div>

      </div>
    </div>
  )
}
