"use client"

import { useState, useEffect, useRef } from "react"
import { motion, useInView } from "framer-motion"
import { Zap, CheckCircle2, Globe } from "lucide-react"

interface Step {
  title: string
  description: string
  icon: React.ReactNode
}

interface SLOTSHowItWorksProps {
  steps: Step[]
}

export default function SLOTSHowItWorks({ steps }: SLOTSHowItWorksProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: true, amount: 0.5 })
  const [lineProgress, setLineProgress] = useState(0)

  useEffect(() => {
    if (isInView) {
      // Animate line drawing from left to right
      const duration = 2000 // 2 seconds
      const startTime = Date.now()
      
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        setLineProgress(progress)
        
        if (progress < 1) {
          requestAnimationFrame(animate)
        }
      }
      
      animate()
    }
  }, [isInView])

  return (
    <section id="how-it-works" className="py-32 relative" style={{ background: "var(--bg-surface)" }}>
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto mb-20"
        >
          <h2 className="text-4xl md:text-5xl font-black text-[var(--text-primary)] mb-6 tracking-tight" style={{ fontFamily: 'Inter Tight, system-ui, sans-serif', letterSpacing: '-0.02em' }}>
            How It Works
          </h2>
          <p className="text-lg text-[var(--text-secondary)]">
            Three simple steps to revolutionize your daily commute.
          </p>
        </motion.div>

        {/* Steps Grid */}
        <div ref={containerRef} className="grid md:grid-cols-3 gap-16 relative">
          {/* Connecting Line with gradient - Single Indigo Tone */}
          <div className="hidden md:block absolute top-[2.75rem] left-[15%] right-[15%] h-[2px] overflow-hidden">
            <motion.div
              className="h-full"
              style={{
                background: "var(--accent)"
              }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              transition={{ duration: 2, ease: "easeInOut" }}
              viewport={{ once: true }}
            />
          </div>

          {steps.map((step, idx) => (
            <StepCard key={step.title} step={step} index={idx} lineProgress={lineProgress} />
          ))}
        </div>
      </div>
    </section>
  )
}

function StepCard({ step, index, lineProgress }: { step: Step; index: number; lineProgress: number }) {
  const [isActivated, setIsActivated] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  useEffect(() => {
    // Activate step when line progress reaches this step's position
    const activationThreshold = (index + 1) / 3
    if (lineProgress >= activationThreshold && !isActivated) {
      setIsActivated(true)
    }
  }, [lineProgress, index, isActivated])

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.2, duration: 0.6 }}
      viewport={{ once: true }}
      className="flex flex-col items-center text-center relative z-10"
    >
      {/* Icon Node with radar pulse */}
      <div className="relative mb-10">
        {/* Radar pulse ring on activation */}
        {isActivated && (
          <motion.div
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: "var(--accent)" }}
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 2.5, opacity: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        )}
        
        <motion.div
          className="h-24 w-24 rounded-full glass-slots border-2 flex items-center justify-center"
          style={{ 
            borderColor: isActivated ? "var(--accent)" : "var(--metal-500)",
            boxShadow: isActivated ? "0 0 30px var(--accent-glow)" : "0 0 30px rgba(255, 255, 255, 0.1)"
          }}
          animate={{
            scale: isActivated ? [1, 1.1, 1] : 1,
          }}
          transition={{ duration: 0.3 }}
        >
          <div style={{ color: isActivated ? "var(--accent)" : "var(--metal-500)" }}>
            {step.icon}
          </div>
        </motion.div>
      </div>

      {/* Content */}
      <h3 className="text-2xl font-bold mb-4 text-[var(--text-primary)] uppercase tracking-wider" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {step.title}
      </h3>
      <p className="text-[var(--text-secondary)] leading-relaxed">
        {step.description}
      </p>
    </motion.div>
  )
}
