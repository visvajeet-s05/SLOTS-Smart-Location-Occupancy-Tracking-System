"use client"

import { motion } from "framer-motion"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button as ShadcnButton } from "@/components/ui/button"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline"
  size?: "sm" | "md" | "lg"
  loading?: boolean
  children: React.ReactNode
  ariaLabel?: string
}

export default function Button({ 
  variant = "primary", 
  size = "md", 
  loading = false,
  className,
  children,
  disabled,
  ariaLabel,
  ...props 
}: ButtonProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case "primary":
        return {
          bg: "var(--accent)",
          hoverBg: "var(--accent-hover)",
          color: "var(--text-primary)",
          shadow: "shadow-lg shadow-indigo-600/30"
        }
      case "secondary":
        return {
          bg: "var(--bg-surface)",
          hoverBg: "var(--bg-card)",
          color: "var(--text-primary)",
          shadow: "shadow-lg"
        }
      case "ghost":
        return {
          bg: "transparent",
          hoverBg: "rgba(255, 255, 255, 0.05)",
          color: "var(--text-secondary)",
          shadow: "none"
        }
      case "danger":
        return {
          bg: "rgba(239, 68, 68, 0.1)",
          hoverBg: "rgba(239, 68, 68, 0.2)",
          color: "#EF4444",
          shadow: "shadow-lg shadow-red-600/20"
        }
      case "outline":
        return {
          bg: "transparent",
          hoverBg: "rgba(255, 255, 255, 0.05)",
          color: "var(--text-primary)",
          shadow: "none",
          border: "1px solid var(--border-glass)"
        }
      default:
        return {
          bg: "var(--accent)",
          hoverBg: "var(--accent-hover)",
          color: "var(--text-primary)",
          shadow: "shadow-lg"
        }
    }
  }

  const getSizeStyles = () => {
    switch (size) {
      case "sm":
        return "px-4 py-2 text-sm"
      case "lg":
        return "px-8 py-4 text-lg"
      default:
        return "px-6 py-3 text-base"
    }
  }

  const styles = getVariantStyles()
  const sizeStyles = getSizeStyles()

  return (
    <motion.button
      whileHover={{ scale: loading ? 1 : 1.02 }}
      whileTap={{ scale: loading ? 1 : 0.98 }}
      disabled={disabled || loading}
      className={cn(
        "relative font-bold rounded-xl transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0A0A14]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        sizeStyles,
        className
      )}
      style={{
        background: styles.bg,
        color: styles.color,
        boxShadow: styles.shadow,
        border: styles.border || "none"
      }}
      aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
      {...props}
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span>Loading...</span>
        </div>
      ) : (
        children
      )}
    </motion.button>
  )
}