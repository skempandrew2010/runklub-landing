import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "RunKlub — Find Your People. Find Your Pace."
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#1a2110",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Radial glow */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "700px",
            height: "700px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(197,241,53,0.10) 0%, transparent 65%)",
          }}
        />

        {/* Logo pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#c5f135",
            borderRadius: "24px",
            padding: "14px 32px",
            marginBottom: "32px",
          }}
        >
          <span
            style={{
              fontSize: "52px",
              fontWeight: "900",
              color: "#1a2110",
              letterSpacing: "-1px",
            }}
          >
            RunKlub
          </span>
        </div>

        {/* Tagline */}
        <p
          style={{
            fontSize: "30px",
            color: "rgba(255,255,255,0.60)",
            margin: "0",
            fontWeight: "500",
            letterSpacing: "0.2px",
          }}
        >
          Find Your People. Find Your Pace.
        </p>

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: "44px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#c5f135",
            }}
          />
          <span
            style={{
              color: "rgba(197,241,53,0.70)",
              fontSize: "22px",
              fontWeight: "600",
              letterSpacing: "0.5px",
            }}
          >
            runklub.fit
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
