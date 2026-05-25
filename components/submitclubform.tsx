"use client"

import { useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import mapboxSdk from "@mapbox/mapbox-sdk/services/geocoding"
import { useRouter } from "next/navigation"
import { ImagePlus, X, MapPin, Instagram } from "lucide-react"

const geocodingClient = mapboxSdk({
  accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN
})

export default function SubmitClubForm() {
  const [name, setName] = useState("")
  const [meetingAddress, setMeetingAddress] = useState("")
  const [city, setCity] = useState("")
  const [description, setDescription] = useState("")
  const [instagramHandle, setInstagramHandle] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [geoError, setGeoError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB")
      if (fileRef.current) fileRef.current.value = ""
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name || !city) return
    setLoading(true)
    setGeoError(false)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      // Geocode using meeting address + city, or just city if no address given
      const query = meetingAddress ? `${meetingAddress}, ${city}` : city
      const geo = await geocodingClient.forwardGeocode({ query, limit: 1 }).send()
      const location = geo.body.features?.[0]

      if (!location) {
        setGeoError(true)
        setLoading(false)
        return
      }

      const latitude = location.center[1]
      const longitude = location.center[0]

      let image_url: string | null = null
      if (imageFile) {
        const ext = imageFile.name.split(".").pop()
        const path = `${user.id}/clubs/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage.from("club-images").upload(path, imageFile)
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from("club-images").getPublicUrl(path)
          image_url = publicUrl
        }
      }

      const rawHandle = instagramHandle.trim().replace(/^@/, "")
      const { error } = await supabase.from("clubs").insert([{
        name,
        city,
        latitude,
        longitude,
        location: meetingAddress ? `${meetingAddress}, ${city}` : city,
        user_id: user.id,
        image_url,
        description: description.trim() || null,
        instagram_handle: rawHandle || null,
      }])

      if (error) {
        console.error("Insert error:", error)
        setLoading(false)
        return
      }

      router.push("/dashboard?submitted=true")
    } catch (err) {
      console.error("Unexpected error:", err)
      setLoading(false)
    }
  }

  const inputClass = "w-full bg-[#222d14] border border-[#2e3d1a] rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#c5f135]/60 transition mt-1.5"
  const labelClass = "block text-sm font-semibold text-white/70"

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* IMAGE UPLOAD */}
      <div>
        <span className={labelClass}>Club Photo / Logo</span>
        <div className="mt-1.5">
          {imagePreview ? (
            <div className="relative w-full h-44 rounded-xl overflow-hidden group">
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <button
                  type="button"
                  onClick={removeImage}
                  className="w-9 h-9 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-red-500/80 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full h-32 rounded-xl border-2 border-dashed border-[#2e3d1a] hover:border-[#c5f135]/40 flex flex-col items-center justify-center gap-2 text-white/30 hover:text-white/60 transition"
            >
              <ImagePlus className="w-7 h-7" />
              <span className="text-xs font-medium">Upload club photo or logo</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
        </div>
      </div>

      {/* CLUB NAME */}
      <label className="block">
        <span className={labelClass}>Club Name *</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Boulder Trail Runners"
          required
          className={inputClass}
        />
      </label>

      {/* LOCATION */}
      <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-4 space-y-3">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-[#c5f135] mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-white">Where does your club usually meet?</p>
            <p className="text-xs text-white/40 mt-0.5">
              Used to show your club on the map and help runners find you by location.
            </p>
          </div>
        </div>

        <label className="block">
          <span className="block text-xs font-semibold text-white/50 mb-1.5">Address or landmark</span>
          <input
            value={meetingAddress}
            onChange={(e) => setMeetingAddress(e.target.value)}
            placeholder="e.g. 1234 Pearl St, Central Park"
            className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-white/50 mb-1.5">City *</span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Boulder, CO"
            required
            className="w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
          />
        </label>

        {geoError && (
          <p className="text-xs text-red-400/80">Couldn't find that location — try a more specific address or city.</p>
        )}
      </div>

      {/* DESCRIPTION */}
      <label className="block">
        <span className={labelClass}>Description <span className="text-white/30 font-normal">(optional)</span></span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell runners what makes your club unique — pace, vibe, routes…"
          rows={3}
          className={inputClass + " resize-none"}
        />
      </label>

      {/* INSTAGRAM */}
      <label className="block">
        <span className={labelClass}>Instagram <span className="text-white/30 font-normal">(optional)</span></span>
        <div className="relative mt-1.5">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm font-medium pointer-events-none">@</span>
          <input
            value={instagramHandle}
            onChange={(e) => setInstagramHandle(e.target.value.replace(/^@/, ""))}
            placeholder="yourclubhandle"
            className="w-full bg-[#222d14] border border-[#2e3d1a] rounded-xl pl-8 pr-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#c5f135]/60 transition"
          />
        </div>
      </label>

      <button
        type="submit"
        disabled={loading || !name || !city}
        className="w-full bg-[#c5f135] text-[#1a2110] font-black text-sm py-3.5 rounded-xl hover:bg-[#d4ff45] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Submitting…" : "Submit Run Club"}
      </button>
    </form>
  )
}
