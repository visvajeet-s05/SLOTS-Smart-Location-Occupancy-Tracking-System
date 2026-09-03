"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { useSession, signOut } from "next-auth/react"
import { Search, Bell, Settings, User, LogOut } from "lucide-react"
import Image from "next/image"
import { OnlinePulse } from "@/components/ui/OnlinePulse"
import SLOTSLogo from "@/components/ui/SLOTSLogo"

export default function OwnerTopbar() {
  const { data: session } = useSession()

  const navigation = [
    { name: "Home", href: "/dashboard/owner" },
    { name: "Parking Lots", href: "/dashboard/owner/parking-lots" },
    { name: "Bookings", href: "/dashboard/owner/bookings" },
    { name: "Analytics", href: "/dashboard/owner/analytics" },
    { name: "Reports", href: "/dashboard/owner/reports" },
  ]

  const notifications = [
    { id: 1, type: "booking", message: "New booking received", time: "2 min ago" },
    { id: 2, type: "payment", message: "Payment received", time: "5 min ago" },
    { id: 3, type: "approval", message: "Parking lot approval pending", time: "1 hour ago" },
  ]

  return (
    <header className="h-16 border-b border-white/5 px-6 flex items-center justify-between bg-slate-950/40 backdrop-blur-xl sticky top-0 z-50">
      {/* LEFT: Logo */}
      <div className="flex items-center">
        <Link href="/dashboard/owner" className="flex items-center group">
          <SLOTSLogo size="small" />
        </Link>
      </div>

      {/* CENTER: Navigation */}
      <nav className="hidden md:flex items-center space-x-8">
        {navigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="text-sm font-medium text-slate-300 hover:text-indigo-400 transition-colors duration-200"
          >
            {item.name}
          </Link>
        ))}
      </nav>

      {/* RIGHT: Utility Zone */}
      <div className="flex items-center space-x-4">
        {/* Search */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
          <Input
            type="text"
            placeholder="Search bookings, lots, customers..."
            className="pl-10 pr-4 py-2 w-64 bg-slate-800 border-slate-700 text-white placeholder-slate-400 focus:border-indigo-500"
          />
        </div>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5 text-slate-300" />
              {notifications.length > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-indigo-600 text-white text-xs">
                  {notifications.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 bg-slate-800 border-slate-700">
            <DropdownMenuLabel className="text-white">Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-700" />
            {notifications.map((notification) => (
              <DropdownMenuItem key={notification.id} className="text-slate-300 hover:bg-slate-700 hover:text-white">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{notification.message}</p>
                  <p className="text-xs text-slate-400">{notification.time}</p>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Online Status */}
        <div className="hidden md:flex items-center gap-2 text-sm text-green-400">
          <OnlinePulse />
          Online
        </div>

        {/* Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center space-x-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src="" alt={session?.user?.email || ""} />
                <AvatarFallback className="bg-indigo-600 text-white">
                  {(session?.user?.email || "U")[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-white">{session?.user?.email}</p>
                <p className="text-xs text-slate-400">{session?.user?.role}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-slate-800 border-slate-700">
            <DropdownMenuLabel className="text-white">My Account</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem className="text-slate-300 hover:bg-slate-700 hover:text-white">
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-slate-300 hover:bg-slate-700 hover:text-white">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem
              className="text-slate-300 hover:bg-slate-700 hover:text-white"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
