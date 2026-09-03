"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { SessionProvider, useSession } from "next-auth/react"
import OwnerNavbar from "@/components/navigation/OwnerNavbar"
import { OwnerWebSocketProvider } from "@/components/ws/OwnerWebSocketProvider"

import { OWNER_PARKING_MAPPING } from "@/lib/owner-mapping"

function OwnerLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status === "loading") return

    if (status === "unauthenticated") {
      // Check for local token to prevent false redirects
      const token = localStorage.getItem("token")
      if (!token) {
        // Only redirect if no token exists at all
        // router.replace("/") // Commented out to prevent redirect loops, let middleware handle it
      }
      return
    }

    if (session && session.user.role !== "OWNER") {
      router.replace("/dashboard")
      return
    }
  }, [session, status, router])


  // Get owner's parking lot ID from session
  const ownerEmail = (session?.user?.email || "").toLowerCase()
  const lotId = session?.user?.parkingLotId || OWNER_PARKING_MAPPING[ownerEmail]

  // Show a clean loading state while session is being verified
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-indigo-500/20 border-b-indigo-500 rounded-full animate-spin-slow" />
          </div>
        </div>
      </div>
    )
  }

  // If unauthenticated or wrong role, the useEffect will handle it
  if (status === "unauthenticated" || (session && session.user.role !== "OWNER")) {
    return null
  }

  // If we don't have a lotId yet but are authenticated as owner, show loader
  if (!lotId) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto" />
          <p className="text-neutral-400 font-medium">Verifying parking lot access...</p>
        </div>
      </div>
    )
  }

  return (
    <OwnerWebSocketProvider lotId={lotId}>
      <div className="min-h-screen bg-neutral-950">
        <OwnerNavbar />
        <main className="pt-20">
          {children}
        </main>
      </div>
    </OwnerWebSocketProvider>
  )
}

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <OwnerLayoutContent>{children}</OwnerLayoutContent>
}
