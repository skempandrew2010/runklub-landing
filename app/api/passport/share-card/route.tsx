import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"

// Node runtime (not Edge) so we can read the bundled Syne font files from
// disk instead of fetching them from Google Fonts on every render.
export const runtime = "nodejs"
// Content depends on searchParams, which Next.js won't key a static cache on
// by default — without this, every request returns whatever the first one rendered.
export const dynamic = "force-dynamic"

const WIDTH = 1080
const HEIGHT = 1920

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

const TIER_EMOJI: Record<string, string> = {
  local: "📍",
  regular: "🔁",
  explorer: "🧭",
  road_warrior: "✈️",
  cross_country: "🗺️",
  passport_holder: "🌍",
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type")
  const isComplete = type === "complete"
  const isTier = type === "tier"
  const clubName = searchParams.get("clubName") ?? "RunKlub"
  const cityName = searchParams.get("cityName") ?? ""
  const cityState = searchParams.get("cityState") ?? ""
  const stampNumber = searchParams.get("stampNumber") ?? "0"
  const totalCount = searchParams.get("totalCount") ?? "0"
  const stampUrl = searchParams.get("stampUrl")
  const tierSlug = searchParams.get("tierSlug") ?? ""
  const tierName = searchParams.get("tierName") ?? "Local"
  const citiesCount = searchParams.get("citiesCount") ?? "0"
  const statesCount = searchParams.get("statesCount") ?? "0"

  const [extraBold, semiBold] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/Syne-ExtraBold.ttf")),
    readFile(join(process.cwd(), "public/fonts/Syne-SemiBold.ttf")),
  ])

  const cityLabel = cityState ? `${cityName}, ${cityState}` : cityName
  const completeHeadline = `${cityLabel.toUpperCase()} COMPLETE`
  const stampHeadline = `STAMP #${stampNumber}`
  const stampedLine = `${totalCount}/${totalCount} klubs stamped`

  if (isTier) {
    return new ImageResponse(
      (
        <div
          style={{
            width: WIDTH,
            height: HEIGHT,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundImage:
              "radial-gradient(circle at 85% 8%, rgba(200,242,60,0.16) 0%, rgba(200,242,60,0) 42%), linear-gradient(160deg, #16210c 0%, #0e1707 45%, #080f04 100%)",
            position: "relative",
          }}
        >
          {/* top accent bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: WIDTH,
              height: 14,
              backgroundImage: "linear-gradient(90deg, #C8F23C 0%, rgba(200,242,60,0.5) 55%, rgba(200,242,60,0.05) 100%)",
              display: "flex",
            }}
          />

          {/* decorative rings, echoing a running track */}
          <div style={{ position: "absolute", right: -260, top: 260, width: 760, height: 1040, borderRadius: "50%", border: "2.5px solid rgba(200,242,60,0.07)", display: "flex" }} />
          <div style={{ position: "absolute", right: -350, top: 200, width: 940, height: 1160, borderRadius: "50%", border: "1.5px solid rgba(200,242,60,0.045)", display: "flex" }} />

          <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 600, fontSize: 32, color: "rgba(200,242,60,0.55)", letterSpacing: 6, marginBottom: 48 }}>
            RUNKLUB PASSPORT
          </div>

          {/* boarding-pass card */}
          <div
            style={{
              width: 900,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              backgroundColor: "rgba(21,26,13,0.92)",
              border: "3px solid rgba(200,242,60,0.4)",
              borderRadius: 44,
              paddingTop: 116,
              paddingBottom: 116,
              position: "relative",
              boxShadow: "0 40px 100px rgba(0,0,0,0.55)",
            }}
          >
            {/* perforation cutouts */}
            <div style={{ position: "absolute", left: -32, top: "50%", width: 64, height: 64, borderRadius: "50%", backgroundColor: "#080f04", display: "flex" }} />
            <div style={{ position: "absolute", right: -32, top: "50%", width: 64, height: 64, borderRadius: "50%", backgroundColor: "#080f04", display: "flex" }} />

            <div style={{ display: "flex", fontSize: 170 }}>{TIER_EMOJI[tierSlug] ?? "🧭"}</div>

            <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 600, fontSize: 36, color: "rgba(240,237,232,0.4)", marginTop: 52, letterSpacing: 4 }}>
              CURRENT TIER
            </div>
            <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 800, fontSize: 96, color: "#C8F23C", marginTop: 18 }}>
              {tierName}
            </div>

            <div style={{ display: "flex", width: "80%", height: 2, backgroundColor: "rgba(240,237,232,0.15)", marginTop: 72, marginBottom: 72 }} />

            <div style={{ display: "flex", width: "72%", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 800, fontSize: 70, color: "#F0EDE8" }}>{citiesCount}</div>
                <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 600, fontSize: 30, color: "rgba(240,237,232,0.4)", marginTop: 10 }}>CITIES</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 800, fontSize: 70, color: "#F0EDE8" }}>{statesCount}</div>
                <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 600, fontSize: 30, color: "rgba(240,237,232,0.4)", marginTop: 10 }}>STATES</div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 600, fontSize: 30, color: "rgba(240,237,232,0.35)", marginTop: 52 }}>
            Find Your People. Find Your Pace.
          </div>

          <div style={{ position: "absolute", bottom: 100, display: "flex", alignItems: "center" }}>
            <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 46, color: "#F0EDE8" }}>Run</span>
            <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 46, color: "#C8F23C" }}>Klub</span>
          </div>
        </div>
      ),
      {
        width: WIDTH,
        height: HEIGHT,
        fonts: [
          { name: "Syne", data: extraBold, weight: 800, style: "normal" },
          { name: "Syne", data: semiBold, weight: 600, style: "normal" },
        ],
      }
    )
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0D0D0D",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 420,
            height: 420,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "8px solid #C8F23C",
            backgroundColor: "#1a1a1a",
            overflow: "hidden",
          }}
        >
          {stampUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stampUrl} width={420} height={420} style={{ objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 800, fontSize: 140, color: "#F0EDE8" }}>
              {initialsOf(clubName)}
            </div>
          )}
        </div>

        <div
          style={{
            width: 900,
            marginTop: 72,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {isComplete ? (
            <div style={{ display: "flex", flexDirection: "column", width: "100%", alignItems: "center" }}>
              <div style={{ display: "flex", width: "100%", justifyContent: "center", textAlign: "center", fontFamily: "Syne", fontWeight: 800, fontSize: 72, color: "#C8F23C" }}>
                {completeHeadline}
              </div>
              <div style={{ display: "flex", width: "100%", justifyContent: "center", textAlign: "center", fontFamily: "Syne", fontWeight: 600, fontSize: 40, color: "#F0EDE8", marginTop: 28 }}>
                {stampedLine}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", width: "100%", alignItems: "center" }}>
              <div style={{ display: "flex", width: "100%", justifyContent: "center", textAlign: "center", fontFamily: "Syne", fontWeight: 800, fontSize: 100, color: "#F0EDE8" }}>
                {stampHeadline}
              </div>
              <div style={{ display: "flex", width: "100%", justifyContent: "center", textAlign: "center", fontFamily: "Syne", fontWeight: 600, fontSize: 44, color: "#C8F23C", marginTop: 24 }}>
                {clubName}
              </div>
              <div style={{ display: "flex", width: "100%", justifyContent: "center", textAlign: "center", fontFamily: "Syne", fontWeight: 600, fontSize: 32, color: "#F0EDE8", marginTop: 10 }}>
                {cityLabel}
              </div>
            </div>
          )}
        </div>

        <div style={{ position: "absolute", bottom: 110, display: "flex", alignItems: "center" }}>
          <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 46, color: "#F0EDE8" }}>Run</span>
          <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 46, color: "#C8F23C" }}>Klub</span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Syne", data: extraBold, weight: 800, style: "normal" },
        { name: "Syne", data: semiBold, weight: 600, style: "normal" },
      ],
    }
  )
}
