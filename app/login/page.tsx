"use client"

import { useEffect, useRef, useState } from "react"
import { signIn, getSession, useSession } from "next-auth/react"
import { motion, AnimatePresence } from "framer-motion"
import { Mail, Lock, CheckCircle2, AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { Role } from "@/lib/auth/roles"

import SLOTSLogo from "@/components/ui/SLOTSLogo"
import ModalGridBackground from "@/components/auth/ModalGridBackground"

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [capsOn, setCapsOn] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [emailError, setEmailError] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [isSuccess, setIsSuccess] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { update } = useSession()

  useEffect(() => {
    setTimeout(() => emailRef.current?.focus(), 200)
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        handleLogin()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [email, password])

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleLogin = async () => {
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

    setIsLoading(true)
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (!res?.ok) {
        setError("Invalid email or password")
        setIsLoading(false)
        return
      }

      // Determine redirect based on role from session
      setIsSuccess(true)
      await new Promise(resolve => setTimeout(resolve, 400))
      toast.success("Identity Verified")

      const session = await getSession()
      const role = session?.user?.role
      let targetUrl = "/dashboard"
      if (role === "OWNER") targetUrl = "/dashboard/owner"
      else if (role === "SUPER_ADMIN") targetUrl = "/dashboard/admin"

      console.log("🔀 Login Page: Role-based redirect:", { role, targetUrl })
      router.replace(targetUrl)
    
    } catch (error) {
      setError("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
      setIsSuccess(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Background Grid */}
      <ModalGridBackground />
      
      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-8"
        >
          <SLOTSLogo className="mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-slate-400">Sign in to your SLOTS account</p>
        </motion.div>

        {/* Login Form */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl"
        >
          <div className="space-y-6">
            {/* Email Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setEmailError("")
                  }}
                  onKeyDown={(e) => {
                    setCapsOn(e.getModifierState("CapsLock"))
                  }}
                  placeholder="you@example.com"
                  className={`w-full pl-10 pr-4 py-3 bg-slate-800/50 border ${emailError ? "border-red-500" : "border-slate-700"} rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all`}
                />
              </div>
              {emailError && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-400 text-sm flex items-center gap-1"
                >
                  <AlertCircle className="h-4 w-4" />
                  {emailError}
                </motion.p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setPasswordError("")
                  }}
                  onKeyDown={(e) => {
                    setCapsOn(e.getModifierState("CapsLock"))
                  }}
                  placeholder="••••••••"
                  className={`w-full pl-10 pr-12 py-3 bg-slate-800/50 border ${passwordError ? "border-red-500" : "border-slate-700"} rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {passwordError && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-400 text-sm flex items-center gap-1"
                >
                  <AlertCircle className="h-4 w-4" />
                  {passwordError}
                </motion.p>
              )}
              {capsOn && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-amber-400 text-sm flex items-center gap-1"
                >
                  <AlertCircle className="h-4 w-4" />
                  Caps Lock is on
                </motion.p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-purple-500 focus:ring-purple-500/50"
                />
                <span className="text-sm text-slate-400">Remember me</span>
              </label>
              <a
                href="/forgot-password"
                className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                Forgot password?
              </a>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            {/* Submit Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25"
            >
              {isSuccess ? (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  Success!
                </>
              ) : isLoading ? (
                <>
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </motion.button>
          </div>

          {/* Register Link */}
          <div className="mt-6 text-center">
            <p className="text-slate-400 text-sm">
              Don't have an account?{" "}
              <a
                href="/register"
                className="text-purple-400 hover:text-purple-300 font-medium transition-colors"
              >
                Sign up
              </a>
            </p>
          </div>
        </motion.div>

        {/* Back to Home */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center mt-6"
        >
          <a
            href="/"
            className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
          >
            ← Back to home
          </a>
        </motion.div>
      </motion.div>
    </div>
  )
}