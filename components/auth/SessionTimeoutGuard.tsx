"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession, signOut } from "next-auth/react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertCircle, LogOut, Play, ShieldAlert, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"

const IDLE_TIMEOUT = (6 * 60 + 4) * 1000 // 6 minutes 4 seconds
const COUNTDOWN_DURATION = 30 // 30 seconds for the dialog

export default function SessionTimeoutGuard() {
  const { data: session, status } = useSession()
  const [isIdle, setIsIdle] = useState(false)
  const [countdown, setCountdown] = useState(COUNTDOWN_DURATION)
  const [showDialog, setShowDialog] = useState(false)
  
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleLogout = useCallback(() => {
    signOut({ callbackUrl: "/" })
  }, [])

  const resetIdleTimer = useCallback(() => {
    if (showDialog) return // Don't reset if we are already showing the warning

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    
    // Only set timer for logged-in users who ARE NOT admins or owners 
    // (User requested this specifically for "users", while owners/admins have refresh logic)
    if (status === "authenticated" && (session?.user?.role as any) === "CUSTOMER") {
      idleTimerRef.current = setTimeout(() => {
        setIsIdle(true)
        setShowDialog(true)
      }, IDLE_TIMEOUT)
    }
  }, [status, session, showDialog])

  // Monitor activity
  useEffect(() => {
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"]
    
    const handler = () => resetIdleTimer()
    
    events.forEach(event => window.addEventListener(event, handler))
    resetIdleTimer()

    return () => {
      events.forEach(event => window.removeEventListener(event, handler))
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [resetIdleTimer])

  // Countdown logic when dialog is shown
  useEffect(() => {
    if (showDialog && countdown > 0) {
      countdownTimerRef.current = setInterval(() => {
        setCountdown(prev => prev - 1)
      }, 1000)
    } else if (countdown === 0) {
      handleLogout()
    }

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    }
  }, [showDialog, countdown, handleLogout])

  const stayLoggedIn = () => {
    setShowDialog(false)
    setIsIdle(false)
    setCountdown(COUNTDOWN_DURATION)
    resetIdleTimer()
  }

  if (!showDialog) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative max-w-md w-full bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
        >
          {/* Animated Glow Background */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-orange-500/20 rounded-full blur-[80px] animate-pulse" />
          
          <div className="relative z-10 text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-orange-500/10 border border-orange-500/20 rounded-full flex items-center justify-center mb-4">
              <ShieldAlert className="text-orange-500 w-10 h-10 animate-bounce" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-tight text-white uppercase italic">
                Session Status Alert
              </h2>
              <p className="text-gray-400 text-sm leading-relaxed font-medium">
                Are you gonna use or get logout?
              </p>
            </div>

            <div className="p-6 bg-white/5 rounded-3xl border border-white/5 flex flex-col items-center justify-center space-y-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Auto-Logout In</span>
              <div className="flex items-end gap-1">
                <span className="text-5xl font-black text-white tabular-nums">{countdown}</span>
                <span className="text-sm font-bold text-orange-500 mb-2 uppercase">Seconds</span>
              </div>
              <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mt-4">
                <motion.div 
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: COUNTDOWN_DURATION, ease: "linear" }}
                  className="bg-gradient-to-r from-orange-500 to-red-600 h-full"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button 
                onClick={stayLoggedIn}
                className="h-14 rounded-2xl bg-white text-black hover:bg-white/90 font-bold text-lg flex items-center justify-center gap-2 shadow-xl shadow-white/5"
              >
                <Play className="w-5 h-5 fill-current" />
                I'm still here!
              </Button>
              <Button 
                variant="ghost"
                onClick={handleLogout}
                className="h-12 rounded-2xl border border-white/5 hover:bg-red-500/10 hover:text-red-500 text-gray-500 transition-all font-semibold"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout Now
              </Button>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-white/5">
            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em] text-center">
              Global Standards Security Protocol • SSL Encrypted
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
