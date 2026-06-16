"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Search, X } from "lucide-react"
import Image from "next/image"

type Suggestion = { place_name: string; text: string }
type ClubResult = { id: string; name: string; city: string | null; image_url?: string | null }

type SearchBarProps = {
  city: string
  setCity: (city: string) => void
  onSearch: () => void
  clubs?: ClubResult[]
  onSelectClub?: (clubId: string) => void
}

const GRADIENTS = [
  "from-[#2d5a1b] to-[#111a0a]",
  "from-[#1b3d5a] to-[#111a0a]",
  "from-[#5a3d1b] to-[#111a0a]",
  "from-[#3d1b5a] to-[#111a0a]",
  "from-[#1b5a3d] to-[#111a0a]",
  "from-[#5a2b1b] to-[#111a0a]",
]
function getGradient(name: string) {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return GRADIENTS[hash % GRADIENTS.length]
}

export default function SearchBar({ city, setCity, onSearch, clubs, onSelectClub }: SearchBarProps) {
  const [inputValue, setInputValue] = useState(city)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const geocoderRef = useRef<any>(null)

  // Sync if parent clears the city externally
  useEffect(() => {
    if (!city) setInputValue("")
  }, [city])

  // Filter clubs by name
  const matchingClubs = useMemo(() => {
    if (!clubs || inputValue.trim().length < 2) return []
    const q = inputValue.toLowerCase()
    return clubs.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 4)
  }, [clubs, inputValue])

  // Debounced city autocomplete
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (inputValue.trim().length < 2) { setSuggestions([]); setOpen(matchingClubs.length > 0); return }

    debounceRef.current = setTimeout(async () => {
      try {
        if (!geocoderRef.current) {
          const sdk = (await import("@mapbox/mapbox-sdk/services/geocoding")).default
          geocoderRef.current = sdk({ accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN! })
        }
        const res = await geocoderRef.current
          .forwardGeocode({ query: inputValue, limit: 5, types: ["place", "district", "region"] as any })
          .send()
        const features: Suggestion[] = res.body.features.map((f: any) => ({
          place_name: f.place_name,
          text: f.text,
        }))
        setSuggestions(features)
        setOpen(features.length > 0 || matchingClubs.length > 0)
      } catch {}
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [inputValue, matchingClubs.length])

  // Update open state when matchingClubs changes
  useEffect(() => {
    if (inputValue.trim().length >= 2) {
      setOpen(matchingClubs.length > 0 || suggestions.length > 0)
    }
  }, [matchingClubs.length, suggestions.length, inputValue])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const selectCity = (s: Suggestion) => {
    setInputValue(s.place_name)
    setCity(s.place_name)
    setSuggestions([])
    setOpen(false)
    onSearch()
  }

  const selectClub = (club: ClubResult) => {
    setInputValue("")
    setSuggestions([])
    setOpen(false)
    onSelectClub?.(club.id)
  }

  const clear = () => {
    setInputValue("")
    setCity("")
    setSuggestions([])
    setOpen(false)
  }

  const hasResults = matchingClubs.length > 0 || suggestions.length > 0

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none z-10" />
      <input
        type="text"
        value={inputValue}
        onChange={(e) => { setInputValue(e.target.value) }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setCity(inputValue); setOpen(false); onSearch() }
          if (e.key === "Escape") { setOpen(false) }
        }}
        onFocus={() => hasResults && setOpen(true)}
        placeholder="Search clubs or cities..."
        className="w-full pl-10 pr-8 py-2.5 bg-[#222d14] border border-[#2e3d1a] rounded-full text-white placeholder-white/40 text-sm focus:outline-none focus:border-[#c5f135]/60 focus:ring-1 focus:ring-[#c5f135]/30 transition"
      />
      {inputValue && (
        <button
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {open && hasResults && (
        <div className="absolute top-full mt-1.5 left-0 right-0 bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl overflow-hidden shadow-xl shadow-black/60 z-50">

          {/* Club results */}
          {matchingClubs.length > 0 && (
            <>
              <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-white/30 uppercase tracking-widest">Clubs</p>
              {matchingClubs.map((club) => {
                const initials = club.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
                const gradient = getGradient(club.name)
                return (
                  <button
                    key={club.id}
                    onMouseDown={(e) => { e.preventDefault(); selectClub(club) }}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-[#2e3d1a] transition"
                  >
                    <div className={`w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                      {club.image_url ? (
                        <Image src={club.image_url} alt={club.name} width={28} height={28} className="object-cover w-full h-full" />
                      ) : (
                        <span className="text-[9px] font-black text-white/30">{initials}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white font-semibold truncate">{club.name}</p>
                      {club.city && <p className="text-xs text-white/40 truncate">{club.city}</p>}
                    </div>
                  </button>
                )
              })}
            </>
          )}

          {/* City results */}
          {suggestions.length > 0 && (
            <>
              {matchingClubs.length > 0 && <div className="mx-4 my-1 border-t border-[#2e3d1a]" />}
              <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-white/30 uppercase tracking-widest">Cities</p>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onMouseDown={(e) => { e.preventDefault(); selectCity(s) }}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 text-sm text-white/75 hover:bg-[#2e3d1a] hover:text-white transition"
                >
                  <Search className="w-3.5 h-3.5 text-[#c5f135]/50 shrink-0" />
                  <span className="truncate">{s.place_name}</span>
                </button>
              ))}
            </>
          )}

          <div className="h-1" />
        </div>
      )}
    </div>
  )
}
