import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const APP_URL = "https://www.runklub.fit"

// POST /api/auth/native-handoff - the native app's own WKWebView session
// never carries over to the system browser it opens for purchases (Apple
// requires those to happen outside the app entirely - see the nativeApp
// gating throughout the purchase flows). Rather than land someone on a
// signed-out page after "leaving the app," this mints a real one-time
// magic link server-side and hands back its URL, so the browser opens
// already authenticated as them.
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = getSupabaseAdmin()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { redirect } = await req.json().catch(() => ({ redirect: undefined }))
    const redirectPath = typeof redirect === "string" && redirect.startsWith("/") ? redirect : "/profile"

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
      options: { redirectTo: `${APP_URL}${redirectPath}` },
    })
    if (error || !data?.properties?.action_link) {
      return NextResponse.json({ error: error?.message ?? "Could not create sign-in link" }, { status: 500 })
    }

    return NextResponse.json({ url: data.properties.action_link })
  } catch (err) {
    console.error("native-handoff error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
