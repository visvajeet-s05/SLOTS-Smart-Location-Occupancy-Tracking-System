"use client"

import { useState, useEffect } from "react"

interface SLOTSLogoProps {
  className?: string
  size?: "small" | "default" | "large"
  showPing?: boolean
  animateGrid?: boolean
}

export default function SLOTSLogo({ className = "", size = "default", showPing = true, animateGrid = false }: SLOTSLogoProps) {
  const [pingActive, setPingActive] = useState(false)
  const [activeGridCell, setActiveGridCell] = useState<number | null>(null)

  useEffect(() => {
    if (!showPing) return

    // Trigger ping animation every 3-4 seconds
    const interval = setInterval(() => {
      setPingActive(true)
      setTimeout(() => setPingActive(false), 3000)
    }, 4000)

    return () => clearInterval(interval)
  }, [showPing])

  // Subtle grid animation - cycle through grid cells
  useEffect(() => {
    if (!animateGrid) return

    const gridInterval = setInterval(() => {
      setActiveGridCell(Math.floor(Math.random() * 4))
      setTimeout(() => setActiveGridCell(null), 2000)
    }, 12000) // 12 second cycle

    return () => clearInterval(gridInterval)
  }, [animateGrid])

  const sizeClasses = {
    small: "w-8 h-8",
    default: "w-10 h-10",
    large: "w-12 h-12"
  }

  const textSizeClasses = {
    small: "text-lg",
    default: "text-xl",
    large: "text-2xl"
  }

  const taglineSizeClasses = {
    small: "text-[6px]",
    default: "text-[8px]",
    large: "text-[10px]"
  }

  const gridPositions = [
    { x: 17, y: 13 }, // Top-left
    { x: 21, y: 13 }, // Top-right
    { x: 17, y: 17 }, // Bottom-left
    { x: 21, y: 17 }, // Bottom-right
  ]

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Logo Mark with Ping Animation */}
      <div className="relative">
        {/* Ping Ring */}
        {showPing && pingActive && (
          <div className="absolute inset-0 rounded-full border-2 animate-radar-ping" style={{ borderColor: "var(--accent)" }} />
        )}
        
        {/* Location Pin Icon */}
        <div className={`${sizeClasses[size]} relative flex items-center justify-center`}>
          <svg
            viewBox="0 0 40 40"
            fill="none"
            className="w-full h-full"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Location Pin Outline */}
            <path
              d="M20 2C11.7157 2 5 8.71573 5 17C5 27.5 20 38 20 38C20 38 35 27.5 35 17C35 8.71573 28.2843 2 20 2Z"
              stroke="var(--metal-100)"
              strokeWidth="2"
              fill="none"
            />
            
            {/* Concentric Ring */}
            <circle
              cx="20"
              cy="16"
              r="6"
              stroke="var(--metal-100)"
              strokeWidth="1.5"
              fill="none"
            />
            
            {/* 2x2 Grid (Occupancy Bays) */}
            {gridPositions.map((pos, index) => (
              <g key={index}>
                <rect
                  x={pos.x}
                  y={pos.y}
                  width="2"
                  height="2"
                  fill={activeGridCell === index ? "var(--accent-signal)" : "var(--metal-100)"}
                  style={{
                    transition: activeGridCell === index ? "fill 0.3s ease-out" : "fill 0.5s ease-in"
                  }}
                />
                {/* Glow for active cell */}
                {activeGridCell === index && (
                  <circle
                    cx={pos.x + 1}
                    cy={pos.y + 1}
                    r="3"
                    fill="var(--accent)"
                    opacity="0.3"
                  />
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Wordmark and Tagline */}
      <div className="flex flex-col">
        <span
          className={`${textSizeClasses[size]} font-black tracking-tight text-[var(--text-primary)]`}
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          SLOTS
        </span>
        <span
          className={`${taglineSizeClasses[size]} font-medium tracking-[0.15em] text-[var(--metal-500)] uppercase`}
          style={{ fontFamily: 'Inter, monospace', letterSpacing: '0.1em' }}
        >
          Smart Location Occupancy Tracking System
        </span>
      </div>
    </div>
  )
}
