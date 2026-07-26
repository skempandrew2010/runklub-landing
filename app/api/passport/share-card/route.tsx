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
            backgroundColor: "#0D0D0D",
            position: "relative",
          }}
        >
          {/* boarding-pass card */}
          <div
            style={{
              width: 860,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              backgroundColor: "#151a0d",
              border: "3px solid rgba(200,242,60,0.35)",
              borderRadius: 40,
              paddingTop: 96,
              paddingBottom: 96,
              position: "relative",
            }}
          >
            {/* perforation cutouts */}
            <div style={{ position: "absolute", left: -30, top: "50%", width: 60, height: 60, borderRadius: "50%", backgroundColor: "#0D0D0D", display: "flex" }} />
            <div style={{ position: "absolute", right: -30, top: "50%", width: 60, height: 60, borderRadius: "50%", backgroundColor: "#0D0D0D", display: "flex" }} />

            <div style={{ display: "flex", fontSize: 150 }}>{TIER_EMOJI[tierSlug] ?? "🧭"}</div>

            <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 600, fontSize: 34, color: "rgba(240,237,232,0.4)", marginTop: 44, letterSpacing: 4 }}>
              CURRENT TIER
            </div>
            <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 800, fontSize: 88, color: "#C8F23C", marginTop: 16 }}>
              {tierName}
            </div>

            <div style={{ display: "flex", width: "80%", height: 2, backgroundColor: "rgba(240,237,232,0.15)", marginTop: 64, marginBottom: 64 }} />

            <div style={{ display: "flex", width: "72%", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 800, fontSize: 64, color: "#F0EDE8" }}>{citiesCount}</div>
                <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 600, fontSize: 28, color: "rgba(240,237,232,0.4)", marginTop: 8 }}>CITIES</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 800, fontSize: 64, color: "#F0EDE8" }}>{statesCount}</div>
                <div style={{ display: "flex", fontFamily: "Syne", fontWeight: 600, fontSize: 28, color: "rgba(240,237,232,0.4)", marginTop: 8 }}>STATES</div>
              </div>
            </div>
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
