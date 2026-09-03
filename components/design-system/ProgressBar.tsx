"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface ProgressBarProps {
  value: number
  max: number
  className?: string
  showLabel?: boolean
  animated?: boolean
}

export default function ProgressBar({ 
  value, 
  max, 
  className, 
  showLabel = true,
  animated = true 
}: ProgressBarProps) {
  const percentage = Math.min((value / max) * 100, 100)
  
  const getStatusColor = () => {
    if (percentage > 50) return {
      bg: "from-emerald-600 to-emerald-400",
      shadow: "shadow-emerald-500/20"
    }
    if (percentage > 20) return {
      bg: "from-amber-600 to-amber-400", 
      shadow: "shadow-amber-500/20"
    }
    return {
      bg: "from-red-600 to-red-400",
      shadow: "shadow-red-500/20"
    }
  }

  const colors = getStatusColor()

  return (
    <div className={cn("space-y-2", className)}>
      {showLabel && (
        <div className="flex justify-between text-sm">
          <span className="text-xs uppercase font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>
            Availability
          </span>
          <span className="font-bold" style={{ color: "var(--text-primary)" }}>
            <span className={cn(
              percentage > 50 ? "text-emerald-400" : percentage > 20 ? "text-amber-400" : "text-red-400"
            )}>
              {value}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              / {max}
            </span>
          </span>
        </div>
      )}
      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-surface)" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: animated ? 0.8 : 0, delay: 0.2 }}
          className={cn(
            "h-full rounded-full transition-all shadow-lg relative overflow-hidden",
            `bg-gradient-to-r ${colors.bg}`,
            colors.shadow
          )}
        >
          <div 
            className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]" 
            style={{ transform: 'skewX(-20deg)', left: '-100%' }} 
          />
        </motion.div>
      </div>
    </div>
  )
}