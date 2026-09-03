"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface SemanticBadgeProps {
  status: "available" | "limited" | "full" | "upcoming" | "active" | "cancelled" | "completed"
  children: React.ReactNode
  className?: string
}

export default function SemanticBadge({ status, children, className }: SemanticBadgeProps) {
  const getStatusStyles = () => {
    switch (status) {
      case "available":
      case "active":
        return {
          bg: "rgba(34, 197, 94, 0.1)",
          color: "#22C55E",
          border: "rgba(34, 197, 94, 0.3)",
          glow: "rgba(34, 197, 94, 0.2)"
        }
      case "limited":
      case "upcoming":
        return {
          bg: "rgba(245, 158, 11, 0.1)",
          color: "#F59E0B",
          border: "rgba(245, 158, 11, 0.3)",
          glow: "rgba(245, 158, 11, 0.2)"
        }
      case "full":
      case "cancelled":
        return {
          bg: "rgba(239, 68, 68, 0.1)",
          color: "#EF4444",
          border: "rgba(239, 68, 68, 0.3)",
          glow: "rgba(239, 68, 68, 0.2)"
        }
      case "completed":
        return {
          bg: "rgba(199, 199, 218, 0.1)",
          color: "#C7C7DA",
          border: "rgba(199, 199, 218, 0.3)",
          glow: "rgba(199, 199, 218, 0.2)"
        }
      default:
        return {
          bg: "rgba(108, 92, 231, 0.1)",
          color: "#6C5CE7",
          border: "rgba(108, 92, 231, 0.3)",
          glow: "rgba(108, 92, 231, 0.2)"
        }
    }
  }

  const styles = getStatusStyles()

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border backdrop-blur-sm",
        className
      )}
      style={{
        background: styles.bg,
        color: styles.color,
        borderColor: styles.border,
        boxShadow: `0 0 15px ${styles.glow}`
      }}
    >
      {children}
    </motion.div>
  )
}