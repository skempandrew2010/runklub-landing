import type { SupabaseClient } from "@supabase/supabase-js"

// Pro's included monthly email allowance (see lib/plans.ts Plan.monthlyEmailLimit).
// Overage beyond this is billed manually at Resend's actual per-email rate -
// there's no automatic metered billing yet, so this only enforces the cap.
export const MONTHLY_EMAIL_LIMIT = 20000

function currentMonthStartIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

// Counts rows in email_sends (one row per actual email delivered, across both
// newsletter and training_schedule sends) for the current calendar month.
export async function getMonthlyEmailCount(admin: SupabaseClient, clubId: string): Promise<number> {
  const { count } = await admin
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)
    .gte("sent_at", currentMonthStartIso())
  return count ?? 0
}

export const EMAIL_CAP_ERROR_MESSAGE =
  "This klub has sent its 20,000 included emails for this month. Extra sends are billed separately at cost — contact us to keep sending this month."
