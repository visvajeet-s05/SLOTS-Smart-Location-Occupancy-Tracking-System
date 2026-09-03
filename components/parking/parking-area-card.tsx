"use client"

import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { MapPin, Star, Navigation2, Clock, TrendingUp, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { memo } from "react"

interface ParkingAreaCardProps {
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
  isSelected?: boolean
  onSelect?: () => void
}

function ParkingAreaCard({
  parkingArea,
  isSelected = false,
  onSelect,
}: ParkingAreaCardProps) {
  const router = useRouter()
  const occupancyPercent = Math.round((parkingArea.availableSlots / parkingArea.totalSlots) * 100)
  const availabilityPercent = (parkingArea.availableSlots / parkingArea.totalSlots) * 100

  const handleViewDetails = () => {
    router.push(`/dashboard/parking/${parkingArea.id}`)
  }

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

  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onClick={onSelect}
      className={cn(
        "group relative h-full bg-slate-900/40 backdrop-blur-md rounded-3xl border transition-all duration-300 cursor-pointer overflow-hidden flex flex-col",
        isSelected
          ? "border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/30"
          : "border-white/5 hover:border-white/10 hover:shadow-2xl hover:shadow-purple-500/5"
      )}
    >
      {/* Cinematic Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent opacity-100 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-purple-500/0 via-purple-500/0 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative p-4 md:p-6 space-y-4 md:space-y-5 flex-1 flex flex-col z-10">
        {/* Header - Name & Status */}
        <div className="space-y-2 md:space-y-3">
          <div className="flex items-start justify-between gap-2 md:gap-3">
            <h3 className="text-lg md:text-xl font-bold text-white line-clamp-2 leading-tight group-hover:text-purple-200 transition-colors tracking-tight">
              {parkingArea.name}
            </h3>
          </div>
          <div className="flex items-center justify-between">
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
              <span className="text-[10px] font-bold tracking-wide text-emerald-300 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                NEARBY
              </span>
            )}
          </div>
        </div>

        {/* Location */}
        <div className="flex items-start gap-3 text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
          <MapPin className="w-4 h-4 mt-0.5 text-purple-400/80 shrink-0" />
          <span className="line-clamp-2 leading-relaxed">{parkingArea.address}</span>
        </div>

        {/* Availability Bar with Glow */}
        <div className="space-y-2 bg-black/20 p-4 rounded-2xl border border-white/5 group-hover:border-white/10 transition-colors">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Availability</span>
            <span className="font-bold text-white">
              <span className={cn(
                availabilityPercent > 50 ? "text-emerald-400" : availabilityPercent > 20 ? "text-amber-400" : "text-red-400"
              )}>{parkingArea.availableSlots}</span>
              <span className="text-slate-600 text-xs ml-1">/ {parkingArea.totalSlots}</span>
            </span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${availabilityPercent}%` }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className={cn(
                "h-full rounded-full transition-all shadow-lg relative overflow-hidden",
                availabilityPercent > 50
                  ? "bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-emerald-500/20"
                  : availabilityPercent > 20
                    ? "bg-gradient-to-r from-amber-600 to-amber-400 shadow-amber-500/20"
                    : "bg-gradient-to-r from-red-600 to-red-400 shadow-red-500/20"
              )}
            >
              <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]" style={{ transform: 'skewX(-20deg)', left: '-100%' }} />
            </motion.div>
          </div>
        </div>

        {/* Minimal Info Grid */}
        <div className="grid grid-cols-2 gap-2 mt-auto">
          {/* Price */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 hover:bg-white/[0.07] transition-colors">
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Price/Hr</p>
            <p className="text-lg font-bold text-white">₹{parkingArea.price}</p>
          </div>

          {/* Rating */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 hover:bg-white/[0.07] transition-colors">
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Rating</p>
            <div className="flex items-center gap-1.5">
              {parkingArea.rating > 0 ? (
                <>
                  <span className="text-lg font-bold text-white">{parkingArea.rating}</span>
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                </>
              ) : (
                <span className="text-sm font-bold text-slate-400">New</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CTA Button */}
      <div className="p-4 md:p-6 pt-0 mt-auto w-full relative z-10">
        <Button
          onClick={(e) => {
            e.stopPropagation()
            handleViewDetails()
          }}
          className={cn(
            "w-full font-bold tracking-wide transition-all duration-300 py-6 rounded-xl border relative overflow-hidden group/btn",
            isSelected
              ? "bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-900/20"
              : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white"
          )}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {isSelected ? "Currently Viewing" : "View Details"}
            {!isSelected && <Navigation2 className="w-4 h-4 opacity-50 -ml-1 group-hover/btn:translate-x-1 transition-transform" />}
          </span>
        </Button>
      </div>

      {/* Active Indicator Pulse */}
      {isSelected && (
        <div className="absolute top-4 right-4 z-20">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500 box-shadow-[0_0_10px_rgba(168,85,247,0.5)]"></span>
          </span>
        </div>
      )}
    </motion.div>
  )
}

export default memo(ParkingAreaCard)

