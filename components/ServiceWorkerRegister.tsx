"use client"

import { useEffect } from "react"
import { isNativeApp } from "@/utils/platform"

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production" && !isNativeApp()) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {})
    }
  }, [])

  return null
}
