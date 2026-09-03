"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import SLOTSLogo from "@/components/ui/SLOTSLogo"
import {
  LayoutDashboard,
  BarChart3,
  Car,
  ClipboardList,
  QrCode,
  Wallet,
  Settings,
  LogOut,
  TrendingUp,
  Star,
  Wrench,
  Users,
  Bell,
  LifeBuoy,
  AlertTriangle,
  FileText,
  Receipt,
} from "lucide-react"

interface OwnerSidebarProps {
  onLogout: () => void
}

export default function OwnerSidebar({ onLogout }: OwnerSidebarProps) {
  const pathname = usePathname()

  const links = [
    {
      label: "Home",
      href: "/dashboard/owner",
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: "Analytics",
      href: "/dashboard/owner/analytics",
      icon: <BarChart3 size={18} />,
    },
    {
      label: "Insights",
      href: "/dashboard/owner/insights",
      icon: <BarChart3 size={18} />,
    },
    {
      label: "Parking Lots",
      href: "/dashboard/owner/parking-lots",
      icon: <Car size={18} />,
    },
    {
      label: "Bookings",
      href: "/dashboard/owner/bookings",
      icon: <ClipboardList size={18} />,
    },
    {
      label: "Reviews",
      href: "/dashboard/owner/reviews",
      icon: <Star size={18} />,
    },
    {
      label: "Incidents",
      href: "/dashboard/owner/incidents",
      icon: <AlertTriangle size={18} />,
    },
    {
      label: "Maintenance",
      href: "/dashboard/owner/maintenance",
      icon: <Wrench size={18} />,
    },
    {
      label: "Operations",
      href: "/dashboard/owner/operations/incidents",
      icon: <AlertTriangle size={18} />,
    },
    {
      label: "Staff",
      href: "/dashboard/owner/staff",
      icon: <Users size={18} />,
    },
    {
      label: "Reports",
      href: "/dashboard/owner/reports",
      icon: <FileText size={18} />,
    },
    {
      label: "QR Scanner",
      href: "/dashboard/owner/qr",
      icon: <QrCode size={18} />,
    },
    {
      label: "Finance",
      href: "/dashboard/owner/finance",
      icon: <Wallet size={18} />,
    },
    {
      label: "Invoices",
      href: "/dashboard/owner/invoices",
      icon: <FileText size={18} />,
    },
    {
      label: "Tax Reports",
      href: "/dashboard/owner/tax",
      icon: <Receipt size={18} />,
    },
    {
      label: "Promotions",
      href: "/dashboard/owner/promotions",
      icon: <TrendingUp size={18} />,
    },
    {
      label: "Notifications",
      href: "/dashboard/owner/notifications",
      icon: <Bell size={18} />,
    },
    {
      label: "Support",
      href: "/dashboard/owner/support",
      icon: <LifeBuoy size={18} />,
    },
    {
      label: "Settings",
      href: "/dashboard/owner/settings",
      icon: <Settings size={18} />,
    },
  ]

  return (
    <aside className="w-64 min-h-screen bg-gray-950 border-r border-gray-800 px-4 py-6 flex flex-col">
      {/* Header */}
      <div className="mb-8 px-2">
        <SLOTSLogo size="small" />
        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mt-2 ml-1 opacity-70">
          Owner Portal
        </div>
      </div>

      {/* Navigation */}
      <nav className="space-y-1 flex-1">
        {links.map((link) => {
          const isActive =
            pathname === link.href ||
            pathname.startsWith(link.href + "/")

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition
                ${
                  isActive
                    ? "bg-indigo-600/20 text-indigo-400"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }
              `}
            >
              {link.icon}
              <span>{link.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="pt-6 border-t border-gray-800">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm
                     text-red-400 hover:bg-red-500/10 transition"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  )
}
