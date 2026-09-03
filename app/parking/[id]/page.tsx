"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft, Car, Clock, DollarSign, Shield, Camera,
  Info, X, Wifi, WifiOff, MapPin, Zap, Navigation,
  CreditCard, Battery, Accessibility
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"

const WS_URL = "ws://localhost:4000"

// Define types based on Prisma schema and API response
interface ParkingSlot {
  id: string
  slotNumber: number
  label?: string // Optional, fallback to slotNumber
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "DISABLED" // Uppercase from DB usually
  type: "STANDARD" | "COMPACT" | "LARGE" | "HANDICAP" | "EV"
  price?: number
  updatedBy?: string
  lastUpdate?: string
}

interface ParkingLocation {
  id: string
  name: string
  address?: string
  totalSlots: number
  availableSlots: number
  pricePerHour: number
  features: string[]
  slots: ParkingSlot[]
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.02
    }
  }
}

const itemVariants = {
  hidden: { 
    opacity: 0, 
    translateZ: -80, 
    rotateX: 4 
  },
  visible: { 
    opacity: 1, 
    translateZ: 0, 
    rotateX: 0,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1]
    }
  }
}

export default function ParkingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [location, setLocation] = useState<ParkingLocation | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<ParkingSlot | null>(null)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [hours, setHours] = useState(2) // Default 2 hours
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [animatingSlots, setAnimatingSlots] = useState<Set<string>>(new Set())
  const [timeRemaining, setTimeRemaining] = useState(900) // 15 minutes in seconds

  const wsRef = useRef<WebSocket | null>(null)
  const selectedSlotRef = useRef<ParkingSlot | null>(null)

  // Keep ref in sync
  useEffect(() => {
    selectedSlotRef.current = selectedSlot
  }, [selectedSlot])

  // Countdown timer for reservation hold
  useEffect(() => {
    if (showBookingModal && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => prev - 1)
      }, 1000)
      return () => clearInterval(timer)
    } else if (showBookingModal && timeRemaining === 0) {
      // Time expired, close modal and release slot
      setShowBookingModal(false)
      setSelectedSlot(null)
      setTimeRemaining(900) // Reset timer
      toast.error("Reservation time expired. Please select a slot again.")
    }
  }, [showBookingModal, timeRemaining])

  // Reset timer when modal opens
  useEffect(() => {
    if (showBookingModal) {
      setTimeRemaining(900)
    }
  }, [showBookingModal])

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        const res = await fetch(`/api/parking/${id}/slots`)

        if (!res.ok) {
          if (res.status === 404) {
            toast.error("Parking lot not found")
            router.push("/dashboard")
            return
          }
          throw new Error("Failed to fetch data")
        }

        const data = await res.json()

        // Transform the data to match our interface
        const apiSlots = data.slots || []
        const apiLot = data.lot || {}

        // Mock features if not present
        const features = apiLot.features || ["24/7 Access", "CCTV Surveillance", "Covered Parking", "Security Guard"]
        const price = apiLot.pricePerHour || 20 // Default price if missing

        const availableCount = apiSlots.filter((s: any) => s.status === "AVAILABLE" || s.status === "available").length

        setLocation({
          id: apiLot.id,
          name: apiLot.name || "Unknown Parking Lot",
          address: apiLot.address || "Location details unavailable",
          totalSlots: apiLot.totalSlots || apiSlots.length,
          availableSlots: availableCount,
          pricePerHour: price,
          features: features,
          slots: apiSlots.map((s: any) => ({
            ...s,
            status: s.status.toUpperCase(), // Ensure consistency
            label: s.label || s.slotNumber.toString()
          }))
        })
      } catch (error) {
        console.error("Error fetching parking data:", error)
        toast.error("Failed to load parking details. Please try again.")
      } finally {
        setIsLoading(false)
      }
    }

    if (id) {
      fetchData()
    }
  }, [id, router])

  // WebSocket Connection
  useEffect(() => {
    if (!id) return

    const connectWS = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return

      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        console.log("🟢 Connected to live updates")
        setIsConnected(true)
        ws.send(JSON.stringify({
          type: "SUBSCRIBE",
          lotId: id,
          role: "CUSTOMER"
        }))
      }

      ws.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data)

          if (update.type === "SLOT_UPDATE" || update.slotNumber !== undefined) {
            // Trigger animation for the changing slot
            setAnimatingSlots(prev => new Set(prev).add(update.slotNumber?.toString() || ""))
            
            // Remove animation after transition completes
            setTimeout(() => {
              setAnimatingSlots(prev => {
                const newSet = new Set(prev)
                newSet.delete(update.slotNumber?.toString() || "")
                return newSet
              })
            }, 500)

            setLocation(prev => {
              if (!prev) return prev

              const updatedSlots = prev.slots.map(slot => {
                if (slot.slotNumber === update.slotNumber) {
                  return { ...slot, status: update.status.toUpperCase() as any }
                }
                return slot
              })

              const newAvailableCount = updatedSlots.filter(s => s.status === "AVAILABLE").length

              return {
                ...prev,
                slots: updatedSlots,
                availableSlots: newAvailableCount
              }
            })

            // Check if selected slot was affected
            if (selectedSlotRef.current?.slotNumber === update.slotNumber &&
              update.status.toUpperCase() !== "AVAILABLE") {
              toast.warning(`Slot ${update.slotNumber} is no longer available`)
              setShowBookingModal(false)
              setSelectedSlot(null)
            }
          }
        } catch (err) {
          console.error("WS Parse error:", err)
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        wsRef.current = null
        // Reconnect logic could go here
      }

      ws.onerror = (err) => {
        console.error("WS Error:", err)
        setIsConnected(false)
      }
    }

    connectWS()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [id])

  const handleSlotClick = (slot: ParkingSlot) => {
    if (slot.status === "AVAILABLE") {
      setSelectedSlot(slot)
      setShowBookingModal(true)
    } else {
      toast.info(`Slot ${slot.label} is currently ${slot.status.toLowerCase()}`)
    }
  }

  const handleBooking = () => {
    if (!selectedSlot || !location) return
    router.push(`/booking/confirm?slotId=${selectedSlot.id}&locationId=${location.id}&hours=${hours}`)
  }

  const getSlotColor = (status: string) => {
    const s = status.toUpperCase()
    switch (s) {
      case "AVAILABLE": return {
        bg: "rgba(52, 211, 153, 0.12)",
        border: "rgba(52, 211, 153, 0.4)",
        text: "text-emerald-400",
        cursor: "cursor-pointer",
        hover: "hover:bg-emerald-500/20 hover:border-emerald-500/60 hover:shadow-lg hover:shadow-emerald-900/20"
      }
      case "OCCUPIED": return {
        bg: "rgba(229, 72, 77, 0.10)",
        border: "rgba(229, 72, 77, 0.3)",
        text: "text-red-400/50",
        cursor: "cursor-not-allowed",
        hover: ""
      }
      case "RESERVED": return {
        bg: "rgba(245, 158, 11, 0.10)",
        border: "rgba(245, 158, 11, 0.3)",
        text: "text-amber-400/50",
        cursor: "cursor-not-allowed",
        hover: ""
      }
      case "DISABLED": return {
        bg: "rgba(51, 65, 85, 0.3)",
        border: "rgba(51, 65, 85, 0.4)",
        text: "text-slate-500",
        cursor: "cursor-not-allowed",
        hover: ""
      }
      case "EV": return {
        bg: "rgba(20, 184, 166, 0.12)",
        border: "rgba(20, 184, 166, 0.4)",
        text: "text-teal-400",
        cursor: "cursor-pointer",
        hover: "hover:bg-teal-500/20 hover:border-teal-500/60 hover:shadow-lg hover:shadow-teal-900/20"
      }
      case "HANDICAP": return {
        bg: "rgba(71, 85, 105, 0.12)",
        border: "rgba(71, 85, 105, 0.4)",
        text: "text-slate-300",
        cursor: "cursor-pointer",
        hover: "hover:bg-slate-500/20 hover:border-slate-500/60 hover:shadow-lg hover:shadow-slate-900/20"
      }
      default: return {
        bg: "rgba(51, 65, 85, 0.3)",
        border: "rgba(51, 65, 85, 0.4)",
        text: "text-slate-500",
        cursor: "cursor-not-allowed",
        hover: ""
      }
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount)
  }

  if (isLoading || !location) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
        <p className="text-zinc-400 animate-pulse">Connecting to parking network...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20">
      {/* Immersive Header */}
      <div className="relative h-48 md:h-64 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/50 via-purple-900/30 to-black z-0" />
        <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-20 z-0" />

        <div className="absolute top-4 left-4 z-10">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="hover:bg-white/10 rounded-full text-white">
              <ArrowLeft className="h-6 w-6" />
            </Button>
          </Link>
        </div>

        <div className="container mx-auto h-full flex flex-col justify-end px-4 pb-6 relative z-10">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Badge variant="outline" className={`mb-2 ${isConnected ? 'border-emerald-500 text-emerald-400' : 'border-rose-500 text-rose-400'} bg-black/50 backdrop-blur-md`}>
              {isConnected ? (
                <span className="flex items-center gap-1.5"><Wifi className="h-3 w-3" /> Live Updates</span>
              ) : (
                <span className="flex items-center gap-1.5"><WifiOff className="h-3 w-3" /> Offline</span>
              )}
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              {location.name}
            </h1>
            <div className="flex items-center gap-2 text-gray-400 mt-2">
              <MapPin className="h-4 w-4" />
              <p className="max-w-xl truncate">{location.address}</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column: Stats & Info */}
          <div className="space-y-6 lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-2 gap-4"
            >
             <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="text-3xl font-bold text-emerald-400"
                  >
                    {location.availableSlots}
                  </motion.div>
                  <span className="text-zinc-500 text-xs">of {location.totalSlots} spots</span>
                </CardContent>
              </Card>
              <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
                    className="text-3xl font-bold text-indigo-400"
                  >
                    ₹{location.pricePerHour}
                  </motion.div>
                  <span className="text-zinc-500 text-xs">per hour</span>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
                <CardContent className="p-0">
                  <Tabs defaultValue="features" className="w-full">
                    <TabsList className="w-full rounded-none bg-zinc-900 p-0 h-10 border-b border-zinc-800">
                      <TabsTrigger value="features" className="flex-1 rounded-none data-[state=active]:bg-zinc-800 data-[state=active]:text-white h-full border-r border-zinc-800 text-xs uppercase tracking-wider">Features</TabsTrigger>
                      <TabsTrigger value="info" className="flex-1 rounded-none data-[state=active]:bg-zinc-800 data-[state=active]:text-white h-full text-xs uppercase tracking-wider">Details</TabsTrigger>
                    </TabsList>
                    <div className="p-4 min-h-[150px]">
                      <TabsContent value="features" className="mt-0">
                        <div className="flex flex-wrap gap-2">
                          {location.features.map((feature, i) => (
                            <Badge key={i} variant="secondary" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      </TabsContent>
                      <TabsContent value="info" className="mt-0 space-y-3 text-sm text-zinc-400">
                        <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                          <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> Hours</span>
                          <span>24/7 Open</span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          <span className="flex items-center gap-2"><Shield className="h-4 w-4" /> Security</span>
                          <span>Patrolled</span>
                        </div>
                      </TabsContent>
                    </div>
                  </Tabs>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right Column: Slot Selection */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Car className="h-5 w-5 text-indigo-400" />
                Select Spot
              </h2>
              <div className="flex flex-wrap gap-3 text-xs text-zinc-400 bg-zinc-900/50 p-2 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: "rgba(52, 211, 153, 0.12)", border: "1px solid rgba(52, 211, 153, 0.4)" }}>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div> <span className="text-emerald-400">Available</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: "rgba(245, 158, 11, 0.10)", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div> <span className="text-amber-400/70">Reserved</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: "rgba(229, 72, 77, 0.10)", border: "1px solid rgba(229, 72, 77, 0.3)" }}>
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div> <span className="text-red-400/50">Occupied</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: "rgba(51, 65, 85, 0.3)", border: "1px solid rgba(51, 65, 85, 0.4)" }}>
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-500"></div> <span className="text-slate-500">Disabled</span>
                </div>
              </div>
            </div>

            <Card className="bg-zinc-900 border-zinc-800 overflow-hidden relative min-h-[400px]">
              {/* Decorative driveway elements */}
              <div className="absolute inset-x-0 top-1/2 h-20 bg-zinc-950/30 -translate-y-1/2 z-0 border-y border-dashed border-zinc-800 pointer-events-none" />

              <CardContent className="p-6 relative z-10">
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3"
                >
                  {location.slots.map((slot, index) => {
                    const colors = getSlotColor(slot.status)
                    const slotStyle = slot.type === 'EV' ? getSlotColor('EV') : 
                                     slot.type === 'HANDICAP' ? getSlotColor('HANDICAP') : colors
                    const isAnimating = animatingSlots.has(slot.id)
                    return (
                    <motion.button
                      key={slot.id}
                      variants={itemVariants}
                      whileHover={slot.status === "AVAILABLE" || slot.type === 'EV' || slot.type === 'HANDICAP' ? { 
                        scale: 1.05, 
                        y: -2,
                        transition: { duration: 0.2 }
                      } : {}}
                      whileTap={slot.status === "AVAILABLE" || slot.type === 'EV' || slot.type === 'HANDICAP' ? { 
                        scale: 0.95 
                      } : {}}
                      onClick={() => handleSlotClick(slot)}
                      disabled={slot.status !== "AVAILABLE" && slot.type !== 'EV' && slot.type !== 'HANDICAP'}
                      className={`
                           relative aspect-[3/4] rounded-lg border flex flex-col items-center justify-between p-2 transition-all duration-300
                           ${slotStyle.cursor}
                           ${slotStyle.hover}
                           ${selectedSlot?.id === slot.id ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 !scale-105 z-10 shadow-lg shadow-emerald-900/20' : ''}
                         `}
                      style={{
                        background: slotStyle.bg,
                        borderColor: slotStyle.border,
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                      }}
                    >
                      {/* Pulse animation for live status changes */}
                      {isAnimating && (
                        <motion.div
                          className="absolute inset-0 rounded-lg"
                          initial={{ scale: 0.8, opacity: 0.5 }}
                          animate={{ scale: 1.5, opacity: 0 }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                          style={{
                            background: slot.status === "AVAILABLE" ? "rgba(52, 211, 153, 0.3)" :
                                   slot.status === "OCCUPIED" ? "rgba(229, 72, 77, 0.3)" :
                                   slot.status === "RESERVED" ? "rgba(245, 158, 11, 0.3)" :
                                   "rgba(51, 65, 85, 0.3)"
                          }}
                        />
                      )}
                      
                      <span className={`text-xs font-medium opacity-70 ${slotStyle.text} relative z-10`}>{slot.label}</span>

                      {/* Icon based on type */}
                      <div className="flex-1 flex items-center justify-center relative z-10">
                        {slot.type === 'EV' && <Zap className={`h-4 w-4 ${slotStyle.text}`} />}
                        {slot.type === 'HANDICAP' && <Accessibility className={`h-4 w-4 ${slotStyle.text}`} />}
                        {slot.type === 'COMPACT' && <span className={`text-[10px] font-bold ${slotStyle.text}`}>S</span>}
                        {!['EV', 'HANDICAP', 'COMPACT'].includes(slot.type) && <Car className={`h-4 w-4 ${slotStyle.text}`} />}
                      </div>

                      {selectedSlot?.id === slot.id && (
                        <motion.div layoutId="selection" className="absolute inset-0 border-2 border-white rounded-lg pointer-events-none z-20" />
                      )}
                    </motion.button>
                  )})}
                </motion.div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Booking Modal/Drawer */}
      <AnimatePresence>
        {showBookingModal && selectedSlot && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
              onClick={() => setShowBookingModal(false)}
            />

            <motion.div
              initial={{ scale: 0.9, rotateX: 8, translateZ: -120, opacity: 0 }}
              animate={{ scale: 1, rotateX: 0, translateZ: 0, opacity: 1 }}
              exit={{ scale: 0.9, rotateX: 8, translateZ: -120, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200, duration: 0.5 }}
              className="fixed inset-x-0 bottom-0 z-[70] bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-700/50 rounded-t-3xl shadow-2xl md:max-w-xl md:mx-auto md:bottom-4 md:rounded-2xl md:border md:inset-x-auto md:w-full"
              style={{
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset"
              }}
            >
              <div className="flex justify-between items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-transform hover:rotate-90"
                  onClick={() => setShowBookingModal(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${timeRemaining < 60 ? 'bg-red-400 animate-pulse' : 'bg-emerald-400 animate-pulse'}`} />
                    <span className={`text-xs font-medium ${timeRemaining < 60 ? 'text-red-400' : 'text-emerald-400'}`}>TIMER ACTIVE</span>
                  </div>
                  <div className="text-xs font-mono text-zinc-400">
                    {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                  </div>
                </div>
                <div className="w-8" /> {/* Spacer for balance */}
              </div>

              <div className="p-6 space-y-6">
                {/* Selected Spot Card */}
                <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800 relative overflow-hidden" style={{
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.03) inset"
                }}>
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl" />
                  <div className="flex justify-between items-start relative z-10">
                    <div>
                      <Badge variant="outline" className="mb-2 border-emerald-500/50 text-emerald-400 bg-emerald-500/10">
                        Ready to Book
                      </Badge>
                      <h3 className="text-2xl font-bold" style={{ textShadow: "0 0 20px rgba(99, 102, 241, 0.5)" }}>Slot {selectedSlot.label || selectedSlot.slotNumber}</h3>
                      <p className="text-zinc-400 text-sm max-w-[200px] truncate">{location.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-500 uppercase tracking-wide">Rate</p>
                      <p className="text-xl font-bold text-indigo-400">₹{location.pricePerHour}<span className="text-sm font-normal text-zinc-500">/hr</span></p>
                    </div>
                  </div>
                </div>

                <Separator className="bg-zinc-800" />

                {/* Duration Slider/Controls */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-zinc-300">Duration Needed</label>
                    <motion.span
                      key={hours}
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400"
                    >
                      {hours} Hr
                    </motion.span>
                  </div>

                  <div className="flex items-center gap-4 bg-zinc-950/50 p-2 rounded-xl border border-zinc-800">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-white hover:bg-zinc-800 transition-colors"
                      onClick={() => setHours(h => Math.max(1, h - 1))}
                      disabled={hours <= 1}
                    >
                      -
                    </Button>
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden relative">
                      <motion.div
                        className="h-full absolute left-0 top-0 bottom-0 transition-all duration-300"
                        style={{
                          background: "linear-gradient(to right, var(--accent), #818cf8)",
                          width: `${(hours / 12) * 100}%`,
                          boxShadow: "0 0 10px rgba(99, 102, 241, 0.5)"
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(hours / 12) * 100}%` }}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-white hover:bg-zinc-800 transition-colors"
                      onClick={() => setHours(h => Math.min(12, h + 1))}
                      disabled={hours >= 12}
                    >
                      +
                    </Button>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>MIN. 1H</span>
                    <span>SCALE TO NEEDS</span>
                    <span>MAX. 24H</span>
                  </div>
                </div>

                {/* Cost Breakdown */}
                <div className="bg-zinc-950 rounded-xl p-4 space-y-2 border border-zinc-800" style={{
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.03) inset"
                }}>
                  <div className="flex justify-between text-sm text-zinc-400">
                    <span>Rate (x{hours})</span>
                    <span>{formatCurrency(location.pricePerHour * hours)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-zinc-400">
                    <span>Service Fee</span>
                    <span>{formatCurrency(10)}</span>
                  </div>
                  <Separator className="bg-zinc-800 my-2" />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total Payable</span>
                    <motion.span
                      key={hours}
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="text-indigo-400"
                    >
                      {formatCurrency((location.pricePerHour * hours) + 10)}
                    </motion.span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3 pt-2">
                  <Button
                    size="lg"
                    className="w-full h-14 text-lg font-semibold transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-indigo-900/20 active:scale-[0.98]"
                    style={{
                      background: "linear-gradient(to right, var(--accent), #818cf8)",
                      boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)"
                    }}
                    onClick={handleBooking}
                  >
                    Proceed to Payment {formatCurrency((location.pricePerHour * hours) + 10)}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all duration-300"
                    style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}
                    onClick={() => setShowBookingModal(false)}
                  >
                    Change Spot
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
