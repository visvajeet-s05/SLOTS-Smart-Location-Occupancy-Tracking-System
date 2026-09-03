"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"

export default function GlobalDashboardPulse() {
  const { data: session } = useSession()
  const router = useRouter()

  useEffect(() => {
    // Only apply to Owners and Super Admins as requested (Management roles)
    if ((session?.user?.role as any) === "OWNER" || (session?.user?.role as any) === "SUPER_ADMIN") {
      // Professional auto-refresh interval (every 10 seconds)
      // This ensures all server-side data is re-sync'd globally across sub-pages
      const interval = setInterval(() => {
        console.log("⚡ [PRO-REFRESH] Synchronizing Global Dashboard Data...")
        router.refresh()
      }, 10000)

      return () => clearInterval(interval)
    }
  }, [session, router])

  return null // Pure logic component
}
