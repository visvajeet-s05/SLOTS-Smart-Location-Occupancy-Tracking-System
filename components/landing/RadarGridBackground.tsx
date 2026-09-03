"use client"

import { useEffect, useState, useRef } from "react"
import { motion } from "framer-motion"
import LiveOccupancyGrid from "./LiveOccupancyGrid"

interface RadarGridBackgroundProps {
  className?: string
  showOccupancyGrid?: boolean
}

export default function RadarGridBackground({ className = "", showOccupancyGrid = true }: RadarGridBackgroundProps) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [pingMarkers, setPingMarkers] = useState<Array<{ id: number; x: number; y: number }>>([])
  const containerRef = useRef<HTMLDivElement>(null)

  // Mouse parallax effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      
      const rect = containerRef.current.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 20 // Max 10px shift
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 20
      
      setMousePosition({ x, y })
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [])

  // Generate random ping markers
  useEffect(() => {
    const generatePing = () => {
      const newPing = {
        id: Date.now(),
        x: Math.random() * 100,
        y: Math.random() * 100
      }
      setPingMarkers(prev => [...prev.slice(-3), newPing]) // Keep max 4 pings
      
      // Remove ping after animation
      setTimeout(() => {
        setPingMarkers(prev => prev.filter(p => p.id !== newPing.id))
      }, 3000)
    }

    const interval = setInterval(generatePing, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={{ background: "var(--bg-void)" }}
    >
      {/* Live Occupancy Grid Background (blurred, low opacity) */}
      {showOccupancyGrid && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative" style={{ transform: "scale(3)", opacity: 0.15, filter: "blur(2px)" }}>
            <LiveOccupancyGrid rows={4} cols={8} opacity={1} scale={1} />
          </div>
        </div>
      )}

      {/* Perspective Grid Plane */}
      <motion.div
        className="absolute inset-0"
        animate={{
          x: mousePosition.x * 0.5,
          y: mousePosition.y * 0.5
        }}
        transition={{ type: "spring", damping: 20, stiffness: 100 }}
      >
        {/* Grid Lines - Enhanced visibility */}
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ opacity: 0.12 }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="grid"
              width="50"
              height="50"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 50 0 L 0 0 0 50"
                fill="none"
                stroke="var(--metal-500)"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Radar Sweep Line - Enhanced visibility */}
        <motion.div
          className="absolute inset-0"
          animate={{
            rotate: [0, 360]
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "linear"
          }}
          style={{
            transformOrigin: "center",
            opacity: 0.2
          }}
        >
          <svg
            className="absolute inset-0 w-full h-full"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="sweepGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
                <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.5" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line
              x1="50%"
              y1="50%"
              x2="100%"
              y2="50%"
              stroke="url(#sweepGradient)"
              strokeWidth="3"
              transform="rotate(0, 50%, 50%)"
            />
          </svg>
        </motion.div>

        {/* Occupancy Ping Markers - Enhanced with visible pulse */}
        {pingMarkers.map((ping) => (
          <motion.div
            key={ping.id}
            className="absolute"
            style={{
              left: `${ping.x}%`,
              top: `${ping.y}%`,
              transform: "translate(-50%, -50%)"
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Center dot */}
            <div
              className="absolute w-2 h-2 rounded-full"
              style={{
                background: "var(--accent)",
                boxShadow: "0 0 15px var(--accent)"
              }}
            />
            
            {/* Expanding ring - more visible */}
            <motion.div
              className="absolute inset-0 rounded-full border-2"
              style={{
                borderColor: "var(--accent)",
                width: "100%",
                height: "100%"
              }}
              animate={{
                scale: [1, 3],
                opacity: [1, 0]
              }}
              transition={{
                duration: 2.5,
                ease: "easeOut"
              }}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Ambient Glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(108, 108, 244, 0.08) 0%, transparent 50%)"
        }}
      />
    </div>
  )
}
