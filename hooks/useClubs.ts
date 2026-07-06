import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Club = {
  id: string
  name: string
  city: string
  latitude: number
  longitude: number
  meeting_day: string
  meeting_time: string
}

export function useClubs() {
  const [clubs, setClubs] = useState<Club[]>([])

  useEffect(() => {
    async function loadClubs() {
      const { data } = await supabase.from("clubs").select("id, name, city, latitude, longitude, meeting_day, meeting_time").eq("is_public", true)
      setClubs(data || [])
    }

    loadClubs()
  }, [])

  return clubs
}