"use client"

import { useEffect, useRef, useState } from "react"
import { signIn, getSession, useSession } from "next-auth/react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Mail, Lock, CheckCircle2, AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { Role } from "@/lib/auth/roles"

import SLOTSLogo from "@/components/ui/SLOTSLogo"
import ModalGridBackground from "./ModalGridBackground"

interface LoginModalProps {
  open: boolean
  onClose: () => void
  email?: string
  setEmail?: (email: string) => void
  password?: string
  setPassword?: (password: string) => void
  isLoading?: boolean
  handleLogin?: () => Promise<void>
  onShowRegister?: () => void
}

export default function LoginModal({
  open,
  onClose,
  email: propsEmail,
  setEmail: propsSetEmail,
  password: propsPassword,
  setPassword: propsSetPassword,
  isLoading: propsIsLoading,
  handleLogin: propsHandleLogin,
  onShowRegister
}: LoginModalProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [capsOn, setCapsOn] = useState(false)
  const [localEmail, setLocalEmail] = useState("")
  const [localPassword, setLocalPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [localIsLoading, setLocalIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [emailError, setEmailError] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [isSuccess, setIsSuccess] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { update } = useSession()

  const email = propsEmail ?? localEmail
  const setEmail = propsSetEmail ?? setLocalEmail
  const password = propsPassword ?? localPassword
  const setPassword = propsSetPassword ?? setLocalPassword
  const isLoading = propsIsLoading ?? localIsLoading

  useEffect(() => {
    if (open) {
      setTimeout(() => emailRef.current?.focus(), 200)
    }
  }, [open])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && open) {
        handleLogin()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, email, password])

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const defaultHandleLogin = async () => {
    // Clear previous errors
    setError("")
    setEmailError("")
    setPasswordError("")

    // Validate email
    if (!email) {
      setEmailError("Email is required")
      return
    }
    if (!validateEmail(email)) {
      setEmailError("Invalid email format")
      return
    }

    // Validate password
    if (!password) {
      setPasswordError("Password is required")
      return
    }
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters")
      return
    }

    setLocalIsLoading(true)
    try {
      const res = await signIn("credentials", {
        email,
        password,
        rememberMe: rememberMe ? 'true' : 'false',
        redirect: false,
      })
      if (!res?.ok) {
        setError("Invalid email or password")
        setLocalIsLoading(false)
        return
      }
      
      // Show success state
      setIsSuccess(true)
      await new Promise(resolve => setTimeout(resolve, 400))
      
      await update()
      
      // Give more time for session to be fully updated
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const session = await getSession()
      const role = session?.user?.role
      
      console.log("🔍 LoginModal Session Debug:", { 
        role, 
        email: session?.user?.email,
        userId: session?.user?.id,
        fullSession: session
      })
      
      onClose()
      toast.success("Identity Verified")
      
      // Role-based routing
      if ((role as any) === Role.SUPER_ADMIN) router.push("/dashboard/admin")
      else if ((role as any) === Role.OWNER) router.push("/dashboard/owner")
      else router.push("/dashboard")
    } catch (error) {
      setError("An error occurred. Please try again.")
    } finally {
      setLocalIsLoading(false)
      setIsSuccess(false)
    }
  }

  const handleLogin = propsHandleLogin ?? defaultHandleLogin

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0"
            style={{ background: "rgba(5, 6, 10, 0.7)", backdropFilter: "blur(8px)" }}
            onClick={onClose}
          />

          {/* Centered Container */}
          <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotateX: 8, translateZ: -120 }}
              animate={{ opacity: 1, scale: 1, rotateX: 0, translateZ: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-[1150px]"
              style={{ perspective: "1000px" }}
            >
              <motion.div
                className="relative w-full rounded-2xl overflow-hidden shadow-2xl grid md:grid-cols-2 min-h-[500px]"
                style={{ 
                  background: "var(--bg-void)",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
                }}
                onClick={(e) => e.stopPropagation()}
              >

                {/* Close Button */}
                <motion.button
                  onClick={onClose}
                  whileHover={{ rotate: 15 }}
                  className="absolute right-5 top-5 z-50 p-2 rounded-lg transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X size={20} />
                </motion.button>

                {/* Left Panel - Brand / Marketing */}
                <div 
                  className="relative hidden md:flex flex-col justify-between p-10 overflow-hidden"
                  style={{ 
                    background: "linear-gradient(to bottom right, var(--bg-void), var(--bg-card))",
                    borderRight: "1px solid var(--border-glass)"
                  }}
                >
                  {/* Grid Background */}
                  <ModalGridBackground className="absolute inset-0 opacity-60" />
                  
                  {/* Soft Indigo Glow */}
                  <div 
                    className="absolute -top-20 -left-20 w-80 h-80 rounded-full blur-3xl opacity-30"
                    style={{ background: "var(--accent-glow)" }}
                  />

                  {/* Logo */}
                  <div className="relative z-10">
                    <SLOTSLogo size="default" showPing={true} />
                  </div>

                  {/* Content */}
                  <div className="relative z-10 mt-auto space-y-4">
                    <motion.div
                      initial={{ opacity: 0, y: 20, translateZ: -80, rotateX: 6 }}
                      animate={{ opacity: 1, y: 0, translateZ: 0, rotateX: 0 }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                    >
                      <h2 
                        className="text-3xl font-black leading-tight"
                        style={{ fontFamily: 'Inter Tight, system-ui, sans-serif', letterSpacing: '-0.02em', color: "var(--text-primary)" }}
                      >
                        Smart Cities Start With
                      </h2>
                      <h2 
                        className="text-3xl font-black leading-tight"
                        style={{ fontFamily: 'Inter Tight, system-ui, sans-serif', letterSpacing: '-0.02em', color: "var(--accent)" }}
                      >
                        Precision Parking.
                      </h2>
                    </motion.div>
                    
                    <motion.p
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.3 }}
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Streamline operations with SLOTS's real-time occupancy tracking and automated access control.
                    </motion.p>

                    <motion.button
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.4 }}
                      whileHover={{ 
                        borderColor: "var(--border-glow)",
                        boxShadow: "0 0 20px var(--accent-glow)"
                      }}
                      className="px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all"
                      style={{ 
                        background: "var(--bg-glass)",
                        border: "1px solid var(--border-glass)",
                        color: "var(--text-primary)",
                        backdropFilter: "blur(12px)"
                      }}
                    >
                      Explore Features
                      <ArrowRight size={14} />
                    </motion.button>
                  </div>
                </div>

                {/* Right Panel - Sign In Form */}
                <div className="flex flex-col justify-center p-10" style={{ background: "var(--bg-surface)" }}>
                  <div className="mb-8">
                    {/* Lock Icon Badge */}
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                      style={{ background: "var(--accent-dim)" }}
                    >
                      <Lock size={18} style={{ color: "var(--metal-100)" }} />
                    </div>
                    
                    <h3 
                      className="text-xl font-bold mb-2"
                      style={{ fontFamily: 'Inter Tight, system-ui, sans-serif', color: "var(--text-primary)" }}
                    >
                      Log In / Sign In
                    </h3>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Enter your credentials to access your account.
                    </p>
                  </div>

                  <div className="space-y-5">
                    {/* Email Field */}
                    <div className="space-y-2">
                      <label 
                        className="text-[10px] font-bold uppercase tracking-wider ml-1 block"
                        style={{ color: "var(--metal-500)" }}
                      >
                        Email Address
                      </label>
                      <motion.div
                        animate={emailError ? { x: [-4, 4, -4, 4, 0] } : {}}
                        transition={{ duration: 0.25 }}
                      >
                        <div 
                          className="relative rounded-xl overflow-hidden transition-all duration-200"
                          style={{
                            background: "var(--bg-card)",
                            border: emailError ? `1px solid var(--error)` : "1px solid var(--border-glass)",
                            boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.3)"
                          }}
                        >
                          <Mail 
                            size={16} 
                            className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200"
                            style={{ color: emailError ? "var(--error)" : "var(--metal-500)" }}
                          />
                          <input
                            ref={emailRef}
                            type="email"
                            placeholder="name@company.com"
                            value={email}
                            onChange={(e) => {
                              setEmail(e.target.value)
                              setEmailError("")
                            }}
                            className="w-full bg-transparent px-10 py-3 text-sm outline-none transition-all"
                            style={{ color: "var(--text-primary)" }}
                            onFocus={(e) => {
                              if (!emailError && e.currentTarget.parentElement) {
                                e.currentTarget.parentElement.style.borderColor = "var(--border-glow)"
                                e.currentTarget.parentElement.style.boxShadow = "0 0 20px var(--accent-glow)"
                              }
                            }}
                            onBlur={(e) => {
                              if (!emailError && e.currentTarget.parentElement) {
                                e.currentTarget.parentElement.style.borderColor = "var(--border-glass)"
                                e.currentTarget.parentElement.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.3)"
                              }
                            }}
                          />
                        </div>
                      </motion.div>
                      {emailError && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-2 text-xs"
                          style={{ color: "var(--error)" }}
                        >
                          <AlertCircle size={12} />
                          {emailError}
                        </motion.div>
                      )}
                    </div>

                    {/* Password Field */}
                    <div className="space-y-2">
                      <label 
                        className="text-[10px] font-bold uppercase tracking-wider ml-1 block"
                        style={{ color: "var(--metal-500)" }}
                      >
                        Password
                      </label>
                      <motion.div
                        animate={passwordError ? { x: [-4, 4, -4, 4, 0] } : {}}
                        transition={{ duration: 0.25 }}
                      >
                        <div 
                          className="relative rounded-xl overflow-hidden transition-all duration-200"
                          style={{
                            background: "var(--bg-card)",
                            border: passwordError ? `1px solid var(--error)` : "1px solid var(--border-glass)",
                            boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.3)"
                          }}
                        >
                          <Lock 
                            size={16} 
                            className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200"
                            style={{ color: passwordError ? "var(--error)" : "var(--metal-500)" }}
                          />
                          <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Min 8 characters"
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value)
                              setPasswordError("")
                            }}
                            onKeyUp={(e) => setCapsOn(e.getModifierState("CapsLock"))}
                            className="w-full bg-transparent px-10 pr-10 py-3 text-sm outline-none transition-all"
                            style={{ color: "var(--text-primary)" }}
                            onFocus={(e) => {
                              if (!passwordError && e.currentTarget.parentElement) {
                                e.currentTarget.parentElement.style.borderColor = "var(--border-glow)"
                                e.currentTarget.parentElement.style.boxShadow = "0 0 20px var(--accent-glow)"
                              }
                            }}
                            onBlur={(e) => {
                              if (!passwordError && e.currentTarget.parentElement) {
                                e.currentTarget.parentElement.style.borderColor = "var(--border-glass)"
                                e.currentTarget.parentElement.style.boxShadow = "inset 0 2px 4px rgba(0, 0, 0, 0.3)"
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                            style={{ color: "var(--metal-500)" }}
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </motion.div>
                      {passwordError && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-2 text-xs"
                          style={{ color: "var(--error)" }}
                        >
                          <AlertCircle size={12} />
                          {passwordError}
                        </motion.div>
                      )}
                    </div>

                    {/* Caps Lock Warning */}
                    {capsOn && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 text-xs"
                        style={{ color: "var(--metal-300)" }}
                      >
                        <AlertCircle size={12} />
                        Caps Lock is on
                      </motion.div>
                    )}

                    {/* Create Account / Forgot Password */}
                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => {
                          onClose()
                          onShowRegister?.()
                        }}
                        className="text-xs font-medium transition-colors relative group"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <span className="relative">
                          Create Account
                          <motion.span
                            className="absolute bottom-0 left-0 w-0 h-[1px]"
                            style={{ background: "var(--accent)" }}
                            whileHover={{ width: "100%" }}
                            transition={{ duration: 0.2 }}
                          />
                        </span>
                      </button>
                      <button 
                        onClick={() => {
                          onClose()
                          router.push("/forgot-password")
                        }}
                        className="text-xs font-medium transition-colors relative group"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <span className="relative">
                          Forgot Password?
                          <motion.span
                            className="absolute bottom-0 left-0 w-0 h-[1px]"
                            style={{ background: "var(--accent)" }}
                            whileHover={{ width: "100%" }}
                            transition={{ duration: 0.2 }}
                          />
                        </span>
                      </button>
                    </div>

                    {/* General Error */}
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 text-xs p-3 rounded-lg"
                        style={{ color: "var(--error)", background: "rgba(229, 72, 77, 0.1)" }}
                      >
                        <AlertCircle size={12} />
                        {error}
                      </motion.div>
                    )}

                    {/* Sign In Button */}
                    <motion.button
                      onClick={handleLogin}
                      disabled={isLoading || isSuccess}
                      whileHover={{ 
                        translateY: -2, 
                        translateZ: 8,
                        boxShadow: "0 0 30px var(--accent-glow)"
                      }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                      style={{ 
                        background: "var(--accent)",
                        color: "var(--text-primary)",
                        boxShadow: "0 0 20px var(--accent-glow)"
                      }}
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : isSuccess ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="flex items-center justify-center"
                        >
                          <CheckCircle2 size={20} style={{ color: "var(--text-primary)" }} />
                        </motion.div>
                      ) : (
                        <>
                          Sign In
                          <ArrowRight size={16} />
                        </>
                      )}
                    </motion.button>

                    {/* Divider */}
                    <div className="relative py-4 flex items-center">
                      <div className="w-full h-[1px]" style={{ background: "var(--border-glass)" }} />
                      <span 
                        className="absolute left-1/2 -translate-x-1/2 px-3 text-xs"
                        style={{ color: "var(--text-muted)", background: "var(--bg-surface)" }}
                      >
                        Or continue with
                      </span>
                    </div>

                    {/* Google Sign In */}
                    <motion.button
                      onClick={() => signIn("google")}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-3 transition-all"
                      style={{ 
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-glass)",
                        color: "var(--text-primary)",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)"
                      }}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      Google Account
                    </motion.button>
                  </div>
                </div>

              </motion.div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}
