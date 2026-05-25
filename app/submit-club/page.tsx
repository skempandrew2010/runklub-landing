"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import SubmitClubForm from "@/components/submitclubform"

export default function SubmitClubPage(){
const router = useRouter()

useEffect(() => {
  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
    }
  }

  checkUser()
}, [])

  return (
    <main className="min-h-screen bg-[#1a2110]">
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-black text-white mb-1">Coaches Corner</h1>
        <p className="text-sm text-white/40 mb-8">Add your run club to the map.</p>
        <SubmitClubForm />
      </div>
    </main>
  )

}