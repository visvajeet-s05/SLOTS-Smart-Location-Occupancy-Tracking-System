"use client"

import { motion } from "framer-motion"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string | number
  icon?: LucideIcon
  color?: string
  glow?: string
  bg?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  delay?: number
  ariaLabel?: string
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  color = "var(--text-primary)",
  glow = "var(--accent-glow)",
  bg = "var(--bg-card)",
  trend,
  delay = 0,
  ariaLabel,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="group rounded-2xl p-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 relative overflow-hidden"
      style={{ 
        background: bg, 
        border: "1px solid var(--border-glass)", 
        boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3), 0 0 20px ${glow}` 
      }}
      role="article"
      aria-label={ariaLabel || `${label}: ${value}`}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" 
           style={{ background: `linear-gradient(135deg, ${glow} 0%, transparent 50%)` }} />
      
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
            {label}
          </p>
          <motion.p 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: delay + 0.2, ease: "easeOut" }}
            className="text-3xl font-bold transition-colors" 
            style={{ color }}
            aria-live="polite"
          >
            {typeof value === 'number' ? value.toLocaleString() : value}
          </motion.p>
          {trend && (
            <div className="flex items-center gap-1 mt-1">
              <span className={cn(
                "text-xs font-bold",
                trend.isPositive ? "text-green-400" : "text-red-400"
              )}>
                {trend.isPositive ? "+" : ""}{trend.value}%
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                vs last hour
              </span>
            </div>
          )}
        </div>
        
        {Icon && (
          <div className="p-3 rounded-xl transition-colors" style={{ background: "var(--accent-dim)" }} aria-hidden="true">
            <Icon className="h-6 w-6" style={{ color: "var(--accent)" }} />
          </div>
        )}
      </div>
    </motion.div>
  )
}