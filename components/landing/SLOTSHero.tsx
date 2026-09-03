"use client"

import { motion, useInView, useMotionValue, useTransform } from "framer-motion"
import { useRef, useEffect } from "react"
import { ArrowRight } from "lucide-react"
import RadarGridBackground from "./RadarGridBackground"

interface SLOTSHeroProps {
  onCTAClick: () => void
}

export default function SLOTSHero({ onCTAClick }: SLOTSHeroProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(cardRef, { once: true })
  
  // Cursor-follow ambient glow
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    mouseX.set(x)
    mouseY.set(y)
  }

  const glowX = useTransform(mouseX, (value) => `${value}px`)
  const glowY = useTransform(mouseY, (value) => `${value}px`)

  return (
    <section className="relative min-h-[110vh] flex items-center justify-center overflow-hidden">
      {/* Radar Grid Background */}
      <div className="absolute inset-0 z-0 select-none pointer-events-none">
        <RadarGridBackground />
      </div>

      {/* Cursor-follow ambient glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: "radial-gradient(circle at var(--glow-x) var(--glow-y), var(--accent-dim) 0%, transparent 50%)",
          "--glow-x": glowX,
          "--glow-y": glowY
        } as any}
      />

      {/* Hero Content */}
      <motion.div
        initial={{ 
          opacity: 0,
          scale: 0.88,
          rotateX: 8,
          translateZ: -100
        }}
        animate={{ 
          opacity: 1,
          scale: 1,
          rotateX: 0,
          translateZ: 0
        }}
        transition={{ 
          duration: 0.7,
          ease: [0.22, 1, 0.36, 1] // Mechanical settle easing
        }}
        className="relative z-10 max-w-4xl mx-auto px-6 text-center"
      >
        <div 
          ref={cardRef}
          onMouseMove={handleMouseMove}
          className="glass-slots card-depth rounded-[2.5rem] py-16 px-6 md:py-20 md:px-12 relative overflow-hidden"
        >
          {/* Edge-light sweep on load */}
          {isInView && (
            <motion.div
              className="absolute inset-0 pointer-events-none z-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.5, ease: "easeInOut", delay: 0.8 }}
            >
              <motion.div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)"
                }}
                animate={{
                  x: ["-100%", "100%"],
                  y: ["-100%", "100%"]
                }}
                transition={{ duration: 1.2, ease: "easeInOut" }}
              />
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter mb-8 leading-tight" style={{ fontFamily: 'Inter Tight, system-ui, sans-serif', letterSpacing: '-0.02em' }}>
              <span className="text-[var(--text-primary)]">Precision Parking.</span>{" "}
              <span className="text-gradient-slots">Zero Stress.</span>
            </h1>

            <p className="text-xl md:text-2xl text-[var(--text-secondary)] font-medium max-w-3xl mx-auto mb-12 leading-relaxed" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              Find, book, and navigate to the perfect parking spot in seconds.
              The most advanced parking ecosystem for modern urban living.
            </p>

            <div className="flex justify-center">
              <motion.button
                onClick={onCTAClick}
                className="relative h-16 px-10 text-lg font-bold rounded-2xl text-[var(--text-primary)] overflow-hidden group"
                style={{
                  background: "var(--accent)",
                  boxShadow: "0 0 30px var(--accent-glow)"
                }}
                whileHover={{ 
                  translateY: -2,
                  translateZ: 8,
                  boxShadow: "0 0 40px var(--accent-glow)"
                }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                {/* Scan line effect on hover */}
                <motion.div
                  className="absolute inset-0"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.6 }}
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)"
                  }}
                />
                
                <span className="relative z-10 flex items-center">
                  Find Parking Now
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </motion.button>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll Indicator - Fixed Visibility */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 cursor-pointer z-20"
        onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
      >
        <span 
          className="text-xs font-bold uppercase tracking-wider"
          style={{ 
            color: "var(--metal-500)", 
            fontFamily: 'Inter, monospace',
            letterSpacing: '0.15em',
            opacity: 1
          }}
        >
          DISCOVER
        </span>
        <motion.div 
          className="w-[1px] h-12"
          style={{ 
            background: "linear-gradient(to bottom, var(--accent), transparent)"
          }}
          animate={{
            opacity: [0.5, 1, 0.5],
            scaleY: [1, 1.2, 1]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </motion.div>
    </section>
  )
}
