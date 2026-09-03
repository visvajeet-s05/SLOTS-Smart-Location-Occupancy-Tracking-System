"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"

type Slot = {
  id: string
  slotNumber: number
  row: string
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "DISABLED" | "CLOSED"
  aiConfidence: number
  updatedBy: "AI" | "OWNER" | "CUSTOMER" | "SYSTEM"
  updatedAt: string
  price: number
  slotType?: string
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.02
    }
  }
}

const itemVariants = {
  hidden: { 
    opacity: 0, 
    translateZ: -80, 
    rotateX: 4 
  },
  visible: { 
    opacity: 1, 
    translateZ: 0, 
    rotateX: 0,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1]
    }
  }
}

export default function SlotGrid({
  slots,
  selectable,
  onSelect,
  isStale = false
}: {
  slots: Slot[]
  selectable: boolean
  onSelect?: (slot: Slot) => void
  isStale?: boolean
}) {
  const [animatingSlots, setAnimatingSlots] = useState<Set<string>>(new Set())
  const [isReducedMotion, setIsReducedMotion] = useState(false)

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setIsReducedMotion(mediaQuery.matches)
    const handler = () => setIsReducedMotion(mediaQuery.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  const getSlotStyle = (status: string, slotType?: string) => {
    // Base styles by status
    let baseStyle
    if (status === "AVAILABLE") {
      baseStyle = {
        bg: "rgba(52, 211, 153, 0.12)",
        border: "rgba(52, 211, 153, 0.4)",
        text: "text-emerald-400",
        cursor: "cursor-pointer",
        hover: "hover:bg-emerald-500/20 hover:border-emerald-500/60 hover:shadow-lg hover:shadow-emerald-900/20"
      }
    } else if (status === "OCCUPIED") {
      baseStyle = {
        bg: "rgba(239, 68, 68, 0.10)",
        border: "rgba(239, 68, 68, 0.3)",
        text: "text-red-400/50",
        cursor: "cursor-not-allowed",
        hover: ""
      }
    } else if (status === "RESERVED") {
      baseStyle = {
        bg: "rgba(245, 158, 11, 0.10)",
        border: "rgba(245, 158, 11, 0.3)",
        text: "text-amber-400/50",
        cursor: "cursor-not-allowed",
        hover: ""
      }
    } else if (status === "DISABLED") {
      baseStyle = {
        bg: "rgba(71, 85, 105, 0.3)",
        border: "rgba(71, 85, 105, 0.4)",
        text: "text-slate-500",
        cursor: "cursor-not-allowed",
        hover: ""
      }
    } else if (status === "CLOSED") {
      baseStyle = {
        bg: "rgba(0, 0, 0, 0.5)",
        border: "rgba(127, 29, 29, 0.4)",
        text: "text-red-900",
        cursor: "cursor-not-allowed",
        hover: ""
      }
    } else {
      baseStyle = {
        bg: "rgba(71, 85, 105, 0.3)",
        border: "rgba(71, 85, 105, 0.4)",
        text: "text-slate-500",
        cursor: "cursor-not-allowed",
        hover: ""
      }
    }

    // Apply slot type-specific color overrides
    if (slotType === "EV" && status === "AVAILABLE") {
      return {
        ...baseStyle,
        bg: "rgba(6, 182, 212, 0.15)", // Cyan for EV
        border: "rgba(6, 182, 212, 0.5)",
        text: "text-cyan-400",
        hover: "hover:bg-cyan-500/20 hover:border-cyan-500/60 hover:shadow-lg hover:shadow-cyan-900/20"
      }
    }
    
    if (slotType === "ACCESSIBLE" && status === "AVAILABLE") {
      return {
        ...baseStyle,
        bg: "rgba(59, 130, 246, 0.15)", // Blue for Accessible
        border: "rgba(59, 130, 246, 0.5)",
        text: "text-blue-400",
        hover: "hover:bg-blue-500/20 hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-900/20"
      }
    }

    return baseStyle
  }

  const getSlotIcon = (status: string, slotType?: string) => {
    // Show icons for EV and Accessible regardless of status
    if (slotType === "EV") return "⚡"
    if (slotType === "ACCESSIBLE") return "♿"
    return ""
  }

  return (
    <div className="space-y-6">
      {/* Premium Legend */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs font-medium justify-center items-center">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
          <span className="text-emerald-400">Available</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
          <span className="text-cyan-400">⚡</span>
          <span className="text-cyan-400">EV Charging</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
          <span className="text-amber-400">Reserved</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>
          <span className="text-red-400/50">Occupied</span>
        </div>
      </div>

      {/* Slot Grid - Medium Sized */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={`grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3 ${isStale ? 'opacity-50 grayscale pointer-events-none' : ''}`}
      >
        {slots.map((slot) => {
          const slotStyle = getSlotStyle(slot.status, slot.slotType)
          const isAnimating = animatingSlots.has(slot.id)
          return (
          <motion.button
            key={slot.id}
            variants={itemVariants}
            whileHover={slot.status === "AVAILABLE" && !isStale ? { 
              scale: 1.05, 
              y: -2,
              transition: { duration: isReducedMotion ? 0 : 0.2 }
            } : {}}
            whileTap={slot.status === "AVAILABLE" && !isStale ? { 
              scale: isReducedMotion ? 1 : [1, 1.03, 1],
              transition: { duration: isReducedMotion ? 0 : 0.15 }
            } : {}}
            disabled={!selectable || slot.status !== "AVAILABLE" || isStale}
            onClick={() => onSelect?.(slot)}
            className={`
              h-20 rounded-xl relative flex flex-col items-center justify-center transition-all duration-300 border
              ${slotStyle.cursor}
              ${slotStyle.hover}
            `}
            style={{
              background: slotStyle.bg,
              borderColor: slotStyle.border,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              transition: isReducedMotion ? 'none' : 'all 0.3s ease'
            }}
          >
            {/* Color cross-fade animation for state changes */}
            {isAnimating && !isReducedMotion && (
              <motion.div
                className="absolute inset-0 rounded-xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.5, 0] }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                style={{
                  background: slot.status === "AVAILABLE" ? "rgba(52, 211, 153, 0.3)" :
                         slot.status === "OCCUPIED" ? "rgba(229, 72, 77, 0.3)" :
                         slot.status === "RESERVED" ? "rgba(245, 158, 11, 0.3)" :
                         "rgba(51, 65, 85, 0.3)"
                }}
              />
            )}

            {/* Slot Type Icon */}
            {getSlotIcon(slot.status, slot.slotType) && (
              <span className={`absolute top-2 left-2 text-xs opacity-75 relative z-10 ${slotStyle.text}`}>
                {getSlotIcon(slot.status, slot.slotType)}
              </span>
            )}

            {/* Slot Number */}
            <span className={`text-lg font-black tracking-tighter relative z-10 ${slotStyle.text}`}>
              S{slot.slotNumber}
            </span>

            {/* Price (only show if available) */}
            {slot.status === "AVAILABLE" && (
              <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded-full mt-1 font-medium relative z-10 text-emerald-300">
                ₹{slot.price}/hr
              </span>
            )}

            {/* Status indicator for non-available */}
            {slot.status !== "AVAILABLE" && (
              <span className={`text-[8px] uppercase tracking-widest absolute bottom-2 font-bold opacity-50 relative z-10 ${slotStyle.text}`}>
                {slot.status}
              </span>
            )}

            {/* Car Icon for Occupied */}
            {slot.status === "OCCUPIED" && (
              <div className="absolute inset-0 flex items-center justify-center opacity-20 relative z-10">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /><path d="M2 12h12" /></svg>
              </div>
            )}
          </motion.button>
        )})}
      </motion.div>
    </div>
  )
}
