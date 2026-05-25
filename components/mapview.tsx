"use client"

import { useState, useEffect, useRef } from "react"
import Map, { Marker, Popup, NavigationControl, Source, Layer } from "react-map-gl/mapbox"
import "mapbox-gl/dist/mapbox-gl.css"
import mapboxSdk from "@mapbox/mapbox-sdk/services/geocoding"


export type RunPin = {
  id: string
  title: string
  date: string
  time: string
  distance: string | null
  meeting_point: string | null
  city: string | null
  run_lat: number | null
  run_lng: number | null
  tags: string[] | null
  club_id: string
  club_name: string
  club_image: string | null
  club_lat: number | null
  club_lng: number | null
}

// Runs grouped by their map position (run location if set, else club location)
type LocationGroup = {
  key: string
  lat: number
  lng: number
  runs: RunPin[]
}

type MapViewProps = {
  city: string
  runs: RunPin[]
  onCityCoords?: (coords: { lat: number; lng: number } | null) => void
}

const geocodingClient = mapboxSdk({ accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN })

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow"
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`
}

// Round to ~100m precision for grouping nearby pins
function locationKey(lat: number, lng: number) {
  return `${Math.round(lat * 1000) / 1000}_${Math.round(lng * 1000) / 1000}`
}

export default function MapView({ city, runs, onCityCoords }: MapViewProps) {
  const [viewState, setViewState] = useState({ latitude: 40.015, longitude: -105.2705, zoom: 11 })
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<LocationGroup | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [geocodedCities, setGeocodedCities] = useState<Record<string, { lat: number; lng: number }>>({})
  const [cityBbox, setCityBbox] = useState<[number, number, number, number] | null>(null)
  const mapRef = useRef<any>(null)
  const cityReqId = useRef(0)

  useEffect(() => {
    return () => setMapReady(false)
  }, [])


  // Geocode cities for runs that have no lat/lng but do have a city string
  useEffect(() => {
    const needsGeocoding = runs.filter(
      (r) => r.run_lat == null && r.club_lat == null && r.city
    )
    const uniqueCities = [...new Set(needsGeocoding.map((r) => r.city!))]
      .filter((c) => !(c in geocodedCities))

    if (uniqueCities.length === 0) return

    Promise.all(
      uniqueCities.map((c) =>
        geocodingClient
          .forwardGeocode({ query: c, limit: 1 })
          .send()
          .then((res: any) => {
            const match = res.body.features[0]
            return match ? ([c, { lat: match.center[1], lng: match.center[0] }] as const) : null
          })
          .catch(() => null)
      )
    ).then((results) => {
      const updated: Record<string, { lat: number; lng: number }> = {}
      results.forEach((r) => { if (r) updated[r[0]] = r[1] })
      if (Object.keys(updated).length > 0) {
        setGeocodedCities((prev) => ({ ...prev, ...updated }))
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation({ latitude: coords.latitude, longitude: coords.longitude })
        setViewState({ latitude: coords.latitude, longitude: coords.longitude, zoom: 11 })
      },
      () => {}
    )
  }, [])

  useEffect(() => {
    if (!city) { onCityCoords?.(null); setCityBbox(null); return }
    const reqId = ++cityReqId.current
    const timer = setTimeout(() => {
      geocodingClient
        .forwardGeocode({ query: city, limit: 1 })
        .send()
        .then((res: any) => {
          if (reqId !== cityReqId.current) return
          const match = res.body.features[0]
          if (!match) return
          const lat = match.center[1]
          const lng = match.center[0]
          onCityCoords?.({ lat, lng })
          // Build bbox — use geocoding result or fall back to a ~0.15° box around center
          const bbox: [number, number, number, number] = match.bbox
            ? (match.bbox as [number, number, number, number])
            : [lng - 0.15, lat - 0.15, lng + 0.15, lat + 0.15]
          setCityBbox(bbox)
          // Move camera imperatively so it animates
          const map = mapRef.current?.getMap()
          if (map) {
            map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 60, duration: 1000, maxZoom: 13 })
          } else {
            setViewState({ latitude: lat, longitude: lng, zoom: 11 })
          }
        })
    }, 400)
    return () => clearTimeout(timer)
  }, [city])

  // Group runs by their effective location — run coords → club coords → geocoded city
  const locationGroups: LocationGroup[] = []
  const seen: Record<string, LocationGroup> = {}
  runs.forEach((run) => {
    let lat = run.run_lat ?? run.club_lat
    let lng = run.run_lng ?? run.club_lng
    if ((lat == null || lng == null) && run.city && geocodedCities[run.city]) {
      lat = geocodedCities[run.city].lat
      lng = geocodedCities[run.city].lng
    }
    if (lat == null || lng == null) return
    const key = locationKey(lat, lng)
    if (seen[key]) {
      seen[key].runs.push(run)
    } else {
      const g: LocationGroup = { key, lat, lng, runs: [run] }
      seen[key] = g
      locationGroups.push(g)
    }
  })

  return (
    <Map
      ref={mapRef}
      {...viewState}
      onMove={(evt: any) => setViewState(evt.viewState)}
      onClick={() => setSelectedGroup(null)}
      style={{ width: "100%", height: "100%", minHeight: "180px" }}
      mapStyle="mapbox://styles/mapbox/streets-v11"
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      reuseMaps
      onLoad={() => setMapReady(true)}
      onRemove={() => setMapReady(false)}
    >
      {mapReady && (
        <NavigationControl
          position="top-right"
          showCompass
          showZoom
          style={{ marginTop: 52 }}
        />
      )}

      {/* Pan + rotate controls */}
      {mapReady && (() => {
        const map = mapRef.current?.getMap()
        const pan = (dx: number, dy: number) => map?.panBy([dx, dy], { duration: 300 })
        const rotate = (delta: number) => map?.rotateTo((map.getBearing() + delta) % 360, { duration: 300 })

        const btnStyle = (extra: React.CSSProperties = {}): React.CSSProperties => ({
          position: "absolute",
          width: 28,
          height: 28,
          background: "rgba(26,33,16,0.92)",
          border: "1px solid rgba(197,241,53,0.25)",
          borderRadius: 6,
          color: "rgba(255,255,255,0.75)",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          lineHeight: 1,
          ...extra,
        })

        return (
          <div style={{ position: "absolute", bottom: 36, right: 10, width: 88, height: 124 }}>
            {/* Rotate row */}
            <button onClick={() => rotate(-30)} title="Rotate left" style={btnStyle({ top: 0, left: 8 })}>↺</button>
            <button onClick={() => rotate(30)}  title="Rotate right" style={btnStyle({ top: 0, right: 8 })}>↻</button>
            {/* Pan diamond */}
            <button onClick={() => pan(0, -80)}  title="Pan up"    style={btnStyle({ top: 36, left: 30 })}>▲</button>
            <button onClick={() => pan(-80, 0)}  title="Pan left"  style={btnStyle({ top: 66, left: 0 })}>◀</button>
            <button onClick={() => pan(80, 0)}   title="Pan right" style={btnStyle({ top: 66, right: 0 })}>▶</button>
            <button onClick={() => pan(0, 80)}   title="Pan down"  style={btnStyle({ bottom: 0, left: 30 })}>▼</button>
          </div>
        )
      })()}

      {/* City outline */}
      {cityBbox && (() => {
        const [w, s, e, n] = cityBbox
        return (
          <Source id="city-bbox" type="geojson" data={{
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [[[w,s],[e,s],[e,n],[w,n],[w,s]]] },
            properties: {},
          }}>
            <Layer id="city-fill"    type="fill" paint={{ "fill-color": "#c5f135", "fill-opacity": 0.06 }} />
            <Layer id="city-outline" type="line" paint={{ "line-color": "#c5f135", "line-width": 2.5, "line-opacity": 0.8, "line-dasharray": [5, 3] }} />
          </Source>
        )
      })()}

      {/* User location dot */}
      {mapReady && userLocation && (
        <Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="center">
          <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md animate-pulse" />
        </Marker>
      )}

      {/* Run pins — one per unique location */}
      {mapReady && locationGroups.map((group) => {
        const active = selectedGroup?.key === group.key
        const count = group.runs.length
        return (
          <Marker key={group.key} longitude={group.lng} latitude={group.lat} anchor="bottom">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSelectedGroup(active ? null : group)
              }}
              className="relative focus:outline-none"
              style={{ transform: active ? "scale(1.2)" : "scale(1)", transition: "transform 0.15s ease" }}
            >
              <svg width="22" height="30" viewBox="0 0 22 30" fill="none" xmlns="http://www.w3.org/2000/svg"
                style={{ filter: active ? "drop-shadow(0 4px 12px rgba(197,241,53,0.55))" : "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }}
              >
                <path
                  d="M11 0C4.925 0 0 4.925 0 11c0 7.667 11 19 11 19S22 18.667 22 11C22 4.925 17.075 0 11 0z"
                  fill={active ? "#c5f135" : "#1a2110"}
                  stroke="#c5f135"
                  strokeWidth={active ? "0" : "1.5"}
                />
                <circle cx="11" cy="10.5" r="4" fill={active ? "#1a2110" : "#c5f135"} />
              </svg>
              {count > 1 && (
                <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-[#c5f135] text-[#1a2110] text-[9px] font-black flex items-center justify-center leading-none shadow-sm">
                  {count}
                </span>
              )}
            </button>
          </Marker>
        )
      })}

      {/* Popup */}
      {mapReady && selectedGroup && (() => {
        const allSameClub = selectedGroup.runs.every(r => r.club_id === selectedGroup.runs[0].club_id)
        const headerName = allSameClub ? selectedGroup.runs[0].club_name : `${selectedGroup.runs.length} runs here`
        const headerImage = allSameClub ? selectedGroup.runs[0].club_image : null
        const headerInitials = allSameClub
          ? selectedGroup.runs[0].club_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
          : "📍"

        return (
          <Popup
            longitude={selectedGroup.lng}
            latitude={selectedGroup.lat}
            anchor="top"
            offset={14}
            closeButton={false}
            onClose={() => setSelectedGroup(null)}
            className="run-popup"
            maxWidth="300px"
          >
            <div onClick={(e) => e.stopPropagation()} style={{ minWidth: 220 }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid #2e3d1a" }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "#2e3d1a", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {headerImage ? (
                    <img src={headerImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.4)" }}>{headerInitials}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, color: "#fff", fontWeight: 800, fontSize: 13, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {headerName}
                  </p>
                  <p style={{ margin: "3px 0 0", color: "#c5f135", fontWeight: 700, fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                    {selectedGroup.runs.length} run{selectedGroup.runs.length > 1 ? "s" : ""} scheduled
                  </p>
                </div>
                <button
                  onClick={() => setSelectedGroup(null)}
                  style={{ color: "rgba(255,255,255,0.25)", background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 1, flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>

              {/* Run list */}
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {selectedGroup.runs.map((run, i) => (
                  <div
                    key={run.id}
                    style={{ padding: "10px 14px", borderTop: i > 0 ? "1px solid #2e3d1a" : undefined }}
                  >
                    {!allSameClub && (
                      <p style={{ margin: "0 0 3px", color: "#c5f135", fontWeight: 700, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {run.club_name}
                      </p>
                    )}
                    <p style={{ margin: "0 0 3px", color: "#fff", fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>
                      {run.title}
                    </p>
                    <p style={{ margin: "0 0 4px", color: "#c5f135", fontWeight: 600, fontSize: 11 }}>
                      {formatDate(run.date)} · {formatTime(run.time)}
                    </p>
                    {run.meeting_point && (
                      <p style={{ margin: "2px 0 0", color: "rgba(255,255,255,0.45)", fontSize: 11, display: "flex", alignItems: "flex-start", gap: 4 }}>
                        <span>📍</span> {run.meeting_point}{run.city ? `, ${run.city}` : ""}
                      </p>
                    )}
                    {run.distance && (
                      <p style={{ margin: "2px 0 0", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                        🏃 {run.distance}
                      </p>
                    )}
                    {run.tags && run.tags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {run.tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "2px 7px",
                              borderRadius: 999,
                              background: "#2e3d1a",
                              color: "rgba(197,241,53,0.65)",
                              border: "1px solid #3d5220",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Popup>
        )
      })()}
    </Map>
  )
}
