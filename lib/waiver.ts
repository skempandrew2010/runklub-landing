import { supabase } from "@/lib/supabase"

/** True if this klub has a waiver and this user hasn't acknowledged it yet. */
export async function needsWaiverAck(userId: string, clubId: string, waiverUrl: string | null | undefined): Promise<boolean> {
  if (!waiverUrl) return false
  const { data } = await supabase
    .from("waiver_acknowledgments")
    .select("user_id")
    .eq("user_id", userId)
    .eq("club_id", clubId)
    .maybeSingle()
  return !data
}

export async function acknowledgeWaiver(userId: string, clubId: string) {
  await supabase
    .from("waiver_acknowledgments")
    .upsert({ user_id: userId, club_id: clubId }, { onConflict: "user_id,club_id" })
}
