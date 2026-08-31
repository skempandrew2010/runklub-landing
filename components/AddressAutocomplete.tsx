"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { usePopoverPosition } from "./usePopoverPosition"

export type AddressSuggestion = { placeName: string; lat: number; lng: number }

type Suggestion = { mapboxId: string; name: string; fullAddress: string }

function newSessionToken() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

/**
 * Debounced search-as-you-type against Mapbox's Search Box API, matching both named
 * places (e.g. "Tom Watson Park") and street addresses - its POI dataset is far more
 * complete than the classic Geocoding API for smaller local landmarks and parks.
 * The suggestion list is portaled to document.body and fixed-positioned so it never
 * gets clipped by an ancestor's overflow-hidden/overflow-y-auto (e.g. a rounded card).
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  proximity,
}: {
  value: string
  onChange: (value: string) => void
  onSelect: (suggestion: AddressSuggestion) => void
  placeholder?: string
  className?: string
  /** Biases suggestions toward this point (e.g. the klub's home city) instead of searching the whole world. */
  proximity?: { lat: number; lng: number } | null
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { triggerRef, rect } = usePopoverPosition(open)
  const sessionTokenRef = useRef(newSessionToken())

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open, triggerRef])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const query = value.trim()
    if (query.length < 3) { setSuggestions([]); return }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        const proximityParam = proximity ? `&proximity=${proximity.lng},${proximity.lat}` : ""
        const res = await fetch(
          `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(query)}&access_token=${token}&session_token=${sessionTokenRef.current}&types=poi,address&limit=5${proximityParam}`
        )
        const data = await res.json()
        setSuggestions(
          ((data.suggestions ?? []) as any[]).map((s) => ({
            mapboxId: s.mapbox_id as string,
            name: s.name as string,
            fullAddress: (s.full_address ?? s.place_formatted ?? s.name) as string,
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
  }, [value, proximity])

  const pick = async (s: Suggestion) => {
    onChange(s.fullAddress)
    setSuggestions([])
    setOpen(false)
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      const res = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/retrieve/${s.mapboxId}?access_token=${token}&session_token=${sessionTokenRef.current}`
      )
      const data = await res.json()
      const coords = data.features?.[0]?.geometry?.coordinates
      if (coords) onSelect({ placeName: s.fullAddress, lat: coords[1], lng: coords[0] })
    } catch { /* the text field is still filled in even if coordinates fail to resolve */ }
    // Mapbox bills per search "session" (suggest calls + one retrieve) - start a fresh one for the next search.
    sessionTokenRef.current = newSessionToken()
  }

  return (
    <div ref={triggerRef} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && rect && (loading || suggestions.length > 0) && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            left: rect.left,
            width: rect.width,
            top: rect.bottom + 4,
          }}
          className="z-50 bg-[#1e2d12] border border-[#2e3d1a] rounded-xl overflow-hidden shadow-xl shadow-black/40 max-h-56 overflow-y-auto"
        >
          {loading && suggestions.length === 0 && (
            <p className="px-3 py-2 text-xs text-white/40">Searching…</p>
          )}
          {suggestions.map((s) => (
            <button
              key={s.mapboxId}
              type="button"
              onClick={() => pick(s)}
              className="w-full text-left px-3 py-2 text-xs text-white/80 hover:bg-[#c5f135]/10 hover:text-[#c5f135] transition border-b border-[#2e3d1a] last:border-b-0"
            >
              <span className="font-semibold">{s.name}</span>
              {s.fullAddress !== s.name && <span className="block text-white/40 text-[10px] mt-0.5">{s.fullAddress}</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
