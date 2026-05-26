import { createClient } from "@supabase/supabase-js"

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder_key"
)

// Clear stale sessions when a refresh token becomes invalid (e.g. after account deletion/recreation)
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED" && !session) {
      supabase.auth.signOut()
    }
  })

  supabase.auth.getSession().then(({ error }) => {
    if (error?.message?.toLowerCase().includes("refresh token")) {
      supabase.auth.signOut()
    }
  })
}