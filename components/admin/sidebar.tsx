"use client"

import Link from "next/link"
import { Home, Users, CreditCard, MapPin, FileText, LogOut, Database, ShieldCheck } from "lucide-react"
import SLOTSLogo from "@/components/ui/SLOTSLogo"

export default function AdminSidebar({ onLogout }: { onLogout: () => void }) {
  const nav = [
    { key: 'overview', label: 'Overview', href: '/dashboard/admin', icon: Home },
    { key: 'bookings', label: 'Bookings', href: '/dashboard/admin/bookings', icon: FileText },
    { key: 'parking', label: 'Parking Areas', href: '/dashboard/admin/parking-areas', icon: MapPin },
    { key: 'users', label: 'Users', href: '/dashboard/admin/users', icon: Users },
    { key: 'verification', label: 'Owner Verification', href: '/dashboard/admin/verification', icon: ShieldCheck },
    { key: 'data', label: 'Analytics', href: '/dashboard/admin/analytics', icon: Database },
    { key: 'payments', label: 'Payments', href: '/dashboard/admin/payments', icon: CreditCard },
  ]

  return (
    <aside className="w-64 hidden lg:block border-r border-gray-800 bg-gray-900 min-h-screen p-4">
      <div className="mb-8 px-2">
        <SLOTSLogo size="small" />
        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mt-2 ml-1 opacity-70">
          Control Panel
        </div>
      </div>

      <nav className="space-y-1">
        {nav.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.key} href={item.href} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-800 text-sm text-gray-200">
              <Icon className="w-4 h-4 text-indigo-300" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-6 pt-4 border-t border-gray-800">
        <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-red-400 hover:bg-gray-800">
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  )
}
