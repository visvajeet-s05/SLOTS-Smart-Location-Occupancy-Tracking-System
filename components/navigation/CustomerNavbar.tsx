"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
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
import { Role } from "@/lib/auth/roles"
import SLOTSLogo from "@/components/ui/SLOTSLogo"

export default function CustomerNavbar() {
  const pathname = usePathname()
  const { data: session, status } = useSession()

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // ✅ SAFE helpers
  const userEmail = session?.user?.email ?? ""
  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : "U"

  const dashboardLinks = [
    { name: "Home", href: "/dashboard" },
    { name: "Find Parking", href: "/dashboard#available-parking" },
    { name: "My Bookings", href: "/dashboard/bookings" },
    { name: "Profile", href: "/dashboard/profile" },
  ]

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed top-0 left-0 right-0 z-50 bg-slate-950/30 border-b border-white/5 backdrop-blur-2xl shadow-2xl shadow-purple-900/10"
    >
      <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 group">
          <SLOTSLogo size="small" showPing={true} className="hover:scale-105 transition-transform duration-300" />
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center space-x-1 rounded-full p-1 border" style={{ background: "var(--bg-glass)", borderColor: "var(--border-glass)" }}>
          {dashboardLinks.map((link) => {
            const isActive = pathname === link.href
            return (
              <Link
                key={link.name}
                href={link.href}
                className="relative px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200"
              >
                {isActive && (
                  <motion.div
                    layoutId="navbar-indicator"
                    className="absolute inset-0 rounded-full"
                    style={{ background: "var(--accent)" }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className={`relative z-10 ${isActive ? "text-white" : ""}`} style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {link.name}
                </span>
              </Link>
            )
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <div className="relative hidden lg:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--text-muted)" }} />
            <Input
              placeholder="Search bookings..."
              className="pl-10 h-9 w-64 focus-visible:ring-0 rounded-full text-sm placeholder:text-slate-500"
              style={{ 
                background: "var(--bg-glass)",
                border: "1px solid var(--border-glass)",
                color: "var(--text-primary)"
              }}
            />
          </div>

          <div className="h-6 w-px mx-2 hidden md:block" style={{ background: "var(--border-glass)" }} />

          <Button variant="ghost" size="icon" className="relative rounded-full" style={{ color: "var(--text-secondary)" }}>
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full border-2" style={{ background: "var(--error)", borderColor: "var(--bg-void)" }}></span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-3 pl-2 pr-4 py-1 rounded-full border border-transparent hover:bg-white/5 hover:border-white/5 transition-all">
                <Avatar className="h-8 w-8 ring-2 ring-white/10" style={{ boxShadow: "0 0 0 2px var(--accent-dim)" }}>
                  <AvatarImage src="/placeholder-user.svg" />
                  <AvatarFallback className="font-bold text-xs" style={{ background: "var(--accent)", color: "var(--text-primary)" }}>
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start leading-none transition-colors">
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {session?.user?.name || "Customer"}
                  </span>
                  <span className="text-[10px] font-medium tracking-wide" style={{ color: "var(--text-muted)" }}>
                    {session?.user?.email || userEmail}
                  </span>
                </div>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-40 shadow-xl rounded-xl p-1" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}>
              <DropdownMenuItem
                className="cursor-pointer rounded-lg transition-colors"
                style={{ color: "var(--error)" }}
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-white"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="md:hidden overflow-hidden"
            style={{ background: "var(--bg-void)", borderTopColor: "var(--border-glass)" }}
          >
            <div className="px-6 py-8 space-y-6">
              <div className="flex flex-col space-y-4">
                {dashboardLinks.map((link) => (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-lg font-bold transition-colors"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {link.name}
                  </Link>
                ))}
              </div>
              <Button 
                variant="outline" 
                className="w-full h-14 rounded-2xl font-bold uppercase tracking-widest text-xs"
                style={{ borderColor: "var(--error)", color: "var(--error)" }}
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Terminate Session
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}
