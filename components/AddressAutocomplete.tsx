"use client"

import { useEffect, useRef, useState } from "react"

export type AddressSuggestion = { placeName: string; lat: number; lng: number }

/** Debounced Mapbox place/address search-as-you-type, matching both named places (e.g. "Central Park") and street addresses. */
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  onSelect: (suggestion: AddressSuggestion) => void
  placeholder?: string
  className?: string
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const query = value.trim()
    if (query.length < 3) { setSuggestions([]); return }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&autocomplete=true&limit=5&types=poi,address`
        )
        const data = await res.json()
        setSuggestions(
          ((data.features ?? []) as any[]).map((f) => ({
            placeName: f.place_name as string,
            lat: f.center[1] as number,
            lng: f.center[0] as number,
          }))
        )
        setOpen(true)
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value])

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && (loading || suggestions.length > 0) && (
        <div className="absolute z-20 mt-1 w-full bg-[#1e2d12] border border-[#2e3d1a] rounded-xl overflow-hidden shadow-xl shadow-black/40 max-h-56 overflow-y-auto">
          {loading && suggestions.length === 0 && (
            <p className="px-3 py-2 text-xs text-white/40">Searching…</p>
          )}
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { onChange(s.placeName); onSelect(s); setSuggestions([]); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs text-white/80 hover:bg-[#c5f135]/10 hover:text-[#c5f135] transition border-b border-[#2e3d1a] last:border-b-0"
            >
              {s.placeName}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
