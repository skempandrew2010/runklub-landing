"use client"

import { useEffect, useState } from "react"
import { getClubStampArt, getUserPassportProgress } from "@/lib/checkins"
import CheckInConfirmation from "@/components/CheckInConfirmation"
import CheckInMoment, { type CheckInMomentProps } from "@/components/CheckInMoment"
import BadgeUnlockModal, { type UnlockedBadge } from "@/components/BadgeUnlockModal"
import ChallengeCompleteMoment, { type NewlyCompletedChallenge } from "@/components/ChallengeCompleteMoment"
import BuddyPicker from "@/components/BuddyPicker"
import type { CheckInResult } from "@/lib/server/checkin"

type MomentData = Omit<CheckInMomentProps, "onDone">

/**
 * Queues the post-check-in celebration sequence (stamp → badge unlock →
 * mission complete → buddy picker) from a raw /api/checkin response. Shared
 * by the run page's check-in button and the proactive check-in watcher so
 * both paths end in the same "you're all checked in" + reward experience.
 */
export default function CheckInCelebration({
  data,
  runId,
  clubId,
  clubName,
  userId,
  onDone,
}: {
  data: CheckInResult
  runId: string
  clubId: string
  clubName: string
  userId: string
  onDone: () => void
}) {
  const [showConfirmation, setShowConfirmation] = useState(true)
  const [checkInMoment, setCheckInMoment] = useState<MomentData | null>(null)
  const [pendingBadges, setPendingBadges] = useState<UnlockedBadge[]>([])
  const [newlyCompleted, setNewlyCompleted] = useState<NewlyCompletedChallenge[]>([])
  const [checkInId, setCheckInId] = useState<string | null>(null)
  const [showBuddyPicker, setShowBuddyPicker] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (showConfirmation || !ready) return
    if (checkInMoment || pendingBadges.length > 0 || newlyCompleted.length > 0 || showBuddyPicker) return
    if (checkInId) { setShowBuddyPicker(true); return }
    onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showConfirmation, ready, checkInMoment, pendingBadges, newlyCompleted, showBuddyPicker, checkInId])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (data.checkInId) setCheckInId(data.checkInId)
      if (data.newlyCompletedChallenges?.length) setNewlyCompleted(data.newlyCompletedChallenges)

      const passport = data.passport
      if (!passport) { setReady(true); return }

      if (passport.new_badges?.length) setPendingBadges(passport.new_badges)

      if (passport.club_first || passport.city_first) {
        try {
          const raw = sessionStorage.getItem("runklub_just_unlocked")
          const unlocked = raw ? JSON.parse(raw) : { clubIds: [], cityIds: [] }
          if (passport.club_first) unlocked.clubIds.push(clubId)
          if (passport.city_first && passport.city_id) unlocked.cityIds.push(passport.city_id)
          sessionStorage.setItem("runklub_just_unlocked", JSON.stringify(unlocked))
        } catch { /* sessionStorage unavailable — unlock animation is a nice-to-have */ }
      }

      const [stampUrl, progress] = await Promise.all([
        getClubStampArt(clubId),
        getUserPassportProgress(),
      ])
      if (cancelled) return

      const justStampedCity = passport.city_id ? progress.find((c) => c.city_id === passport.city_id) ?? null : null
      const nearest = progress.find((c) => c.is_nearest_incomplete) ?? null
      const totalStamps = progress.reduce((sum, c) => sum + c.stamped_clubs, 0)
      const justStampedCityComplete = !!justStampedCity?.is_complete && passport.city_first
      const isMilestone = totalStamps > 0 && totalStamps % 5 === 0

      let shareCardUrl: string | null = null
      if (passport.club_first && (justStampedCityComplete || isMilestone)) {
        const params = new URLSearchParams({
          type: justStampedCityComplete ? "complete" : "milestone",
          clubName,
          cityName: justStampedCity?.city_name ?? "",
          cityState: justStampedCity?.city_state ?? "",
          stampNumber: String(totalStamps),
          totalCount: String(justStampedCity?.total_clubs ?? 0),
        })
        if (stampUrl) params.set("stampUrl", stampUrl)
        shareCardUrl = `/api/passport/share-card?${params.toString()}`
      }

      setCheckInMoment({
        clubName,
        clubStampUrl: stampUrl,
        isFirstTime: passport.club_first,
        clubCount: passport.club_count,
        totalStamps,
        justStampedCityComplete,
        justStampedCityName: justStampedCity?.city_name ?? null,
        nearestIncomplete: nearest ? { cityName: nearest.city_name, remaining: nearest.remaining } : null,
        shareCardUrl,
      })
      setReady(true)
    }

    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (showConfirmation) return <CheckInConfirmation onDone={() => setShowConfirmation(false)} />
  if (!ready) return null

  if (checkInMoment) return <CheckInMoment {...checkInMoment} onDone={() => setCheckInMoment(null)} />
  if (pendingBadges.length > 0) return <BadgeUnlockModal badges={pendingBadges} onDone={() => setPendingBadges([])} />
  if (newlyCompleted.length > 0) return <ChallengeCompleteMoment challenges={newlyCompleted} onDone={() => setNewlyCompleted([])} />
  if (showBuddyPicker && checkInId) return <BuddyPicker runId={runId} checkInId={checkInId} userId={userId} onDone={onDone} />

  return null
}
