import { useEffect, useRef } from "react"
import ClubCard from "@/components/clubcard"
import { Club } from "@/types/club"

function FadeInCard({ children, index }: { children: React.ReactNode; index: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const delay = `${index * 35}ms`
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.transition = `opacity 0.3s ease ${delay}, transform 0.3s ease ${delay}`
          el.style.opacity = "1"
          el.style.transform = "translateY(0)"
        } else {
          el.style.transition = "none"
          el.style.opacity = "0"
          el.style.transform = "translateY(10px)"
        }
      },
      { threshold: 0.05 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{ opacity: 0, transform: "translateY(10px)" }}
    >
      {children}
    </div>
  )
}

type Props = {
  clubs: Club[]
  setHoveredClub: (id: string | null) => void
  setSelectedClub: (club: Club) => void
  setFavorites: React.Dispatch<React.SetStateAction<Club[]>>
  userId: string | null
  requireAuth: (action?: () => void) => void
  selectedClub: Club | null
}

export default function ClubList({
  setHoveredClub,
  clubs,
  setFavorites,
  userId,
  requireAuth,
  selectedClub,
}: Props) {
  if (clubs.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-white/40 text-sm font-medium">No clubs found</p>
        <p className="text-white/25 text-xs mt-1">Try adjusting your filters</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-[#2e3d1a]">
      {clubs.map((club, i) => (
        <FadeInCard key={club.id} index={i}>
          <ClubCard
            club={club}
            userId={userId}
            requireAuth={requireAuth}
            isSelected={selectedClub?.id === club.id}
            showHeart={true}
            onHover={setHoveredClub}
            onSubscriptionChange={(club, isFav) => {
              if (isFav) {
                setFavorites((prev) => [...prev, club])
              } else {
                setFavorites((prev) => prev.filter((c) => c.id !== club.id))
              }
            }}
          />
        </FadeInCard>
      ))}
    </div>
  )
}
