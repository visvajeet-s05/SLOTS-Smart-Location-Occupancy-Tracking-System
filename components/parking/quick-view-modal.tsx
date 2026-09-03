"use client"

import { motion, AnimatePresence } from "framer-motion"
import { X, MapPin, Star, Zap, Clock, Navigation2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface QuickViewModalProps {
  isOpen: boolean
  onClose: () => void
  parkingArea: {
    id: string
    name: string
    address: string
    availableSlots: number
    totalSlots: number
    occupiedSlots: number
    reservedSlots: number
    price: number
    rating: number
    distance: number
    status: "available" | "limited" | "full"
    openingHours: string
  } | null
}

function QuickViewModal({ isOpen, onClose, parkingArea }: QuickViewModalProps) {
  if (!parkingArea) return null

  const availabilityPercent = (parkingArea.availableSlots / parkingArea.totalSlots) * 100
  const occupiedPercent = (parkingArea.occupiedSlots / parkingArea.totalSlots) * 100
  const reservedPercent = (parkingArea.reservedSlots / parkingArea.totalSlots) * 100

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
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, rotateX: 8, translateZ: -120, opacity: 0 }}
              animate={{ scale: 1, rotateX: 0, translateZ: 0, opacity: 1 }}
              exit={{ scale: 0.9, rotateX: 8, translateZ: -120, opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="relative w-full max-w-2xl rounded-2xl overflow-hidden"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-glass)", boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)" }}
            >
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-20 p-2 rounded-lg transition-transform hover:rotate-90"
                style={{ background: "var(--bg-surface)", color: "var(--text-muted)" }}
              >
                <X className="w-5 h-5" />
              </button>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Header */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                      {parkingArea.name}
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-lg border backdrop-blur-sm",
                        getStatusColor(parkingArea.status)
                      )}
                    >
                      <Zap className="w-3 h-3 mr-1.5" />
                      {getStatusText(parkingArea.status)}
                    </Badge>
                    {parkingArea.distance < 2 && (
                      <span className="text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-lg border backdrop-blur-sm" style={{ background: "rgba(52, 211, 153, 0.1)", color: "var(--status-available)", borderColor: "rgba(52, 211, 153, 0.3)" }}>
                        NEARBY
                      </span>
                    )}
                  </div>
                  <div className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
                    <span>{parkingArea.address}</span>
                  </div>
                </div>

                {/* Availability Breakdown */}
                <div className="p-5 rounded-xl border space-y-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Availability</span>
                    <span className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
                      <span className={getAvailabilityTextColor(availabilityPercent)}>{parkingArea.availableSlots}</span>
                      <span className="text-sm ml-1" style={{ color: "var(--text-muted)" }}>/ {parkingArea.totalSlots} spots</span>
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-void)" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${availabilityPercent}%` }}
                      transition={{ duration: 0.8 }}
                      className={cn(
                        "h-full rounded-full transition-all shadow-lg bg-gradient-to-r",
                        getAvailabilityColor(availabilityPercent)
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-2 rounded-lg" style={{ background: "var(--bg-void)" }}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Free</p>
                      <p className="text-lg font-bold" style={{ color: "var(--status-available)" }}>{parkingArea.availableSlots}</p>
                    </div>
                    <div className="p-2 rounded-lg" style={{ background: "var(--bg-void)" }}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Occupied</p>
                      <p className="text-lg font-bold" style={{ color: "var(--text-secondary)" }}>{parkingArea.occupiedSlots}</p>
                    </div>
                    <div className="p-2 rounded-lg" style={{ background: "var(--bg-void)" }}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Reserved</p>
                      <p className="text-lg font-bold" style={{ color: "var(--text-secondary)" }}>{parkingArea.reservedSlots}</p>
                    </div>
                  </div>
                </div>

                {/* Price, Rating, Hours */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border text-center" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                    <p className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Price/Hr</p>
                    <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>₹{parkingArea.price}</p>
                  </div>
                  <div className="p-4 rounded-xl border text-center" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                    <p className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Rating</p>
                    <div className="flex items-center justify-center gap-1.5">
                      {parkingArea.rating > 0 ? (
                        <>
                          <span className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{parkingArea.rating}</span>
                          <Star className="w-5 h-5" style={{ color: "#E0B989", fill: "#E0B989" }} />
                        </>
                      ) : (
                        <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Not yet rated</span>
                      )}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border text-center" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                    <p className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Hours</p>
                    <div className="flex items-center justify-center gap-1.5">
                      <Clock className="w-5 h-5" style={{ color: "var(--accent)" }} />
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{parkingArea.openingHours}</span>
                    </div>
                  </div>
                </div>

                {/* CTA Button */}
                <Button
                  onClick={() => {
                    // Navigate to booking flow
                    window.location.href = `/dashboard/parking/${parkingArea.id}`
                  }}
                  className="w-full font-bold tracking-wide py-6 rounded-xl transition-all duration-300 relative overflow-hidden group"
                  style={{ background: "var(--accent)", color: "var(--text-primary)", border: "1px solid var(--border-glow)" }}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    View Available Spots
                    <Navigation2 className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(135deg, var(--accent-glow) 0%, transparent 50%)" }} />
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

export default QuickViewModal
