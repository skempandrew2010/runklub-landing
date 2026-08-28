import { supabase } from "@/lib/supabase"
import type { ClubModelData, Member, PaceGroup, Region, Coach, ClubModelMessage } from "./types"
import type { ClubWeekScheduleEntry } from "./resolveWeekSchedule"
import type { PlanId } from "@/lib/plans"

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }
}

export async function fetchClubModelData(clubId?: string): Promise<ClubModelData> {
  const url = clubId
    ? `/api/admin/club-model?club_id=${encodeURIComponent(clubId)}`
    : `/api/admin/club-model`
  const res = await fetch(url, { headers: await authHeaders() })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load data")
  return res.json()
}

export type JoinFlowData = Omit<ClubModelData, "members" | "club_model_invites" | "run_rsvps">

// Public - used by an invitee who isn't logged into any account. Gated by
// the invite token itself, not a Bearer session.
export async function fetchJoinData(inviteToken: string): Promise<JoinFlowData> {
  const res = await fetch(`/api/admin/club-model/join-data?token=${encodeURIComponent(inviteToken)}`)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "This invite link is no longer valid")
  return res.json()
}

export async function lookupInvite(inviteToken: string): Promise<{ email: string; name: string | null }> {
  const res = await fetch(`/api/admin/club-model/invite-lookup?token=${encodeURIComponent(inviteToken)}`)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "This invite link is no longer valid")
  return res.json()
}

// Test-only: flips the seeded test club's billing tier so the manager
// dashboard can be walked through as each plan. See set-test-tier/route.ts.
export async function setTestTier(tier: PlanId) {
  const res = await fetch("/api/admin/club-model/set-test-tier", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ tier }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to change plan")
  return (await res.json()).tier as PlanId
}

export async function sendInvite(email: string, name: string) {
  const res = await fetch("/api/admin/club-model/send-invite", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ email, name }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to send invite")
  return (await res.json()).invite
}

type AcceptInvitePayload = {
  token: string
  name: string
  email: string
  self_reported_pace: number
  preferred_region_id: string
  pace_group_id: string
  location_id: string | null
  coach_id: string | null
}

export async function acceptInvite(payload: AcceptInvitePayload) {
  const res = await fetch("/api/admin/club-model/accept-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to join")
  return (await res.json()).member
}

export type MyMembership = {
  member: Member
  club: { id: string; name: string; image_url: string | null } | null
  paceGroup: PaceGroup | null
  region: Region | null
  coach: Coach | null
  weekSchedule: ClubWeekScheduleEntry[]
}

// Real-identity endpoints - any logged-in user, not just admins/test accounts.
export async function fetchMyMemberships(): Promise<MyMembership[]> {
  const res = await fetch("/api/club-model/my-memberships", { headers: await authHeaders() })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load memberships")
  return (await res.json()).memberships
}

export async function fetchMessageThread(memberId: string): Promise<ClubModelMessage[]> {
  const res = await fetch(`/api/club-model/messages?member_id=${encodeURIComponent(memberId)}`, { headers: await authHeaders() })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load messages")
  return (await res.json()).messages
}

export async function sendClubModelMessage(memberId: string, body: string): Promise<ClubModelMessage> {
  const res = await fetch("/api/club-model/messages", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ member_id: memberId, body }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to send message")
  return (await res.json()).message
}

export async function insertRow<T extends Record<string, unknown>>(table: string, values: T, clubId?: string) {
  const res = await fetch("/api/admin/club-model/mutate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ table, action: "insert", values, clubId }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Insert failed")
  return (await res.json()).data
}

// Same as insertRow but for seeding several rows in one call (e.g. default
// pace groups) -- the mutate route forwards `values` straight into
// supabase-js's .insert(), which accepts an array natively.
export async function bulkInsertRows<T extends Record<string, unknown>>(table: string, values: T[], clubId?: string) {
  const res = await fetch("/api/admin/club-model/mutate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ table, action: "insert", values, clubId }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Insert failed")
  return (await res.json()).data
}

export async function deleteRow(table: string, match: Record<string, unknown>, clubId?: string) {
  const res = await fetch("/api/admin/club-model/mutate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ table, action: "delete", match, clubId }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Delete failed")
}

export async function updateRow<T extends Record<string, unknown>>(table: string, match: Record<string, unknown>, values: T, clubId?: string) {
  const res = await fetch("/api/admin/club-model/mutate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ table, action: "update", match, values, clubId }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Update failed")
  return (await res.json()).data
}

export async function upsertRow<T extends Record<string, unknown>>(table: string, values: T, onConflict: string, clubId?: string) {
  const res = await fetch("/api/admin/club-model/mutate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ table, action: "upsert", values, onConflict, clubId }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed")
  return (await res.json()).data
}
