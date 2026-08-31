"use client"

import { X } from "lucide-react"
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js"
import ModalPortal from "@/components/ModalPortal"
import { getStripePromise } from "@/lib/stripeClient"

/** Renders a Stripe Checkout Session inline instead of redirecting to checkout.stripe.com. `stripeAccount` is only needed for Connect-scoped sessions (club membership payments). */
export default function StripeCheckoutModal({
  clientSecret,
  onClose,
  stripeAccount,
}: {
  clientSecret: string
  onClose: () => void
  stripeAccount?: string
}) {
  const stripePromise = getStripePromise(stripeAccount)
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full sm:max-w-lg max-h-[90vh] flex flex-col bg-[#1e2d12] border border-[#2e3d1a] rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 animate-[fadeUp_0.25s_ease-out_forwards]">
          <div className="flex items-center justify-end mb-2 shrink-0">
            <button onClick={onClose} className="text-white/30 hover:text-white/60 transition p-1" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="rounded-2xl overflow-y-auto bg-white">
            {stripePromise ? (
              <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            ) : (
              <p className="p-8 text-center text-sm text-[#1a2110]/70">
                Checkout isn&apos;t configured yet — missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
              </p>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
