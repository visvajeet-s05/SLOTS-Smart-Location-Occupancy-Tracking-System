"use client"

import { motion } from "framer-motion"

interface SLOTSCTAProps {
  onPrimaryCTAClick: () => void
  onSecondaryCTAClick: () => void
}

export default function SLOTSCTA({ onPrimaryCTAClick, onSecondaryCTAClick }: SLOTSCTAProps) {
  return (
    <section className="py-40 relative z-10 text-center overflow-hidden" style={{ background: "var(--bg-void)" }}>
      {/* Radial Glow Background */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0, scale: 0.8 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1 }}
        viewport={{ once: true }}
        style={{
          background: "radial-gradient(circle at 50% 50%, var(--accent-glow) 0%, transparent 70%)"
        }}
      />

      <div className="max-w-4xl mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <h2 className="text-5xl md:text-8xl font-black text-[var(--text-primary)] mb-10 tracking-tighter leading-none" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            Ready to <span className="text-gradient-slots">start?</span>
          </h2>
          
          <p className="text-xl md:text-2xl text-[var(--text-secondary)] mb-12">
            Experience the future of urban parking with real-time availability and smart navigation.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            {/* Primary CTA Button */}
            <motion.button
              onClick={onPrimaryCTAClick}
              className="relative h-20 px-12 text-xl font-bold rounded-2xl text-[var(--text-primary)] overflow-hidden group card-depth"
              style={{
                background: "var(--accent)",
                boxShadow: "0 0 40px var(--accent-glow)"
              }}
              whileHover={{ 
                translateY: -2,
                translateZ: 8,
                boxShadow: "0 0 60px var(--accent-glow)"
              }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              {/* Glow ring effect */}
              <motion.div
                className="absolute inset-0 rounded-2xl"
                style={{
                  border: "2px solid var(--accent)",
                  opacity: 0
                }}
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              />
              
              <span className="relative z-10">Get Started for Free</span>
            </motion.button>

            {/* Secondary Ghost Button */}
            <motion.button
              onClick={onSecondaryCTAClick}
              className="h-20 px-12 text-xl font-semibold rounded-2xl glass-slots border-[var(--border-glass)] hover:border-[var(--border-glow)] transition-all text-[var(--text-primary)]"
              whileHover={{ 
                translateY: -2,
                boxShadow: "0 0 30px var(--accent-glow)"
              }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              Learn More
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
