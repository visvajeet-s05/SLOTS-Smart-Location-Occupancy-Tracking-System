"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface CardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  elevated?: boolean
  onClick?: () => void
}

export default function Card({ 
  children, 
  className, 
  hover = true, 
  elevated = false,
  onClick 
}: CardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -4, scale: 1.02 } : undefined}
      transition={{ duration: 0.2, ease: "easeOut" }}
      onClick={onClick}
      className={cn(
        "rounded-2xl backdrop-blur-md transition-all duration-300 relative overflow-hidden",
        "border",
        elevated ? "shadow-xl" : "shadow-lg",
        hover && "cursor-pointer group",
        className
      )}
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-glass)",
        boxShadow: elevated 
          ? "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 30px var(--accent-glow)"
          : "0 4px 12px rgba(0, 0, 0, 0.3), 0 0 20px var(--accent-glow)"
      }}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
           style={{ background: "linear-gradient(135deg, var(--accent-glow) 0%, transparent 50%)" }} />
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  )
}