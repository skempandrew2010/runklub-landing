"use client"

import { useState } from "react"
import { Share2 } from "lucide-react"

export interface RunShareData {
  title: string
  date: string
  time: string
  distance?: string | null
  meeting_point?: string | null
  tags?: string[] | null
  clubName: string
  clubImageUrl?: string | null
}

function fmt12(t: string) {
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  })
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

async function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = src
  })
}

function drawInitials(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number, size: number, font: string) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  ctx.fillStyle = "#c5f135"
  ctx.font = `bold ${Math.round(size * 0.36)}px ${font}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(initials, cx, cy)
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
}

export async function generateRunCard(run: RunShareData): Promise<Blob> {
  const W = 1080
  const H = 1920
  const PAD = 88
  const LIME = "#c5f135"
  const FONT = "bold 1px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  const F = (size: number, weight = "bold") => `${weight} ${size}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!

  // ── BACKGROUND ────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W * 0.3, H)
  bg.addColorStop(0, "#131f0a")
  bg.addColorStop(0.45, "#0e1707")
  bg.addColorStop(1, "#080f04")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Lime radial bloom — upper right
  const bloom = ctx.createRadialGradient(W * 0.9, 0, 0, W * 0.9, 0, W * 0.85)
  bloom.addColorStop(0, "rgba(197,241,53,0.10)")
  bloom.addColorStop(1, "rgba(197,241,53,0)")
  ctx.fillStyle = bloom
  ctx.fillRect(0, 0, W, H)

  // ── DECORATIVE TRACK RINGS ─────────────────────────────────────────────────
  // Large oval rings suggest a running track
  ctx.save()
  ctx.translate(W * 0.78, H * 0.52)
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(197,241,53,${0.055 - i * 0.01})`
    ctx.lineWidth = i === 0 ? 2.5 : 1.5
    ctx.beginPath()
    ctx.ellipse(0, 0, 380 + i * 90, 520 + i * 110, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()

  // ── SUBTLE GRAIN ──────────────────────────────────────────────────────────
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(255,255,255,${(Math.random() * 0.016).toFixed(3)})`
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5)
  }

  // ── TOP ACCENT BAR ────────────────────────────────────────────────────────
  const topBar = ctx.createLinearGradient(0, 0, W, 0)
  topBar.addColorStop(0, LIME)
  topBar.addColorStop(0.55, "rgba(197,241,53,0.55)")
  topBar.addColorStop(1, "rgba(197,241,53,0.08)")
  ctx.fillStyle = topBar
  ctx.fillRect(0, 0, W, 14)

  // Left accent bar
  const leftBar = ctx.createLinearGradient(0, 14, 0, H * 0.52)
  leftBar.addColorStop(0, "rgba(197,241,53,0.7)")
  leftBar.addColorStop(1, "rgba(197,241,53,0)")
  ctx.fillStyle = leftBar
  ctx.fillRect(0, 14, 8, H * 0.52)

  // ── CLUB IDENTITY ─────────────────────────────────────────────────────────
  const AV = 116
  const ax = PAD, ay = 80
  const acx = ax + AV / 2, acy = ay + AV / 2

  // Avatar shadow
  ctx.save()
  ctx.shadowColor = "rgba(197,241,53,0.25)"
  ctx.shadowBlur = 28
  ctx.fillStyle = "#1c2d10"
  ctx.beginPath(); ctx.arc(acx, acy, AV / 2 + 2, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  // Avatar fill
  ctx.fillStyle = "#1e2d12"
  ctx.beginPath(); ctx.arc(acx, acy, AV / 2, 0, Math.PI * 2); ctx.fill()

  if (run.clubImageUrl) {
    const img = await loadImg(run.clubImageUrl)
    if (img) {
      ctx.save()
      ctx.beginPath(); ctx.arc(acx, acy, AV / 2, 0, Math.PI * 2); ctx.clip()
      ctx.drawImage(img, ax, ay, AV, AV)
      ctx.restore()
    } else {
      drawInitials(ctx, run.clubName, acx, acy, AV, F(42))
    }
  } else {
    drawInitials(ctx, run.clubName, acx, acy, AV, F(42))
  }

  // Lime ring around avatar
  ctx.strokeStyle = "rgba(197,241,53,0.4)"
  ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.arc(acx, acy, AV / 2 + 5, 0, Math.PI * 2); ctx.stroke()

  const nameX = ax + AV + 26
  ctx.fillStyle = "#ffffff"
  ctx.font = F(52)
  ctx.fillText(run.clubName, nameX, ay + 62)

  ctx.font = F(27, "600")
  ctx.fillStyle = "rgba(255,255,255,0.28)"
  ctx.fillText("RUN CLUB", nameX, ay + 102)

  // ── SECTION DIVIDER ───────────────────────────────────────────────────────
  const divGrad = ctx.createLinearGradient(PAD, 0, W - PAD, 0)
  divGrad.addColorStop(0, "rgba(197,241,53,0.45)")
  divGrad.addColorStop(0.35, "rgba(197,241,53,0.15)")
  divGrad.addColorStop(1, "rgba(197,241,53,0)")
  ctx.fillStyle = divGrad
  ctx.fillRect(PAD, 268, W - PAD * 2, 2)

  // ── EYEBROW LABEL ─────────────────────────────────────────────────────────
  let y = 344
  ctx.font = F(27)
  const eyebrowText = "UPCOMING RUN"
  const ew = ctx.measureText(eyebrowText).width + 44
  ctx.fillStyle = "rgba(197,241,53,0.14)"
  rrect(ctx, PAD, y - 30, ew, 50, 25); ctx.fill()
  ctx.strokeStyle = "rgba(197,241,53,0.3)"
  ctx.lineWidth = 1.5
  rrect(ctx, PAD, y - 30, ew, 50, 25); ctx.stroke()
  ctx.fillStyle = LIME
  ctx.fillText(eyebrowText, PAD + 22, y)

  // ── RUN TITLE ─────────────────────────────────────────────────────────────
  y += 120
  ctx.fillStyle = "#ffffff"
  ctx.font = F(106)
  const words = run.title.split(" ")
  const titleLines: string[] = []
  let cur = ""
  for (const w of words) {
    const test = cur + w + " "
    if (ctx.measureText(test).width > W - PAD * 2 && cur) {
      titleLines.push(cur.trim()); cur = w + " "
    } else { cur = test }
  }
  if (cur) titleLines.push(cur.trim())
  for (const line of titleLines.slice(0, 3)) {
    ctx.fillText(line, PAD, y)
    y += 122
  }

  // ── CONTENT DIVIDER ───────────────────────────────────────────────────────
  y += 44
  const div2 = ctx.createLinearGradient(PAD, 0, W - PAD, 0)
  div2.addColorStop(0, "rgba(255,255,255,0.12)")
  div2.addColorStop(0.5, "rgba(255,255,255,0.06)")
  div2.addColorStop(1, "rgba(255,255,255,0)")
  ctx.fillStyle = div2
  ctx.fillRect(PAD, y, W - PAD * 2, 1.5)

  // ── DATE PILL ─────────────────────────────────────────────────────────────
  y += 64
  const dateStr = fmtDate(run.date)
  ctx.font = F(44)
  const dpw = ctx.measureText(dateStr).width + 64
  ctx.fillStyle = "rgba(197,241,53,0.11)"
  rrect(ctx, PAD, y, dpw, 84, 42); ctx.fill()
  ctx.strokeStyle = "rgba(197,241,53,0.38)"
  ctx.lineWidth = 2.5
  rrect(ctx, PAD, y, dpw, 84, 42); ctx.stroke()
  ctx.fillStyle = LIME
  ctx.fillText(dateStr, PAD + 32, y + 56)

  // ── TIME + DISTANCE ───────────────────────────────────────────────────────
  y += 152
  ctx.font = F(68)
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  const timeStr = fmt12(run.time)
  ctx.fillText(timeStr, PAD, y)
  if (run.distance) {
    const tw = ctx.measureText(timeStr).width
    ctx.fillStyle = "rgba(197,241,53,0.5)"
    ctx.fillText("  ·  ", PAD + tw, y)
    ctx.fillStyle = "rgba(255,255,255,0.55)"
    const sw = ctx.measureText("  ·  ").width
    ctx.fillText(run.distance, PAD + tw + sw, y)
  }

  // ── MEETING POINT ─────────────────────────────────────────────────────────
  if (run.meeting_point) {
    y += 78
    ctx.font = F(40, "500")
    ctx.fillStyle = "rgba(255,255,255,0.36)"
    let mp = run.meeting_point
    while (ctx.measureText("📍  " + mp).width > W - PAD * 2 - 10) mp = mp.slice(0, -1)
    if (mp.length < run.meeting_point.length) mp += "…"
    ctx.fillText("📍  " + mp, PAD, y)
  }

  // ── TAGS ──────────────────────────────────────────────────────────────────
  if (run.tags && run.tags.length > 0) {
    y += 86
    let tx = PAD
    ctx.font = F(30)
    for (const tag of run.tags.slice(0, 4)) {
      const tw = ctx.measureText(tag).width + 48
      if (tx + tw > W - PAD) break
      ctx.fillStyle = "rgba(255,255,255,0.05)"
      rrect(ctx, tx, y - 34, tw, 58, 29); ctx.fill()
      ctx.strokeStyle = "rgba(255,255,255,0.13)"
      ctx.lineWidth = 1.5
      rrect(ctx, tx, y - 34, tw, 58, 29); ctx.stroke()
      ctx.fillStyle = "rgba(255,255,255,0.42)"
      ctx.fillText(tag, tx + 24, y)
      tx += tw + 14
    }
  }

  // ── LIME FOOTER BAND ──────────────────────────────────────────────────────
  const FH = 196
  const fy = H - FH

  ctx.fillStyle = LIME
  ctx.fillRect(0, fy, W, FH)

  // Subtle noise on lime
  ctx.save()
  ctx.globalAlpha = 0.06
  for (let i = 0; i < 2000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random()})`
    ctx.fillRect(Math.random() * W, fy + Math.random() * FH, 1.5, 1.5)
  }
  ctx.restore()

  // Footer wordmark
  ctx.fillStyle = "#1a2110"
  ctx.font = F(62)
  const rw = ctx.measureText("Run").width
  ctx.fillText("Run", PAD, fy + 88)
  ctx.font = F(62)
  ctx.fillStyle = "rgba(26,33,16,0.55)"
  ctx.fillText("Klub", PAD + rw, fy + 88)

  ctx.font = F(28, "500")
  ctx.fillStyle = "rgba(26,33,16,0.45)"
  ctx.fillText("runkub.com  ·  find your run crew", PAD, fy + 140)

  // Footer decorative circles
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = `rgba(26,33,16,${0.12 + i * 0.06})`
    ctx.beginPath()
    ctx.arc(W - PAD - i * 52, fy + FH / 2, 20 - i * 5, 0, Math.PI * 2)
    ctx.fill()
  }

  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Canvas export failed"))), "image/png")
  )
}

export default function ShareRunButton({ run }: { run: RunShareData }) {
  const [generating, setGenerating] = useState(false)

  const handleShare = async () => {
    setGenerating(true)
    try {
      const blob = await generateRunCard(run)
      const file = new File([blob], "run-card.png", { type: "image/png" })

      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: run.title,
          text: `${run.clubName} · ${fmtDate(run.date)} at ${fmt12(run.time)}`,
        })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${run.title.replace(/\s+/g, "-").toLowerCase()}-card.png`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <button
      onClick={handleShare}
      disabled={generating}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white/40 hover:text-[#c5f135] hover:bg-[#c5f135]/5 transition disabled:opacity-40"
      title="Share to Instagram Stories"
    >
      <Share2 className="w-3 h-3" />
      {generating ? "…" : "Share"}
    </button>
  )
}
