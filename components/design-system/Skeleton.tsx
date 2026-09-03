"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface SkeletonProps {
  className?: string
  variant?: "text" | "circular" | "rectangular"
  width?: string
  height?: string
}

export default function Skeleton({ 
  className, 
  variant = "rectangular",
  width,
  height 
}: SkeletonProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case "text":
        return {
          borderRadius: "4px",
          height: height || "1em",
          width: width || "100%"
        }
      case "circular":
        return {
          borderRadius: "50%",
          height: height || "40px",
          width: width || "40px"
        }
      case "rectangular":
      default:
        return {
          borderRadius: "8px",
          height: height || "100px",
          width: width || "100%"
        }
    }
  }

  const styles = getVariantStyles()

  return (
    <motion.div
      animate={{
        opacity: [0.4, 0.8, 0.4]
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut"
      }}
      className={cn("animate-pulse", className)}
      style={{
        background: "var(--bg-surface)",
        ...styles
      }}
    />
  )
}

// Card skeleton for parking listings
export function ParkingCardSkeleton() {
  return (
    <div className="rounded-2xl p-6 border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
      <div className="space-y-4">
        <div className="flex justify-between items-start">
          <div className="space-y-2 flex-1">
            <Skeleton variant="text" width="70%" height="24px" />
            <Skeleton variant="text" width="50%" height="16px" />
          </div>
          <Skeleton variant="rectangular" width="60px" height="24px" />
        </div>
        
        <Skeleton variant="text" width="100%" height="16px" />
        
        <div className="space-y-2">
          <Skeleton variant="text" width="30%" height="14px" />
          <Skeleton variant="rectangular" width="100%" height="8px" />
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <Skeleton variant="rectangular" height="60px" />
          <Skeleton variant="rectangular" height="60px" />
        </div>
      </div>
    </div>
  )
}

// Stat card skeleton
export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl p-5 border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton variant="text" width="40%" height="12px" />
          <Skeleton variant="text" width="60%" height="32px" />
        </div>
        <Skeleton variant="circular" width="48px" height="48px" />
      </div>
    </div>
  )
}