"use client"

import { motion } from "framer-motion"
import { MapPin, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { memo } from "react"

interface ParkingAreaRowProps {
  parkingArea: {
    id: string
    name: string
    address: string
    availableSlots: number
    totalSlots: number
    price: number
    rating: number
    distance: number
    status: "available" | "limited" | "full"
  }
  onClick: () => void
  index: number
}

function ParkingAreaRow({
  parkingArea,
  onClick,
  index,
}: ParkingAreaRowProps) {
  const availabilityPercent = (parkingArea.availableSlots / parkingArea.totalSlots) * 100

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-500/20 text-green-400 border-green-500/50"
      case "limited":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
      case "full":
        return "bg-red-500/20 text-red-400 border-red-500/50"
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/50"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "available":
        return "Available"
      case "limited":
        return "Limited Spaces"
      case "full":
        return "Full"
      default:
        return "Unknown"
    }
  }

  const getAvailabilityColor = (percent: number) => {
    if (percent > 50) return "from-emerald-600 to-emerald-400 shadow-emerald-500/20"
    if (percent > 20) return "from-amber-600 to-amber-400 shadow-amber-500/20"
    return "from-red-600 to-red-400 shadow-red-500/20"
  }

  const getAvailabilityTextColor = (percent: number) => {
    if (percent > 50) return "text-emerald-400"
    if (percent > 20) return "text-amber-400"
    return "text-red-400"
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, translateZ: -100, rotateX: 6 }}
      animate={{ opacity: 1, y: 0, translateZ: 0, rotateX: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
      whileHover={{ y: -4, scale: 1.01 }}
      onClick={onClick}
      className="group relative rounded-2xl p-5 backdrop-blur-md transition-all duration-300 cursor-pointer overflow-hidden"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-glass)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)"
      }}
    >
      {/* Hover gradient overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: "linear-gradient(135deg, var(--accent-glow) 0%, transparent 50%)" }}
      />

      <div className="relative z-10 flex flex-col gap-3">
        {/* Header: Name and Status */}
        <div className="space-y-2">
          <h3 className="text-base font-bold truncate" style={{ color: "var(--text-primary)" }}>
            {parkingArea.name}
          </h3>
        </div>

        {/* Address */}
        <div className="flex items-start gap-2 text-xs truncate" style={{ color: "var(--text-secondary)" }}>
          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
          <span className="truncate">{parkingArea.address}</span>
        </div>

        {/* Availability Bar */}
        <div className="space-y-1.5 p-3 rounded-lg border" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>Availability</span>
            <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
              <span className={getAvailabilityTextColor(availabilityPercent)}>{parkingArea.availableSlots}</span>
              <span className="text-[10px] ml-0.5" style={{ color: "var(--text-muted)" }}>/ {parkingArea.totalSlots}</span>
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-void)" }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${availabilityPercent}%` }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className={cn(
                "h-full rounded-full transition-all shadow-lg relative overflow-hidden bg-gradient-to-r",
                getAvailabilityColor(availabilityPercent)
              )}
            >
              <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]" style={{ transform: 'skewX(-20deg)', left: '-100%' }} />
            </motion.div>
          </div>
        </div>

        {/* Price and Rating */}
        <div className="flex gap-2">
          <div className="flex-1 p-2 rounded-lg border text-center" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
            <p className="text-[10px] uppercase font-bold tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>Price/Hr</p>
            <p className="text-base font-bold" style={{ color: "var(--text-primary)" }}>₹{parkingArea.price}</p>
          </div>
          <div className="flex-1 p-2 rounded-lg border text-center" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
            <p className="text-[10px] uppercase font-bold tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>Rating</p>
            <div className="flex items-center justify-center gap-1">
              {parkingArea.rating > 0 ? (
                <>
                  <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{parkingArea.rating}</span>
                  <Star className="w-3 h-3" style={{ color: "#E0B989", fill: "#E0B989" }} />
                </>
              ) : (
                <span className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>New</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default memo(ParkingAreaRow)
