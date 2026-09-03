"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"

interface BayState {
  id: number
  state: "available" | "occupied" | "vacating"
  lastChange: number
}

interface LiveOccupancyGridProps {
  rows?: number
  cols?: number
  opacity?: number
  scale?: number
  className?: string
}

export default function LiveOccupancyGrid({ 
  rows = 4, 
  cols = 8, 
  opacity = 1,
  scale = 1,
  className = "" 
}: LiveOccupancyGridProps) {
  const [bays, setBays] = useState<BayState[]>([])
  const animationRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize bays
  useEffect(() => {
    const initialBays: BayState[] = []
    for (let i = 0; i < rows * cols; i++) {
      initialBays.push({
        id: i,
        state: "available",
        lastChange: Date.now()
      })
    }
    setBays(initialBays)
  }, [rows, cols])

  // Randomly change bay states
  useEffect(() => {
    const changeBayState = () => {
      setBays(prevBays => {
        if (prevBays.length === 0) return prevBays
        const bayIndex = Math.floor(Math.random() * prevBays.length)
        const bay = prevBays[bayIndex]
        
        // Don't change if recently changed (prevent rapid flickering)
        if (Date.now() - bay.lastChange < 2000) {
          return prevBays
        }

        const newState: BayState = {
          ...bay,
          state: "occupied",
          lastChange: Date.now()
        }

        // After 3-5 seconds, transition to vacating, then back to available
        setTimeout(() => {
          setBays(current => {
            const updated = [...current]
            const targetBay = updated[bayIndex]
            if (targetBay.state === "occupied") {
              updated[bayIndex] = { ...targetBay, state: "vacating", lastChange: Date.now() }
              
              // After 1 second, return to available
              setTimeout(() => {
                setBays(current => {
                  const final = [...current]
                  final[bayIndex] = { ...final[bayIndex], state: "available", lastChange: Date.now() }
                  return final
                })
              }, 1000)
            }
            return updated
          })
        }, 3000 + Math.random() * 2000)

        const updated = [...prevBays]
        updated[bayIndex] = newState
        return updated
      })
    }

    // Change a random bay every 1-2 seconds
    const interval = setInterval(changeBayState, 1500)
    return () => clearInterval(interval)
  }, [rows, cols])

  const getBayColor = (state: BayState["state"]) => {
    switch (state) {
      case "occupied":
        return "var(--accent-signal)"
      case "vacating":
        return "var(--accent-mint)"
      default:
        return "var(--metal-400)"
    }
  }

  const getBayOpacity = (state: BayState["state"]) => {
    switch (state) {
      case "occupied":
        return 1
      case "vacating":
        return 0.8
      default:
        return 0.3
    }
  }

  return (
    <div 
      className={`grid gap-2 ${className}`}
      style={{ 
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        opacity,
        transform: `scale(${scale})`
      }}
    >
      {bays.map((bay) => (
        <motion.div
          key={bay.id}
          className="rounded-sm"
          style={{
            backgroundColor: getBayColor(bay.state),
            opacity: getBayOpacity(bay.state),
            boxShadow: bay.state === "occupied" 
              ? "0 0 10px var(--accent-glow)" 
              : bay.state === "vacating"
              ? "0 0 10px rgba(255, 255, 255, 0.2)"
              : "none"
          }}
          animate={{
            scale: bay.state === "occupied" ? [1, 1.1, 1] : 1,
            opacity: getBayOpacity(bay.state)
          }}
          transition={{
            duration: bay.state === "occupied" ? 0.3 : 0.5,
            ease: "easeOut"
          }}
        />
      ))}
    </div>
  )
}
