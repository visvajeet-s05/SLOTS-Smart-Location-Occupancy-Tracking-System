"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { Bell, Search } from "lucide-react"

import { Input } from "@/components/ui/input"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSession, signOut } from "next-auth/react"
import { Role } from "@/lib/auth/roles"
import { OWNER_PARKING_MAPPING, PARKING_LOT_DETAILS } from "@/lib/owner-mapping"
import SLOTSLogo from "@/components/ui/SLOTSLogo"

export default function OwnerNavbar() {
  const pathname = usePathname()
  const { data: session, status } = useSession()

  const userName = session?.user?.name ?? "Owner"
  const userInitial = userName.charAt(0).toUpperCase()

  const ownerEmail = (session?.user?.email || "").toLowerCase()
  const parkingLotId = OWNER_PARKING_MAPPING[ownerEmail] || session?.user?.parkingLotId
  const lotDetails = (parkingLotId && PARKING_LOT_DETAILS[parkingLotId]) || { name: userName, location: "Unknown Location" }

  if (status === "loading") {
    return (
      <motion.nav initial={{ y: -100 }} animate={{ y: 0 }} transition={{ duration: 0.3 }} className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-slate-950/30 backdrop-blur-2xl shadow-2xl shadow-indigo-900/10">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="w-10 h-10 rounded-full border border-neutral-700/80 flex items-center justify-center bg-neutral-900">
            <div className="w-5 h-5 bg-neutral-800 animate-pulse rounded-full" />
          </div>
        </div>
      </motion.nav>
    )
  }

  const ownerLinks = [
    { name: "Bookings", href: "/dashboard/owner/bookings" },
    { name: "Analytics", href: "/dashboard/owner/analytics" },
    { name: "Reports", href: "/dashboard/owner/reports" },
    { name: "Profile", href: "/dashboard/owner/profile" },
  ]

  return (
    <motion.nav initial={{ y: -100 }} animate={{ y: 0 }} transition={{ duration: 0.3 }} className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-slate-950/30 backdrop-blur-2xl shadow-2xl shadow-indigo-900/10">
      <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/dashboard/owner" className="flex items-center gap-2 group">
          <SLOTSLogo
            size="small"
            showPing={true}
            className="hover:scale-105 transition-transform duration-300"
          />
        </Link>

        <div className="hidden md:flex items-center space-x-1 rounded-full border border-white/10 bg-white/5 p-1">
          {ownerLinks.map((link) => {
            const isActive = pathname === link.href
            return (
              <Link key={link.name} href={link.href} className="relative px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200">
                {isActive && <motion.div layoutId="owner-nav-indicator" className="absolute inset-0 rounded-full bg-indigo-600" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />}
                <span className={`relative z-10 ${isActive ? "text-white" : "text-slate-300"}`}>{link.name}</span>
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-4">
          <div className="relative hidden lg:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search bookings..."
              className="h-9 w-64 rounded-full border border-white/10 bg-white/5 pl-10 text-sm text-white placeholder:text-slate-400 focus-visible:ring-0"
            />
          </div>

          <Button variant="ghost" size="icon" className="relative rounded-full text-slate-300 hover:text-white">
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full border-2 border-slate-950" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-3 pl-2 pr-4 py-1 rounded-full border border-transparent hover:bg-white/5 hover:border-white/5 transition-all">
                <Avatar className="h-8 w-8 ring-2 ring-white/10" style={{ boxShadow: "0 0 0 2px rgba(108, 92, 231, 0.18)" }}>
                  <AvatarFallback className="bg-gradient-to-br from-indigo-600 to-violet-500 text-white text-xs font-bold">{userInitial}</AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start leading-none">
                  <span className="text-sm font-semibold text-white">{lotDetails.name}</span>
                  <span className="text-[10px] font-medium tracking-wide text-slate-400">{Role.OWNER}</span>
                </div>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-40 shadow-xl rounded-xl p-1 border border-white/10 bg-slate-950 text-white">
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem className="text-red-400 cursor-pointer" onClick={() => signOut({ callbackUrl: "/" })}>Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.nav>
  )
}
