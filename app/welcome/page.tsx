import { Suspense } from "react"
import WelcomeContent from "./WelcomeContent"

export default function WelcomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1a2110] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
      </div>
    }>
      <WelcomeContent />
    </Suspense>
  )
}
