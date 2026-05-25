"use client"

import { useState, useEffect, useRef } from "react"
import { Search, X } from "lucide-react"
import mapboxSdk from "@mapbox/mapbox-sdk/services/geocoding"

const geocodingClient = mapboxSdk({ accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN! })

type Suggestion = { place_name: string; text: string }

type SearchBarProps = {
  city: string
  setCity: (city: string) => void
  onSearch: () => void
}

export default function SearchBar({ city, setCity, onSearch }: SearchBarProps) {
  const [inputValue, setInputValue] = useState(city)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync if parent clears the city externally
  useEffect(() => {
    if (!city) setInputValue("")
  }, [city])

  // Debounced autocomplete
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (inputValue.trim().length < 2) { setSuggestions([]); setOpen(false); return }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await geocodingClient
          .forwardGeocode({ query: inputValue, limit: 5, types: ["place", "district", "region"] as any })
          .send()
        const features: Suggestion[] = res.body.features.map((f: any) => ({
          place_name: f.place_name,
          text: f.text,
        }))
        setSuggestions(features)
        setOpen(features.length > 0)
      } catch {}
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [inputValue])

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

  const select = (s: Suggestion) => {
    setInputValue(s.place_name)
    setCity(s.place_name)
    setSuggestions([])
    setOpen(false)
    onSearch()
  }

  const clear = () => {
    setInputValue("")
    setCity("")
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none z-10" />
      <input
        type="text"
        value={inputValue}
        onChange={(e) => { setInputValue(e.target.value); setCity(e.target.value) }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setOpen(false); onSearch() }
          if (e.key === "Escape") { setOpen(false) }
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder="Search by city..."
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

      {open && suggestions.length > 0 && (
        <div className="absolute top-full mt-1.5 left-0 right-0 bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl overflow-hidden shadow-xl shadow-black/60 z-50">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onMouseDown={(e) => { e.preventDefault(); select(s) }}
              className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 text-sm text-white/75 hover:bg-[#2e3d1a] hover:text-white transition"
            >
              <Search className="w-3.5 h-3.5 text-[#c5f135]/50 shrink-0" />
              <span className="truncate">{s.place_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
