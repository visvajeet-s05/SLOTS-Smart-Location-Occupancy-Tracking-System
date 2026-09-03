"use client"

import { useSession } from "next-auth/react"
import { usePathname } from "next/navigation"

import CustomerNavbar from "@/components/navigation/CustomerNavbar"
import GlobalDashboardPulse from "@/components/dashboard/GlobalDashboardPulse"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { data: session, status } = useSession()

  // Only show customer navbar if NOT on an owner or admin route
  const isOwnerRoute = pathname.startsWith("/dashboard/owner")
  const isAdminRoute = pathname.startsWith("/dashboard/admin")
  const showCustomerNavbar = !isOwnerRoute && !isAdminRoute

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-cyan-500/20 border-b-cyan-500 rounded-full animate-spin-slow" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-void)" }}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <GlobalDashboardPulse />
      {showCustomerNavbar && <CustomerNavbar />}
      <main id="main-content" className={showCustomerNavbar ? "pt-16" : ""}>
        {children}
      </main>
    </div>
  )
}
