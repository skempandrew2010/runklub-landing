import { createClient } from "@supabase/supabase-js"
import { Syne, Epilogue, JetBrains_Mono } from "next/font/google"
import Link from "next/link"
import styles from "./landing.module.css"

const syne = Syne({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-syne" })
const epilogue = Epilogue({ subsets: ["latin"], weight: ["300", "400", "500"], style: ["normal", "italic"], variable: "--font-epilogue" })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jb-mono" })

async function getClubCount(): Promise<number> {
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { count } = await db
      .from("clubs")
      .select("*", { count: "exact", head: true })
      .eq("is_public", true)
    return count ?? 0
  } catch {
    return 0
  }
}

const CITIES = [
  "New York City", "London", "Tokyo", "Austin", "Amsterdam",
  "Los Angeles", "Copenhagen", "Chicago", "Berlin", "Miami",
  "Sydney", "Seoul", "Toronto", "Paris", "Barcelona",
]

export default async function LandingPage() {
  const clubCount = await getClubCount()
  const displayCount = clubCount > 0 ? `${clubCount}+` : "Growing"

  const wrapperClass = [
    styles.wrapper,
    syne.variable,
    epilogue.variable,
    jetbrainsMono.variable,
  ].join(" ")

  return (
    <div className={wrapperClass}>

      {/* NAV */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.logo}>
          Run<span className={styles.logoAccent}>Klub</span>
        </Link>
        <div className={styles.navRight}>
          <a href="https://instagram.com/runklubapp" className={styles.navLink} target="_blank" rel="noopener noreferrer">
            @runklubapp
          </a>
          <a href="#clubs" className={styles.navLink}>For clubs</a>
          <Link href="/login" className={styles.navCta}>Get Started</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className={styles.hero}>
        <div className={`${styles.bgOrb} ${styles.orb1}`} />
        <div className={`${styles.bgOrb} ${styles.orb2}`} />
        <div className={styles.heroGrain} />

        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <div className={styles.badgeDot} />
            Now live · Free for runners
          </div>

          <h1 className={styles.heroH1}>
            Run with<br />
            anyone,<br />
            <em>anywhere.</em>
          </h1>

          <div className={styles.heroBottom}>
            <p className={styles.heroSub}>
              Find verified run clubs in any city you travel to. Drop in as a visitor, keep your streak alive, and never run alone again.
            </p>

            <div className={styles.heroCtas}>
              <Link href="/login" className={styles.ctaPrimary}>
                Get Started →
              </Link>
              <Link href="/explore" className={styles.ctaSecondary}>
                Explore Clubs
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div className={styles.tickerWrap}>
        <div className={styles.ticker}>
          {CITIES.concat(CITIES).map((city, i) => (
            <div key={i} className={styles.tickerItem}>
              <span className={styles.tickerAccent}>✦</span>
              {city}
            </div>
          ))}
        </div>
      </div>

      {/* STATS */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statNum}>{displayCount}</div>
          <div className={styles.statLabel}>Run clubs on the platform</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>50+</div>
          <div className={styles.statLabel}>Cities represented</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>100%</div>
          <div className={styles.statLabel}>Verified clubs only</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>$0</div>
          <div className={styles.statLabel}>Always free for runners</div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div id="how">
        <div className={styles.section}>
          <div className={styles.sectionTag}>How it works</div>
          <h2 className={styles.sectionH2}>Three steps to<br />your next run.</h2>
          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepNum}>01</div>
              <div className={styles.stepIcon}>🗺️</div>
              <h3 className={styles.stepH3}>Search your city</h3>
              <p className={styles.stepP}>Browse verified run clubs on a map. Filter by pace, vibe, schedule, and where they grab coffee after. Works anywhere in the world.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNum}>02</div>
              <div className={styles.stepIcon}>👋</div>
              <h3 className={styles.stepH3}>Drop in as a visitor</h3>
              <p className={styles.stepP}>RSVP so the club knows you&apos;re coming. No awkward cold shows — they&apos;ll be expecting you and know you&apos;re visiting.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNum}>03</div>
              <div className={styles.stepIcon}>🏃</div>
              <h3 className={styles.stepH3}>Run. Connect. Repeat.</h3>
              <p className={styles.stepP}>Show up, run with locals, grab coffee after. The best way to actually experience a city — on foot, with people who live there.</p>
            </div>
          </div>
        </div>
      </div>

      {/* FOR CLUBS */}
      <div className={styles.clubsSection} id="clubs">
        <div className={styles.clubsInner}>
          <div>
            <div className={styles.sectionTag}>For club organizers</div>
            <h2 className={styles.clubsH2}>Grow your Klub.<br />Get verified.</h2>
            <p className={styles.clubsP}>
              RunKlub gives your club global visibility. Traveling runners are actively searching for you — we make sure they find you, and trust you enough to show up.
            </p>
            <Link href="/login" className={styles.listBtn}>List Your Club →</Link>
          </div>
          <div className={styles.perks}>
            <div className={styles.perk}>
              <div className={styles.perkIcon}>✓</div>
              <div>
                <h4 className={styles.perkH4}>Verified badge</h4>
                <p className={styles.perkP}>One-time verification proves you&apos;re legit to visiting runners worldwide.</p>
              </div>
            </div>
            <div className={styles.perk}>
              <div className={styles.perkIcon}>📍</div>
              <div>
                <h4 className={styles.perkH4}>Map placement</h4>
                <p className={styles.perkP}>Show up the moment a traveler searches your city. Free for basic listings.</p>
              </div>
            </div>
            <div className={styles.perk}>
              <div className={styles.perkIcon}>📊</div>
              <div>
                <h4 className={styles.perkH4}>Drop-in analytics</h4>
                <p className={styles.perkP}>See who&apos;s planning to visit and grow your community with incoming runners.</p>
              </div>
            </div>
            <div className={styles.perk}>
              <div className={styles.perkIcon}>🤝</div>
              <div>
                <h4 className={styles.perkH4}>Brand partnerships</h4>
                <p className={styles.perkP}>Verified clubs get first access to gear deals and sponsorship opportunities.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PRICING */}
      <div className={styles.section}>
        <div className={styles.sectionTag}>Pricing</div>
        <h2 className={styles.sectionH2}>Simple pricing<br />for clubs.</h2>
        <div className={styles.pricingGrid}>
          <div className={styles.priceCard}>
            <div className={styles.priceTag}>Free</div>
            <div className={styles.priceAmount}>$0</div>
            <div className={styles.pricePeriod}>forever</div>
            <ul className={styles.priceFeatures}>
              <li className={styles.priceFeature}>Basic club listing</li>
              <li className={styles.priceFeature}>City &amp; schedule info</li>
              <li className={styles.priceFeature}>Map placement</li>
              <li className={styles.priceFeature}>Drop-in RSVPs</li>
            </ul>
            <Link href="/login" className={styles.priceBtnInner}>Get Listed Free</Link>
          </div>
          <div className={`${styles.priceCard} ${styles.priceCardFeatured}`}>
            <div className={styles.priceTag}>Verified</div>
            <div className={styles.priceAmount}>$49</div>
            <div className={styles.pricePeriod}>one-time · lifetime</div>
            <ul className={styles.priceFeatures}>
              <li className={styles.priceFeature}>Everything in Free</li>
              <li className={styles.priceFeature}>Verified badge on listing</li>
              <li className={styles.priceFeature}>Priority map placement</li>
              <li className={styles.priceFeature}>Visitor messaging</li>
              <li className={styles.priceFeature}>Drop-in analytics</li>
            </ul>
            <Link href="/login" className={styles.priceBtnInner}>Get Verified</Link>
          </div>
          <div className={styles.priceCard}>
            <div className={styles.priceTag}>Pro</div>
            <div className={styles.priceAmount}>$99</div>
            <div className={styles.pricePeriod}>per year</div>
            <ul className={styles.priceFeatures}>
              <li className={styles.priceFeature}>Everything in Verified</li>
              <li className={styles.priceFeature}>Featured city placement</li>
              <li className={styles.priceFeature}>Brand partnership access</li>
              <li className={styles.priceFeature}>Custom club profile</li>
              <li className={styles.priceFeature}>Social media kit</li>
            </ul>
            <Link href="/login" className={styles.priceBtnInner}>Go Pro</Link>
          </div>
        </div>
      </div>

      {/* CITIES */}
      <div className={styles.citiesSection}>
        <div className={styles.citiesLabel}>Run clubs in cities worldwide</div>
        <div className={styles.citiesScroll}>
          {CITIES.concat(CITIES).map((city, i) => (
            <div key={i} className={`${styles.cityPill} ${i % 3 === 0 ? styles.cityPillActive : ""}`}>
              {city}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className={styles.ctaSection}>
        <div className={styles.ctaBg} />
        <h2 className={styles.ctaH2}>
          Your next city.<br />
          <em>Your next run.</em>
        </h2>
        <p className={styles.ctaP}>
          Join RunKlub and find your people in any city. Free for runners, always.
        </p>
        <div className={styles.ctaButtons}>
          <Link href="/login" className={styles.ctaPrimary}>
            Get Started Free →
          </Link>
          <Link href="/explore" className={styles.ctaSecondary}>
            Browse Clubs
          </Link>
        </div>
      </div>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <div className={styles.footerLogo}>
          Run<span className={styles.logoAccent}>Klub</span>
        </div>
        <p className={styles.footerP}>© {new Date().getFullYear()} RunKlub · runklub.fit · @runklubapp</p>
      </footer>

    </div>
  )
}
