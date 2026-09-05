"use client"

import type React from "react"
import { Inter } from "next/font/google"
import { usePathname } from "next/navigation"
import "./globals.css"

import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import Navbar from "@/components/navigation/navbar"
import AskLocation from "@/components/location/ask-location"
import { AuthProvider } from "@/components/auth/auth-provider"
import { SessionProvider } from "next-auth/react"
import AuthRedirect from "@/components/auth/AuthRedirect"
import SessionTimeoutGuard from "@/components/auth/SessionTimeoutGuard"

const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()

  // Hide global navbar on landing page and owner dashboard pages
  const isLandingPage = pathname === "/"
  const hideGlobalNavbar = isLandingPage || pathname.startsWith("/dashboard")

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>SLOTS - Smart Location Occupancy Tracking System</title>
        <meta name="description" content="Real-time smart parking locator, slot booking, and occupancy tracking system with live dynamic pricing and multi-role dashboards." />
        <meta property="og:title" content="SLOTS - Smart Location Occupancy Tracking System" />
        <meta property="og:description" content="Real-time smart parking locator, slot booking, and occupancy tracking system with live dynamic pricing and multi-role dashboards." />
        {/* Preload critical routes */}
        <link rel="preload" href="/login" as="document" />
        <link rel="preload" href="/dashboard" as="document" />
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//fonts.gstatic.com" />
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body className={`${inter.className} bg-black text-white antialiased`} suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('scrollRestoration' in window.history) {
              window.history.scrollRestoration = 'manual';
            }
          `}} />
        <SessionProvider
          refetchInterval={5 * 60}
          refetchOnWindowFocus={false}
        >
          <AuthProvider>
            <AuthRedirect />
            <SessionTimeoutGuard />
            {!hideGlobalNavbar && <Navbar />}
            {children}
            <Toaster />
            <SonnerToaster />
          </AuthProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
