import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-black text-white">Privacy Policy</h1>
          <p className="text-sm text-white/35 mt-2">Last updated: May 2026</p>
        </div>

        <div className="space-y-8 text-sm text-white/60 leading-relaxed">

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">1. What We Collect</h2>
            <p>When you use RunKlub, we may collect the following information:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><span className="text-white/80 font-medium">Account information</span> — your email address and display name when you sign up</li>
              <li><span className="text-white/80 font-medium">Profile data</span> — optional avatar image and any profile details you choose to add</li>
              <li><span className="text-white/80 font-medium">Club and run data</span> — club names, descriptions, meeting locations, run events, and related content you create</li>
              <li><span className="text-white/80 font-medium">Location data</span> — city or address you provide when creating a club or run, used to place pins on our map. We do not collect your device's live GPS location.</li>
              <li><span className="text-white/80 font-medium">Usage data</span> — basic analytics such as pages visited, to help us improve the Service</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">2. How We Use Your Data</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Operate and provide the RunKlub platform</li>
              <li>Display your club and run listings to other users</li>
              <li>Send transactional emails (e.g. email newsletters sent to club members by club managers, when opted in)</li>
              <li>Improve and debug the Service</li>
              <li>Respond to support requests</li>
            </ul>
            <p>We do not sell your personal data to third parties. We do not use your data for advertising purposes.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">3. Third-Party Services</h2>
            <p>RunKlub relies on the following third-party services to operate:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><span className="text-white/80 font-medium">Supabase</span> — our database and authentication provider. Your account and app data is stored on Supabase infrastructure. See <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#c5f135] hover:underline">supabase.com/privacy</a>.</li>
              <li><span className="text-white/80 font-medium">Mapbox</span> — used to render our interactive map and geocode addresses. Location queries you make may be processed by Mapbox. See <a href="https://www.mapbox.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-[#c5f135] hover:underline">mapbox.com/legal/privacy</a>.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">4. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active. If you delete your account,
              we will remove your personal data from our systems within a reasonable period, except where
              retention is required by law or for legitimate business purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">5. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Access the personal data we hold about you</li>
              <li>Correct inaccurate information</li>
              <li>Request deletion of your account and associated data</li>
              <li>Opt out of non-essential communications</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:runklubinfo@gmail.com" className="text-[#c5f135] hover:underline">
                runklubinfo@gmail.com
              </a>
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">6. Cookies</h2>
            <p>
              RunKlub uses minimal cookies strictly necessary for authentication and session management.
              We do not use tracking or advertising cookies.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">7. Children</h2>
            <p>
              RunKlub is not directed at children under 13. We do not knowingly collect personal
              information from anyone under 13. If you believe a child has provided us with personal
              data, please contact us and we will promptly delete it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify users of material
              changes by updating the date at the top of this page. Continued use of the Service
              after changes means you accept the updated policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">9. Contact</h2>
            <p>
              Privacy questions or requests can be sent to{" "}
              <a href="mailto:runklubinfo@gmail.com" className="text-[#c5f135] hover:underline">
                runklubinfo@gmail.com
              </a>
            </p>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-[#2e3d1a] flex flex-wrap gap-4 text-xs text-white/25">
          <Link href="/terms" className="hover:text-white/50 transition">Terms of Service</Link>
          <Link href="/community" className="hover:text-white/50 transition">Community Guidelines</Link>
        </div>

      </div>
    </div>
  )
}
