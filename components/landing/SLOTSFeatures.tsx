"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { MapPin, Star, Clock, Shield, LucideIcon } from "lucide-react"
import GoogleMapsBackground from "./GoogleMapsBackground"

interface Feature {
  icon: LucideIcon
  title: string
  description: string
  accentType: "indigo" | "purple" | "teal" | "emerald"
}

interface SLOTSFeaturesProps {
  features: Feature[]
}

export default function SLOTSFeatures({ features }: SLOTSFeaturesProps) {
  return (
    <section id="features" className="py-32 relative overflow-hidden" style={{ background: "var(--bg-surface)" }}>
      {/* Google Maps Background */}
      <div className="absolute inset-0 pointer-events-none">
        <GoogleMapsBackground blur={true} />
      </div>
      
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        {/* Section Headline */}
        <motion.div
          initial={{ 
            opacity: 0,
            perspective: 1000,
            rotateX: 16,
            translateY: 32
          }}
          whileInView={{ 
            opacity: 1,
            rotateX: 0,
            translateY: 0
          }}
          transition={{ 
            duration: 0.8,
            ease: [0.22, 1, 0.36, 1]
          }}
          viewport={{ once: true }}
          className="mb-20"
        >
          <h2 className="text-4xl md:text-6xl font-black text-[var(--text-primary)] mb-8 tracking-tight" style={{ fontFamily: 'Inter Tight, system-ui, sans-serif', letterSpacing: '-0.02em' }}>
            Everything you need to <span className="text-gradient-slots">Park Smarter.</span>
          </h2>
          <p className="text-xl text-[var(--text-secondary)] max-w-3xl">
            We've rebuilt the parking experience from the ground up, focusing on ease of use, security, and global accessibility.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, idx) => (
            <TiltCard key={feature.title} feature={feature} index={idx} />
          ))}
        </div>
      </div>
    </section>
  )
}

// Tilt Card Component with cursor-based 3D effect
function TiltCard({ feature, index }: { feature: Feature; index: number }) {
  const [rotateX, setRotateX] = useState(0)
  const [rotateY, setRotateY] = useState(0)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    
    // Max tilt of 5 degrees
    const rotateXValue = ((y - centerY) / centerY) * -5
    const rotateYValue = ((x - centerX) / centerX) * 5
    
    setRotateX(rotateXValue)
    setRotateY(rotateYValue)
  }

  const handleMouseLeave = () => {
    setRotateX(0)
    setRotateY(0)
  }

  // Get color based on accent type
  const getIconColor = () => {
    switch (feature.accentType) {
      case "indigo":
        return "var(--accent)"
      case "purple":
        return "var(--feature-purple)"
      case "teal":
        return "var(--feature-teal)"
      case "emerald":
        return "var(--feature-emerald)"
      default:
        return "var(--accent)"
    }
  }

  const getGlowColor = () => {
    switch (feature.accentType) {
      case "indigo":
        return "var(--accent-glow)"
      case "purple":
        return "var(--feature-purple-glow)"
      case "teal":
        return "var(--feature-teal-glow)"
      case "emerald":
        return "var(--feature-emerald-glow)"
      default:
        return "var(--accent-glow)"
    }
  }

  return (
    <motion.div
      initial={{ 
        opacity: 0,
        rotateY: index % 2 === 0 ? -10 : 10,
        translateZ: -50
      }}
      whileInView={{ 
        opacity: 1,
        rotateY: 0,
        translateZ: 0
      }}
      transition={{ 
        delay: index * 0.1,
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1]
      }}
      viewport={{ once: true }}
      className="relative"
    >
      <motion.div
        className="glass-slots card-depth rounded-[2rem] p-8 h-full flex flex-col items-start gap-6 border-[var(--border-glass)] hover:border-[var(--border-glow)] transition-all duration-300"
        style={{
          transformStyle: "preserve-3d",
          transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(0)`
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        whileHover={{ translateZ: 10 }}
      >
        {/* Icon with radar-style pulse */}
        <div className="relative">
          <motion.div
            className="absolute inset-0 rounded-2xl"
            style={{ background: getGlowColor() }}
            animate={{
              opacity: [0, 0.5, 0]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <div
            className="relative h-14 w-14 rounded-2xl flex items-center justify-center"
            style={{ 
              background: getIconColor(),
              boxShadow: `0 0 20px ${getGlowColor()}`
            }}
          >
            <feature.icon className="h-7 w-7 text-[var(--bg-void)]" />
          </div>
        </div>

        {/* Content */}
        <div>
          <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-3 tracking-snug" style={{ fontFamily: 'Inter Tight, system-ui, sans-serif', letterSpacing: '-0.01em' }}>
            {feature.title}
          </h3>
          <p className="text-[var(--text-secondary)] leading-relaxed" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            {feature.description}
          </p>
        </div>

        {/* Light sweep effect on hover */}
        <motion.div
          className="absolute inset-0 rounded-[2rem] overflow-hidden pointer-events-none"
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.1) 50%, transparent 60%)"
            }}
            animate={{
              x: ["-100%", "100%"]
            }}
            transition={{
              duration: 0.6,
              ease: "easeInOut"
            }}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
