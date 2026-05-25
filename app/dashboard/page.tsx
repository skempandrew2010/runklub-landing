"use client"

import { supabase } from "@/lib/supabase"
import { useEffect, useState } from "react"
import { Club } from "@/types/club"
import ClubCard from "@/components/clubcard"
import Link from "next/link"

export default function DashboardPage() {
  const [myClubs, setMyClubs] = useState<Club[]>([])
  const [favorites, setFavorites] = useState<Club[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Listen to auth changes and set userId
  useEffect(() => {
    const getInitialUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUserId(data.user?.id || null)
      setLoading(false)
    }

    getInitialUser()

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserId(session?.user?.id || null)
      }
    )

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  // Load user clubs and favorites whenever userId changes
  useEffect(() => {
    if (!userId) return

    const loadData = async () => {
      try {
        // My Clubs
        const { data: clubs, error: clubsError } = await supabase
          .from("clubs")
          .select("*")
          .eq("user_id", userId)
        if (!clubsError) setMyClubs(clubs || [])

        // Favorite Clubs / Subscriptions
        const { data: subs, error: subsError } = await supabase
          .from("subscriptions")
          .select("clubs(*)")
          .eq("user_id", userId)
        if (!subsError) {
          const subscribedClubs = subs?.map((s: any) => s.clubs) || []
          setFavorites(subscribedClubs)
        }
      } catch (err) {
        console.error("Error loading dashboard data:", err)
      }
    }

    loadData()
  }, [userId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a2110] max-w-5xl mx-auto py-10 px-6">
        <p className="text-white/60">Loading...</p>
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="min-h-screen bg-[#1a2110] max-w-5xl mx-auto py-10 px-6">
        <p className="text-white/60">Please log in to view your dashboard.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a2110]">
      <div className="max-w-5xl mx-auto py-10 space-y-10 px-6">

        {/* MY CLUBS */}
        <div>
          <h2 className="text-2xl font-black mb-4 text-white">My Clubs</h2>
          {myClubs.length === 0 && (
            <p className="text-white/60">You haven’t created any clubs yet.</p>
          )}
          {myClubs.map((club) => (
            <div key={club.id} className="w-full mb-4">
              <ClubCard club={club} showHeart={false} userId={userId} />
              <Link
                href={`/dashboard/${club.id}`}
                className="inline-block bg-[#c5f135] text-[#1a2110] px-4 py-1 rounded font-bold uppercase tracking-wider text-sm mt-2"
              >
                Manage Club
              </Link>
            </div>
          ))}
        </div>

        {/* FAVORITE CLUBS */}
        <div>
          <h2 className="text-2xl font-black mb-4 text-white">Favorite Clubs</h2>
          {favorites.length === 0 && (
            <p className="text-white/60">You haven’t subscribed to any clubs yet.</p>
          )}
          {favorites.map((club) => (
            <div key={club.id} className="w-full mb-4">
              <ClubCard
                club={club}
                userId={userId}
                showHeart={true}
                onSubscriptionChange={(club, isSubscribed) => {
                  if (isSubscribed) {
                    setFavorites((prev) => [...prev, club])
                  } else {
                    setFavorites((prev) =>
                      prev.filter((c) => c.id !== club.id)
                    )
                  }
                }}
              />
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}