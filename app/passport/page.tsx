"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Stamp, Flame, MapPin, Users2, CalendarCheck } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  getPassportData,
  computeCheckinStreak,
  type CityRow,
  type CityCheckIn,
  type ClubCheckIn,
} from "@/lib/checkins"

const GRADIENTS = [
  "from-[#2d5a1b] to-[#111a0a]", "from-[#1b3d5a] to-[#111a0a]",
  "from-[#5a3d1b] to-[#111a0a]", "from-[#3d1b5a] to-[#111a0a]",
  "from-[#1b5a3d] to-[#111a0a]", "from-[#5a2b1b] to-[#111a0a]",
]
function getGradient(name: string) {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return GRADIENTS[hash % GRADIENTS.length]
}

function cityAbbr(name: string) {
  const words = name.split(" ").filter(Boolean)
  if (words.length > 1) return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function clubAbbr(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

type JustUnlocked = { clubIds: string[]; cityIds: string[] }

const CITY_PREVIEW_COUNT = 9

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="flex-1 bg-[#0e150a] rounded-xl px-3 py-3 text-center border border-[#2e3d1a] min-w-0">
      <div className="flex items-center justify-center gap-1 text-[#c5f135]">{icon}</div>
      <p className="text-xl font-black text-white leading-none mt-1">{value}</p>
      <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1 truncate">{label}</p>
    </div>
  )
}

function PassportSummary({
  streak,
  stampedCityCount,
  totalCityCount,
  clubCount,
  totalCheckins,
}: {
  streak: number
  stampedCityCount: number
  totalCityCount: number
  clubCount: number
  totalCheckins: number
}) {
  return (
    <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4 mb-6">
      <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3">Your Stats</p>
      <div className="flex gap-3">
        <StatTile icon={<Flame className="w-3 h-3" />} value={streak} label={streak === 1 ? "Day Streak" : "Day Streak"} />
        <StatTile icon={<MapPin className="w-3 h-3" />} value={`${stampedCityCount}/${totalCityCount}`} label="Cities" />
        <StatTile icon={<Users2 className="w-3 h-3" />} value={clubCount} label="Klubs" />
        <StatTile icon={<CalendarCheck className="w-3 h-3" />} value={totalCheckins} label="Check-Ins" />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-[#2e3d1a]">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-gradient-to-br from-[#2d5a1b] to-[#111a0a] border border-[#3d5220] shrink-0" />
          <span className="text-[10px] text-white/40">Stamped</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border border-dashed border-white/20 shrink-0" />
          <span className="text-[10px] text-white/40">Not visited</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#c5f135] shrink-0" />
          <span className="text-[10px] text-white/40">Newly unlocked</span>
        </div>
      </div>
    </div>
  )
}

function CityStamp({
  city,
  checkIn,
  isNew,
}: {
  city: CityRow
  checkIn: CityCheckIn | undefined
  isNew: boolean
}) {
  const stamped = !!checkIn
  const gradient = getGradient(city.name)

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="relative">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center border-2 shadow-lg shadow-black/30 transition-all duration-300 ${
            stamped
              ? `bg-gradient-to-br ${gradient} border-[#3d5220] hover:scale-105`
              : "border-dashed border-white/15 bg-transparent opacity-40"
          } ${isNew ? "ring-2 ring-[#c5f135] animate-pulse" : ""}`}
        >
          {city.flag_asset_url ? (
            <img src={city.flag_asset_url} alt="" className="w-full h-full object-cover rounded-full" />
          ) : (
            <span className={`text-xl font-black ${stamped ? "text-white/80" : "text-white/25"}`}>
              {cityAbbr(city.name)}
            </span>
          )}
        </div>
        {isNew && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110] text-[8px] font-black tracking-wide">
            NEW
          </span>
        )}
      </div>
      <div>
        <p className={`text-xs font-bold leading-tight ${stamped ? "text-white" : "text-white/30"}`}>
          {city.name}{city.state ? `, ${city.state}` : ""}
        </p>
        {stamped && checkIn && (
          <p className="text-[10px] text-white/35 mt-0.5">
            {checkIn.checkin_count} visit{checkIn.checkin_count === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </div>
  )
}

function ClubStamp({ checkIn, isNew }: { checkIn: ClubCheckIn; isNew: boolean }) {
  const clubName = checkIn.clubs?.name ?? "Klub"
  const imageUrl = checkIn.clubs?.image_url
  const gradient = getGradient(clubName)

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="relative">
        <div
          className={`w-20 h-20 rounded-full overflow-hidden flex items-center justify-center border-2 border-[#3d5220] shadow-lg shadow-black/30 transition-transform duration-300 hover:scale-105 bg-gradient-to-br ${gradient} ${
            isNew ? "ring-2 ring-[#c5f135] animate-pulse" : ""
          }`}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-black text-white/80">{clubAbbr(clubName)}</span>
          )}
        </div>
        {isNew && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-[#c5f135] text-[#1a2110] text-[8px] font-black tracking-wide">
            NEW
          </span>
        )}
      </div>
      <div>
        <p className="text-xs font-bold leading-tight text-white line-clamp-2">{clubName}</p>
        <p className="text-[10px] text-white/35 mt-0.5">
          {checkIn.checkin_count} visit{checkIn.checkin_count === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  )
}

export default function PassportPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [cities, setCities] = useState<CityRow[]>([])
  const [cityCheckIns, setCityCheckIns] = useState<CityCheckIn[]>([])
  const [clubCheckIns, setClubCheckIns] = useState<ClubCheckIn[]>([])
  const [checkinDates, setCheckinDates] = useState<string[]>([])
  const [totalCheckins, setTotalCheckins] = useState(0)
  const [justUnlocked, setJustUnlocked] = useState<JustUnlocked>({ clubIds: [], cityIds: [] })
  const [loading, setLoading] = useState(true)
  const [showAllCities, setShowAllCities] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Passport is member-only — directors manage klubs from their Director dashboard
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
        if (profile?.role === "manager") { router.replace("/today"); return }
      }
      setUserId(user?.id ?? null)
      if (user) {
        const data = await getPassportData()
        setCities(data.cities)
        setCityCheckIns(data.cityCheckIns)
        setClubCheckIns(data.clubCheckIns)
        setCheckinDates(data.checkinDates)
        setTotalCheckins(data.totalCheckins)

        try {
          const raw = sessionStorage.getItem("runklub_just_unlocked")
          if (raw) {
            setJustUnlocked(JSON.parse(raw))
            sessionStorage.removeItem("runklub_just_unlocked")
          }
        } catch { /* sessionStorage unavailable — unlock animation is a nice-to-have */ }
      }
      setLoading(false)
    }
    load()
  }, [])

  const streak = useMemo(() => computeCheckinStreak(checkinDates), [checkinDates])

  const cityCheckInById = new Map(cityCheckIns.map((c) => [c.city_id, c]))

  const stampedCities = cities
    .filter((c) => cityCheckInById.has(c.id))
    .sort((a, b) => {
      const aCheckIn = cityCheckInById.get(a.id)!
      const bCheckIn = cityCheckInById.get(b.id)!
      if (bCheckIn.checkin_count !== aCheckIn.checkin_count) return bCheckIn.checkin_count - aCheckIn.checkin_count
      return bCheckIn.first_checkin_at.localeCompare(aCheckIn.first_checkin_at)
    })
  const unstampedCities = cities
    .filter((c) => !cityCheckInById.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  const visibleCities = showAllCities ? [...stampedCities, ...unstampedCities] : stampedCities.slice(0, CITY_PREVIEW_COUNT)
  const hasMoreCities = !showAllCities && (stampedCities.length > CITY_PREVIEW_COUNT || unstampedCities.length > 0)

  const clubStamps = [...clubCheckIns].sort((a, b) => {
    if (b.checkin_count !== a.checkin_count) return b.checkin_count - a.checkin_count
    return b.first_checkin_at.localeCompare(a.first_checkin_at)
  })

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-[#c5f135]/10 border border-[#c5f135]/25 flex items-center justify-center shrink-0">
            <Stamp className="w-4 h-4 text-[#c5f135]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white leading-tight">Passport</h1>
            <p className="text-xs text-white/40 mt-0.5">
              {stampedCities.length} of {cities.length} cities · {clubCheckIns.length} klub{clubCheckIns.length === 1 ? "" : "s"} stamped
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
          </div>
        ) : !userId ? (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-6 text-center">
            <p className="text-white font-bold text-sm mb-1">Sign in to see your Passport</p>
            <p className="text-white/40 text-xs mb-4">Check in at klubs to start collecting stamps.</p>
            <button
              onClick={() => router.push("/login")}
              className="px-6 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
            >
              Log In
            </button>
          </div>
        ) : cities.length === 0 ? (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center">
            <Stamp className="w-10 h-10 text-white/15 mx-auto mb-3" />
            <p className="text-white font-bold text-sm mb-1">No stamps yet</p>
            <p className="text-white/40 text-xs mb-4">Check in at a klub to collect your first stamp.</p>
            <Link
              href="/explore"
              className="inline-block px-6 py-2.5 bg-[#c5f135] text-[#1a2110] text-sm font-black rounded-full hover:bg-[#d4ff45] transition"
            >
              Discover Klubs
            </Link>
          </div>
        ) : (
          <>
            <PassportSummary
              streak={streak}
              stampedCityCount={stampedCities.length}
              totalCityCount={cities.length}
              clubCount={clubCheckIns.length}
              totalCheckins={totalCheckins}
            />

            {/* ── CITIES ── */}
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-5 rounded-full bg-[#c5f135] shrink-0" />
                <h2 className="text-sm font-black text-white tracking-tight">Cities</h2>
                <div className="flex-1 h-px bg-[#2e3d1a]" />
                {(hasMoreCities || showAllCities) && (
                  <button
                    onClick={() => setShowAllCities((v) => !v)}
                    className="text-[10px] font-bold text-[#c5f135] hover:text-[#d4ff45] transition uppercase tracking-widest shrink-0"
                  >
                    {showAllCities ? "Show top 9" : `Show all ${cities.length}`}
                  </button>
                )}
              </div>
              {stampedCities.length === 0 ? (
                <p className="text-white/30 text-xs">No city stamps yet — check in at a klub to earn one.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-6">
                  {visibleCities.map((city) => (
                    <CityStamp
                      key={city.id}
                      city={city}
                      checkIn={cityCheckInById.get(city.id)}
                      isNew={justUnlocked.cityIds.includes(city.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ── KLUB CHECK-INS ── */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-5 rounded-full bg-[#c5f135] shrink-0" />
                <h2 className="text-sm font-black text-white tracking-tight">Klub Check-Ins</h2>
                <div className="flex-1 h-px bg-[#2e3d1a]" />
              </div>
              {clubStamps.length === 0 ? (
                <p className="text-white/30 text-xs">No klub check-ins yet.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-6">
                  {clubStamps.map((cs) => (
                    <ClubStamp key={cs.club_id} checkIn={cs} isNew={justUnlocked.clubIds.includes(cs.club_id)} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
