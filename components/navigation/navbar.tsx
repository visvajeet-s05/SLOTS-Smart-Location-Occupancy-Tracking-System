"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { Car, Menu, Search, Bell, User, X, MessageSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useSession, signOut } from "next-auth/react"
import LoginModal from "@/components/auth/LoginModal"
import { useAuth } from "@/components/auth/auth-provider"
import { isSessionValid } from "@/lib/checkSession"
import { Role } from "@/lib/auth/roles"
import SLOTSLogo from "@/components/ui/SLOTSLogo"

export default function Navbar() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const { user } = useAuth()

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  const isDashboard = pathname.startsWith("/dashboard")

  // ✅ Check authentication status - support both NextAuth and localStorage tokens
  const isAuthenticated = isHydrated && (status === "authenticated" || isSessionValid())

  // Set hydrated state after component mounts
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // ✅ Get user info from either NextAuth session or localStorage
  const userEmail = session?.user?.email || (typeof window !== 'undefined' ? localStorage.getItem("email") : "") || ""
  const userRole = session?.user?.role || (typeof window !== 'undefined' ? localStorage.getItem("role") : "") || ""
  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : "U"

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Find Parking", href: "/find" },
    { name: "How It Works", href: "/how-it-works" },
    { name: "Pricing", href: "/pricing" },
    { name: "About Us", href: "/about" },
  ]

  const getDashboardHomeLink = () => {
    switch (userRole) {
      case Role.ADMIN:
        return "/dashboard/admin"
      case Role.OWNER:
        return "/dashboard/owner"
      case Role.STAFF:
        return "/dashboard/staff"
      default:
        return "/dashboard"
    }
  }

  const dashboardLinks = [
    { name: "Home", href: getDashboardHomeLink() },
    { name: "Find Parking", href: "/dashboard/find" },
    { name: "My Bookings", href: "/dashboard/bookings" },
    { name: "Profile", href: "/dashboard/profile" },
  ]

  const activeLinks = isDashboard ? dashboardLinks : navLinks

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed top-0 left-0 right-0 z-50 
bg-slate-950/30 backdrop-blur-2xl border-b border-white/5 shadow-2xl shadow-indigo-900/10"
      >
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center group">
            <SLOTSLogo size="small" className="hover:scale-105 transition-transform duration-300" />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center space-x-4">
            {activeLinks.map((link) => {
              // For Find Parking, handle authentication check
              if (link.name === "Find Parking") {
                if (isAuthenticated) {
                  return (
                    <Link
                      key={link.name}
                      href={link.href}
                      className={`px-3 py-2 text-sm rounded-md ${pathname === link.href
                        ? "text-indigo-400"
                        : "text-gray-300 hover:text-white hover:bg-gray-800"
                        }`}
                    >
                      {link.name}
                    </Link>
                  )
                } else {
                  return (
                    <button
                      key={link.name}
                      onClick={() => setShowLoginModal(true)}
                      className="px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-md"
                    >
                      {link.name}
                    </button>
                  )
                }
              }

              // For all other links, use Link component
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`px-3 py-2 text-sm rounded-md ${pathname === link.href
                    ? "text-indigo-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                    }`}
                >
                  {link.name}
                </Link>
              )
            })}

            {isDashboard && (
              <div className="relative ml-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search..."
                  className="pl-10 bg-gray-800 border-gray-700 text-white w-64"
                />
              </div>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                {isDashboard && (
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                  </Button>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src="/placeholder-user.svg" />
                        <AvatarFallback>{userInitial}</AvatarFallback>
                      </Avatar>
                      <div className="hidden sm:flex flex-col items-start">
                        <span className="text-sm font-medium text-white">
                          {userRole === Role.OWNER ? "👤 Owner" :
                            userRole === Role.ADMIN ? "🔧 Admin" :
                              userRole === Role.CUSTOMER ? "👥 Customer" :
                                userRole === Role.STAFF ? "👷 Staff" : "👤 User"}
                        </span>
                        <span className="text-xs text-gray-400">
                          {userEmail}
                        </span>
                      </div>
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="bg-gray-900 border-gray-800 text-white">
                    <DropdownMenuItem asChild>
                      <Link href={`${getDashboardHomeLink()}/profile`}>Profile</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`${getDashboardHomeLink()}/bookings`}>My Bookings</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-gray-800" />
                    <DropdownMenuItem
                      className="text-red-400 cursor-pointer"
                      onClick={() => {
                        // Clear localStorage tokens only after hydration
                        if (isHydrated) {
                          localStorage.removeItem("token")
                          localStorage.removeItem("role")
                          localStorage.removeItem("email")
                        }
                        // Sign out from NextAuth
                        signOut({ callbackUrl: "/" })
                      }}
                    >
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setShowLoginModal(true)}
                >
                  Login
                </Button>
                <Button
                  className="bg-gradient-to-r from-indigo-600 to-indigo-600"
                  onClick={() => setShowLoginModal(true)}
                >
                  Get Started
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </motion.nav>

      {/* Login Modal */}
      <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </>
  )
}