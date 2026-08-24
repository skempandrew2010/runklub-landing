"use client"

import { useEffect, useRef, useState } from "react"

export default function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<"below" | "visible" | "above">("below")

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("visible")
        } else {
          setState(entry.boundingClientRect.top < 0 ? "above" : "below")
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`transition-all duration-700 ease-out ${
        state === "visible" ? "opacity-100 translate-y-0" :
        state === "above"   ? "opacity-0 -translate-y-5" :
                              "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  )
}
