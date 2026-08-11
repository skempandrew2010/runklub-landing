import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 })

  const adminSupabase = getAdminSupabase()
  const { data: invite, error } = await adminSupabase
    .from("coach_invites")
    .select("id, club_id, email, name, status, pace_group_ids, region_ids, clubs(name, image_url)")
    .eq("token", token)
    .single()

  if (error || !invite) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let paceGroupNames: string[] = []
  if (invite.pace_group_ids?.length) {
    const { data: pgs } = await adminSupabase.from("pace_groups").select("name").in("id", invite.pace_group_ids)
    paceGroupNames = (pgs ?? []).map((p) => p.name)
  }

  return NextResponse.json({ invite: { ...invite, paceGroupNames } })
}
