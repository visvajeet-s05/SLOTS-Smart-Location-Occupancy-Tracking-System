"use client"

import { motion, AnimatePresence } from "framer-motion"
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface ToastProps {
  id: string
  type?: "success" | "error" | "warning" | "info"
  title: string
  message?: string
  duration?: number
  onClose?: (id: string) => void
}

export default function Toast({
  id,
  type = "info",
  title,
  message,
  duration = 5000,
  onClose
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(() => onClose?.(id), 300)
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, id, onClose])

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-400" />
      case "error":
        return <AlertCircle className="w-5 h-5 text-red-400" />
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-amber-400" />
      default:
        return <Info className="w-5 h-5 text-blue-400" />
    }
  }

  const getStyles = () => {
    switch (type) {
      case "success":
        return {
          border: "rgba(34, 197, 94, 0.3)",
          bg: "rgba(34, 197, 94, 0.1)",
          icon: "text-green-400"
        }
      case "error":
        return {
          border: "rgba(239, 68, 68, 0.3)",
          bg: "rgba(239, 68, 68, 0.1)",
          icon: "text-red-400"
        }
      case "warning":
        return {
          border: "rgba(245, 158, 11, 0.3)",
          bg: "rgba(245, 158, 11, 0.1)",
          icon: "text-amber-400"
        }
      default:
        return {
          border: "rgba(108, 92, 231, 0.3)",
          bg: "rgba(108, 92, 231, 0.1)",
          icon: "text-indigo-400"
        }
    }
  }

  const styles = getStyles()

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 100, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 100, scale: 0.9 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative overflow-hidden rounded-xl border backdrop-blur-md shadow-lg"
          style={{
            background: styles.bg,
            borderColor: styles.border,
            minWidth: "320px"
          }}
        >
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {getIcon()}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                  {title}
                </h4>
                {message && (
                  <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                    {message}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setIsVisible(false)
                  setTimeout(() => onClose?.(id), 300)
                }}
                className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* Progress bar */}
          <motion.div
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: duration / 1000, ease: "linear" }}
            className="absolute bottom-0 left-0 h-1"
            style={{
              background: styles.border.replace("0.3", "0.8")
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Toast container for managing multiple toasts
interface ToastContainerProps {
  toasts: ToastProps[]
  onClose: (id: string) => void
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast {...toast} onClose={onClose} />
        </div>
      ))}
    </div>
  )
}