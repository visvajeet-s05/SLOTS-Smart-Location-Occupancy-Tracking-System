"use client"

import { motion } from "framer-motion"
import { useState, useEffect } from "react"
import { Apple, Play as GooglePlayIcon } from "lucide-react"

interface ParkingBay {
  id: string
  status: "free" | "occupied" | "ev"
  row: number
  col: number
}

interface SLOTSMobileShowcaseProps {
  onAppStoreClick?: () => void
  onGooglePlayClick?: () => void
}

export default function SLOTSMobileShowcase({ onAppStoreClick, onGooglePlayClick }: SLOTSMobileShowcaseProps) {
  const [parkingBays, setParkingBays] = useState<ParkingBay[]>([])
  const [currentSlide, setCurrentSlide] = useState(0)

  // Initialize parking bays with random statuses
  useEffect(() => {
    const bays: ParkingBay[] = []
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        const statuses: Array<"free" | "occupied" | "ev"> = ["free", "free", "occupied", "occupied", "ev"]
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)]
        bays.push({
          id: `${String.fromCharCode(65 + row)}-${col + 1}`,
          status: randomStatus,
          row,
          col
        })
      }
    }
    setParkingBays(bays)
  }, [])

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setParkingBays(prev => {
        const updated = [...prev]
        const randomIndex = Math.floor(Math.random() * updated.length)
        const statuses: Array<"free" | "occupied" | "ev"> = ["free", "occupied", "ev"]
        updated[randomIndex] = {
          ...updated[randomIndex],
          status: statuses[Math.floor(Math.random() * statuses.length)]
        }
        return updated
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const slideInterval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % 3)
    }, 3500)
    return () => clearInterval(slideInterval)
  }, [])

  return (
    <section className="w-full py-20 px-6 overflow-hidden" style={{ background: "var(--bg-surface)" }}>
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        
        {/* Left Column: Mobile App Copy & App Store Buttons */}
        <div className="lg:col-span-5 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-xs font-mono uppercase tracking-widest"
            style={{ color: "var(--accent)" }}
          >
            MOBILE EXPERIENCE
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            className="text-4xl sm:text-5xl font-black tracking-tight leading-tight"
            style={{ fontFamily: 'Inter Tight, system-ui, sans-serif', letterSpacing: '-0.02em', color: "var(--text-primary)" }}
          >
            SLOTS in your <br />
            <span className="text-gradient-slots">Pocket.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
            className="text-base leading-relaxed font-sans"
            style={{ color: "var(--text-secondary)" }}
          >
            Real-time updates, contact-free booking, and digital receipts. Control your entire parking experience from our world-class mobile app.
          </motion.p>

          {/* App Store / Google Play Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            viewport={{ once: true }}
            className="flex flex-wrap items-center gap-4 pt-2"
          >
            {/* App Store Button */}
            <motion.button
              onClick={onAppStoreClick}
              whileHover={{ translateY: -2, boxShadow: "0 0 30px var(--accent-glow)" }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 px-5 py-3 rounded-xl transition-all"
              style={{ 
                background: "var(--bg-card)", 
                border: "1px solid var(--border-glass)",
                color: "var(--text-primary)"
              }}
            >
              <Apple size={24} className="fill-current" />
              <div className="text-left leading-none">
                <div className="text-[10px] font-mono uppercase" style={{ color: "var(--text-muted)" }}>DOWNLOAD ON</div>
                <div className="text-sm font-semibold mt-1">App Store</div>
              </div>
            </motion.button>

            {/* Google Play Button */}
            <motion.button
              onClick={onGooglePlayClick}
              whileHover={{ translateY: -2, boxShadow: "0 0 30px var(--accent-glow)" }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 px-5 py-3 rounded-xl transition-all"
              style={{ 
                background: "var(--bg-card)", 
                border: "1px solid var(--border-glass)",
                color: "var(--text-primary)"
              }}
            >
              <GooglePlayIcon size={24} className="fill-current" />
              <div className="text-left leading-none">
                <div className="text-[10px] font-mono uppercase" style={{ color: "var(--text-muted)" }}>GET IT ON</div>
                <div className="text-sm font-semibold mt-1">Google Play</div>
              </div>
            </motion.button>
          </motion.div>
        </div>

        {/* Right Column: Landscape Tablet Frame with Video Preview */}
        <div className="lg:col-span-7 relative">
          
          {/* Subtle Glow Backdrop */}
          <div 
            className="absolute -inset-4 rounded-[40px] blur-3xl opacity-60 -z-10"
            style={{ 
              background: "radial-gradient(circle at 50% 50%, var(--accent-glow) 0%, transparent 70%)" 
            }}
          />

          {/* Tablet Frame */}
          <motion.div
            initial={{ y: 50, rotateX: 8 }}
            whileInView={{ y: 0, rotateX: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            viewport={{ once: true }}
            className="relative mx-auto w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden"
            style={{ 
              background: "var(--bg-card)",
              border: "10px solid var(--bg-void)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
            }}
          >
            {/* Top Notch Camera */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-1.5 rounded-full z-20" style={{ background: "var(--bg-void)" }}></div>

            {/* Tablet Display Screen */}
            <div className="relative aspect-[16/10] overflow-hidden" style={{ background: "var(--bg-void)" }}>
              
              {/* Animated Live Dashboard Screen Simulation */}
              <div className="w-full h-full relative p-6 flex flex-col justify-between" style={{ background: "linear-gradient(to bottom right, var(--bg-card), var(--bg-void), var(--bg-card))" }}>
                
                {/* Screen Header */}
                <div className="flex justify-between items-center pb-3" style={{ borderBottom: "1px solid var(--border-glass)" }}>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full animate-pulse" style={{ background: "var(--status-live)" }}></span>
                    <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>ZONE-A LIVE MAP</span>
                  </div>
                  <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                    {parkingBays.length > 0 
                      ? Math.round((parkingBays.filter(b => b.status === "occupied").length / parkingBays.length) * 100) 
                      : 0}% Occupied
                  </span>
                </div>

                {/* 3D Isometric Parking Lot Visualization */}
                <div className="my-auto relative h-64 flex items-center justify-center" style={{ perspective: "1000px" }}>
                  <div 
                    className="relative grid gap-2 transition-transform duration-700 ease-out"
                    style={{
                      transform: "rotateX(55deg) rotateZ(-45deg) scale(0.8)",
                      gridTemplateColumns: "repeat(6, 1fr)",
                      gridTemplateRows: "repeat(4, 1fr)"
                    }}
                  >
                    {parkingBays.map((bay) => (
                      <motion.div
                        key={bay.id}
                        className="relative w-12 h-16 rounded-sm cursor-pointer"
                        style={{
                          backgroundColor: 
                            bay.status === "free" ? "rgba(52, 211, 153, 0.8)" :
                            bay.status === "occupied" ? "rgba(244, 63, 94, 0.8)" :
                            "rgba(245, 158, 11, 0.8)",
                          boxShadow: bay.status === "free" 
                            ? "0 0 15px rgba(52, 211, 153, 0.5)" 
                            : "0 0 15px rgba(244, 63, 94, 0.3)",
                          border: "1px solid rgba(255,255,255,0.1)"
                        }}
                        whileHover={{ 
                          scale: 1.1,
                          transition: { duration: 0.2 }
                        }}
                        animate={{
                          opacity: [0.8, 1, 0.8],
                          scale: [1, 1.02, 1]
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: bay.row * 0.1 + bay.col * 0.05
                        }}
                      >
                        {/* Bay label */}
                        <div 
                          className="absolute inset-0 flex items-center justify-center text-[8px] font-mono font-bold text-white"
                        >
                          {bay.id}
                        </div>
                        
                        {/* 3D side effect */}
                        <div 
                          className="absolute bottom-0 left-0 right-0 h-2 rounded-sm"
                          style={{
                            backgroundColor: "rgba(0,0,0,0.3)",
                            transform: "translateY(2px)"
                          }}
                        />
                      </motion.div>
                    ))}
                  </div>
                  
                  {/* Parking lot floor/base */}
                  <div 
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: "linear-gradient(135deg, rgba(30, 30, 40, 0.9) 0%, rgba(20, 20, 30, 0.95) 100%)",
                      transform: "rotateX(55deg) rotateZ(-45deg) scale(0.85)",
                      border: "1px solid rgba(255,255,255,0.05)"
                    }}
                  />
                </div>

                {/* Bottom Floating Dynamic Status Bar */}
                <div className="p-3 rounded-xl flex items-center justify-between"
                  style={{ 
                    background: "rgba(19, 22, 28, 0.9)", 
                    border: "1px solid var(--border-glass)"
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg" style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Dynamic MARL Pricing</p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Peak hour rate adjusted to ₹45/hr</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-1 rounded border" style={{ 
                    color: "var(--status-live)", 
                    background: "rgba(52, 211, 153, 0.1)",
                    borderColor: "rgba(52, 211, 153, 0.2)"
                  }}>Active</span>
                </div>

              </div>

            </div>
          </motion.div>

        </div>

      </div>
    </section>
  )
}
