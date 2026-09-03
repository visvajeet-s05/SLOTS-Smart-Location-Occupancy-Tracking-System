"use client"

import { motion } from "framer-motion"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import Button from "./Button"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex flex-col items-center justify-center py-20 rounded-3xl border border-dashed text-center",
        className
      )}
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-glass)"
      }}
    >
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
        style={{ background: "var(--bg-surface)" }}
      >
        <Icon className="w-10 h-10" style={{ color: "var(--text-muted)" }} />
      </motion.div>
      
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="max-w-md"
      >
        <h3 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        <p className="mb-6" style={{ color: "var(--text-secondary)" }}>
          {description}
        </p>
      </motion.div>
      
      {actionLabel && onAction && (
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          <Button onClick={onAction} style={{ background: "var(--accent)", color: "var(--text-primary)" }}>
            {actionLabel}
          </Button>
        </motion.div>
      )}
    </motion.div>
  )
}