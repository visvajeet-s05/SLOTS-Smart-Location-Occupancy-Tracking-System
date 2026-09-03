"use client"

import { useRef } from "react"
import { motion, useInView } from "framer-motion"

interface Stat {
  label: string
  value: string
}

interface SLOTSStatsProps {
  stats: Stat[]
}

export default function SLOTSStats({ stats }: SLOTSStatsProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  return (
    <section className="relative py-24 z-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, idx) => (
            <motion.div
              key={stat.label}
              ref={ref}
              initial={{ 
                opacity: 0,
                rotateX: idx % 2 === 0 ? -10 : 10,
                rotateY: idx % 2 === 0 ? -5 : 5,
                translateZ: -50
              }}
              whileInView={{ 
                opacity: 1,
                rotateX: 0,
                rotateY: 0,
                translateZ: 0
              }}
              transition={{ 
                delay: idx * 0.1,
                duration: 0.6,
                ease: [0.22, 1, 0.36, 1]
              }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-black text-[var(--text-primary)] mb-2 font-mono tabular-nums">
                {stat.value}
              </div>
              <div className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Scan Line Effect */}
        {isInView && (
          <motion.div
            className="absolute bottom-0 left-0 right-0 h-[1px]"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            viewport={{ once: true }}
            style={{
              background: "linear-gradient(90deg, transparent, var(--accent), transparent)"
            }}
          />
        )}
      </div>
    </section>
  )
}
