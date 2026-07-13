import type { Location } from "./types"

// Prefers exact coordinates when available, falls back to a text search on
// address or name — always opens in a new tab via target="_blank".
export function googleMapsUrl(location: Pick<Location, "name" | "address" | "lat" | "lng">): string {
  const query = location.lat != null && location.lng != null
    ? `${location.lat},${location.lng}`
    : location.address || location.name
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
