"use client"

import { motion } from "framer-motion"
import { useState, useEffect } from "react"
import SLOTSLogo from "@/components/ui/SLOTSLogo"

interface SLOTSFooterProps {
  onLogoClick?: () => void
}

export default function SLOTSFooter({ onLogoClick }: SLOTSFooterProps) {
  const [currentTime, setCurrentTime] = useState("")
  const [currentYear, setCurrentYear] = useState("")

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const year = now.getFullYear().toString()
      const date = now.toLocaleDateString("en-US", { 
        month: "short", 
        day: "numeric", 
        year: "numeric" 
      })
      const time = now.toLocaleTimeString("en-US", { 
        hour: "2-digit", 
        minute: "2-digit", 
        second: "2-digit",
        hour12: false 
      })
      setCurrentTime(`${date} · ${time}`)
      setCurrentYear(year)
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <footer className="w-full py-8 px-6 border-t font-sans" style={{ background: "var(--bg-void)", borderColor: "var(--border-glass)" }}>
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 pb-6" style={{ borderBottom: "1px solid var(--border-glass)" }}>
        
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <SLOTSLogo size="default" showPing={false} />
        </div>

        {/* Right: Inline Navigation Links */}
        <nav className="flex items-center gap-3 text-sm font-medium">
          <a href="#features" className="relative text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group">
            <span className="relative z-10">Features</span>
            <motion.span
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-1 h-1 rounded-full"
              style={{ background: "var(--accent)" }}
              initial={{ opacity: 0, scale: 0 }}
              whileHover={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            />
            <motion.span
              className="absolute bottom-0 left-0 w-0 h-[1px]"
              style={{ background: "var(--accent)" }}
              initial={{ width: 0 }}
              whileHover={{ width: "100%" }}
              transition={{ duration: 0.3 }}
            />
          </a>
          <span style={{ color: "var(--metal-700)" }}>|</span>
          <a href="#how-it-works" className="relative text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group">
            <span className="relative z-10">How It Works</span>
            <motion.span
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-1 h-1 rounded-full"
              style={{ background: "var(--accent)" }}
              initial={{ opacity: 0, scale: 0 }}
              whileHover={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            />
            <motion.span
              className="absolute bottom-0 left-0 w-0 h-[1px]"
              style={{ background: "var(--accent)" }}
              initial={{ width: 0 }}
              whileHover={{ width: "100%" }}
              transition={{ duration: 0.3 }}
            />
          </a>
          <span style={{ color: "var(--metal-700)" }}>|</span>
          <a href="/docs" className="relative text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group">
            <span className="relative z-10">API Docs</span>
            <motion.span
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-1 h-1 rounded-full"
              style={{ background: "var(--accent)" }}
              initial={{ opacity: 0, scale: 0 }}
              whileHover={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            />
            <motion.span
              className="absolute bottom-0 left-0 w-0 h-[1px]"
              style={{ background: "var(--accent)" }}
              initial={{ width: 0 }}
              whileHover={{ width: "100%" }}
              transition={{ duration: 0.3 }}
            />
          </a>
          <span style={{ color: "var(--metal-700)" }}>|</span>
          <a href="/privacy" className="relative text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group">
            <span className="relative z-10">Privacy</span>
            <motion.span
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-1 h-1 rounded-full"
              style={{ background: "var(--accent)" }}
              initial={{ opacity: 0, scale: 0 }}
              whileHover={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            />
            <motion.span
              className="absolute bottom-0 left-0 w-0 h-[1px]"
              style={{ background: "var(--accent)" }}
              initial={{ width: 0 }}
              whileHover={{ width: "100%" }}
              transition={{ duration: 0.3 }}
            />
          </a>
          <span style={{ color: "var(--metal-700)" }}>|</span>
          <a href="/terms" className="relative text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group">
            <span className="relative z-10">Terms</span>
            <motion.span
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-1 h-1 rounded-full"
              style={{ background: "var(--accent)" }}
              initial={{ opacity: 0, scale: 0 }}
              whileHover={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            />
            <motion.span
              className="absolute bottom-0 left-0 w-0 h-[1px]"
              style={{ background: "var(--accent)" }}
              initial={{ width: 0 }}
              whileHover={{ width: "100%" }}
              transition={{ duration: 0.3 }}
            />
          </a>
        </nav>

      </div>

      {/* Bottom Bar */}
      <div className="max-w-7xl mx-auto pt-4 flex flex-col sm:flex-row justify-between items-center text-xs font-mono gap-3">
        <div style={{ color: "var(--text-muted)" }}>
          © {currentYear} SLOTS by Mastermind Mavericks. All rights reserved.
        </div>
        
        <div className="flex items-center gap-3">
          <span style={{ color: "var(--text-primary)" }}>{currentTime}</span>
          <span style={{ color: "var(--metal-700)" }}>|</span>
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>EN</span>
        </div>
      </div>
    </footer>
  )
}
