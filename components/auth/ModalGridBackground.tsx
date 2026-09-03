"use client"

import { motion } from "framer-motion"

interface ModalGridBackgroundProps {
  className?: string
}

export default function ModalGridBackground({ className = "" }: ModalGridBackgroundProps) {
  const gridSize = 8
  const totalCells = gridSize * gridSize

  return (
    <div className={`absolute inset-0 ${className}`}>
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {Array.from({ length: totalCells }).map((_, i) => {
          const x = (i % gridSize) * (100 / gridSize)
          const y = Math.floor(i / gridSize) * (100 / gridSize)
          const delay = (i % gridSize + Math.floor(i / gridSize)) * 0.05

          return (
            <motion.rect
              key={i}
              x={x}
              y={y}
              width={100 / gridSize - 0.5}
              height={100 / gridSize - 0.5}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="0.3"
              opacity={0.08}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.08, 0.04, 0.08] }}
              transition={{
                duration: 3,
                delay,
                repeat: Infinity,
                repeatDelay: 2,
                ease: "easeInOut"
              }}
            />
          )
        })}
      </svg>
    </div>
  )
}
