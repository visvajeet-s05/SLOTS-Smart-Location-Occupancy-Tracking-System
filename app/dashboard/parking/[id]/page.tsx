"use client"

import { useEffect, useState, Suspense, useRef } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import SlotGrid from "@/components/SlotGrid"
import { motion, AnimatePresence } from "framer-motion"
import { MapPin, Clock, CreditCard, Car, CheckCircle2, ChevronDown, Building2, BatteryCharging, Accessibility, Zap, Timer, ArrowLeft, ShieldCheck, X, ArrowRight, Activity, AlertCircle } from "lucide-react"
import { useParkingSocket } from "@/hooks/useParkingSocket"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  VisuallyHidden,
} from "@/components/ui/dialog"
import PaymentModal from "@/components/booking/PaymentModal"

type Slot = {
  id: string
  slotNumber: number
  row: string
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "DISABLED" | "CLOSED"
  aiConfidence: number
  updatedBy: "AI" | "OWNER" | "CUSTOMER" | "SYSTEM"
  updatedAt: string
  price: number
  slotType?: string
}

type ParkingLot = {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  status: string
}

// Local types

function CustomerParkingContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { data: session } = useSession()
  const lotId = params.id as string

  const [slots, setSlots] = useState<Slot[]>([])
  const [lot, setLot] = useState<ParkingLot | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showLotSelector, setShowLotSelector] = useState(false)
  const [availableLots, setAvailableLots] = useState<any[]>([])
  const [duration, setDuration] = useState(2)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(900) // 15 minutes in seconds
  const [localTime, setLocalTime] = useState(new Date())
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState<Date | null>(null)
  const [selectable, setSelectable] = useState(true)
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null) // Vehicle selection (full object)
  const [vehicles, setVehicles] = useState<any[]>([]) // User's vehicles

  // Keep ref in sync
  const selectedSlotRef = useRef(selectedSlot)
  useEffect(() => {
    selectedSlotRef.current = selectedSlot
  }, [selectedSlot])

  // Countdown timer for reservation hold
  useEffect(() => {
    if (selectedSlot && !showPaymentModal && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => prev - 1)
      }, 1000)
      return () => clearInterval(timer)
    } else if (selectedSlot && !showPaymentModal && timeRemaining === 0) {
      // Time expired, close modal and release slot
      setSelectedSlot(null)
      setTimeRemaining(900) // Reset timer
      toast({
        title: "Reservation time expired",
        description: "Please select a slot again.",
        variant: "destructive"
      })
    }
  }, [selectedSlot, showPaymentModal, timeRemaining, toast])

  // Reset timer when slot is selected
  useEffect(() => {
    if (selectedSlot) {
      setTimeRemaining(900)
    }
  }, [selectedSlot])

  // Update local time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setLocalTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch user's vehicles for vehicle selection
  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const res = await fetch("/api/user/profile")
        if (res.ok) {
          const data = await res.json()
          console.log("🚗 Vehicle data from API:", data)
          
          if (data.vehicles && data.vehicles.length > 0) {
            console.log("🚗 Using vehicles array:", data.vehicles)
            setVehicles(data.vehicles)
            // Auto-select the first vehicle if only one, or default vehicle if marked
            if (data.vehicles.length === 1) {
              setSelectedVehicle(data.vehicles[0])
            } else {
              const defaultVehicle = data.vehicles.find((v: any) => v.isDefault)
              if (defaultVehicle) {
                setSelectedVehicle(defaultVehicle)
              }
            }
          } else if (data.vehicle) {
            // Fallback for single vehicle
            console.log("🚗 Using single vehicle fallback:", data.vehicle)
            setVehicles([data.vehicle])
            if (data.vehicle.plate) {
              setSelectedVehicle(data.vehicle)
            }
          } else {
            console.log("🚗 No vehicles found in response")
          }
        } else {
          console.error("🚗 Failed to fetch profile:", res.status)
        }
      } catch (error) {
        console.error("Failed to fetch vehicles:", error)
      }
    }
    fetchVehicles()
  }, [])
  const { isConnected: wsConnected, lastHeartbeat, lastDataTimestamp, reconnectAttempts } = useParkingSocket({
    lotId: lotId,
    onSlotUpdate: (data) => {
      setSlots(prev => prev.map(slot =>
        slot.id === data.slotId
          ? { ...slot, status: data.status }
          : slot
      ))
      setLastUpdateTimestamp(new Date(data.timestamp))

      // Clear selection if slot becomes unavailable, UNLESS we are currently booking it (modal open)
      // This prevents the "Reserved" status update from kicking the user out of the payment flow
      if (selectedSlot?.id === data.slotId && data.status !== "AVAILABLE" && !showPaymentModal) {
        setSelectedSlot(null)
      }
    },
    onConnect: () => {
      setSelectable(true)
    },
    onDisconnect: () => {
      setSelectable(false)
    },
    onBulkUpdate: () => {
      // Refresh all slots after bulk update
      fetch(`/api/parking/${lotId}/slots`)
        .then(res => res.json())
        .then(data => {
          if (data.slots) {
            setSlots(data.slots)
          }
        })
    }
  })

  useEffect(() => {
    // Fetch parking lot details
    fetch(`/api/parking/${lotId}`)
      .then(res => res.json())
      .then(data => {
        setLot(data.lot)
      })
      .catch(err => console.error("Failed to fetch lot:", err))

    // Fetch slots
    fetch(`/api/parking/${lotId}/slots`)
      .then(res => res.json())
      .then(data => {
        setSlots(data.slots || [])
        setIsLoading(false)
      })
      .catch(err => {
        console.error("Failed to fetch slots:", err)
        setIsLoading(false)
      })

    // Fetch all lots for the selector
    fetch(`/api/parking`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAvailableLots(data.parkingAreas || [])
        }
      })
  }, [lotId])

  const handleLotChange = (newLotId: string) => {
    router.push(`/dashboard/parking/${newLotId}`)
    setShowLotSelector(false)
  }

  const handleSlotSelect = (slot: Slot) => {
    if (slot.status === "AVAILABLE") {
      setSelectedSlot(slot)
    }
  }

  const handleBooking = () => {
    if (!selectedSlot || !lot || !selectedVehicle) return
    setShowPaymentModal(true)
  }

  const handlePaymentSuccess = () => {
    // Refresh slots
    fetch(`/api/parking/${lotId}/slots`)
      .then(res => res.json())
      .then(data => {
        if (data.slots) {
          setSlots(data.slots)
        }
      })

    // Selected slot will be cleared when the modal closes or user navigates away
    // We can keep the modal open to show success state
  }

  // Handle Stripe Redirect Success
  useEffect(() => {
    const paymentIntentSecret = searchParams.get("payment_intent_client_secret")
    const redirectStatus = searchParams.get("redirect_status")

    if (paymentIntentSecret && redirectStatus === "succeeded") {
      const newUrl = window.location.pathname
      window.history.replaceState({}, '', newUrl)

      toast({
        title: "Payment Successful",
        description: "Your booking has been confirmed.",
      })
      handlePaymentSuccess()
    }
  }, [searchParams])

  const availableCount = slots.filter(s => s.status === "AVAILABLE").length
  const totalCount = slots.length

  // Real pricing calculation with service fee and GST
  const baseRate = selectedSlot?.price || 0
  const serviceFee = 10 // Fixed service fee
  const subtotal = baseRate * duration + serviceFee
  const gst = Math.round(subtotal * 0.18) // 18% GST
  const total = subtotal + gst

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ background: '#05060A' }}>
        <div className="text-center space-y-4">
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin"></div>
            <div className="absolute inset-2 rounded-full border-r-2 border-primary/50 animate-spin-slow"></div>
          </div>
          <p className="text-gray-400 font-medium tracking-wide animate-pulse">Synchronizing with Parking Grid...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full text-white selection:bg-cyan-500/30 font-sans" style={{ background: '#05060A' }}>
      {/* Premium Header */}
      <header className="sticky top-0 z-50 glass border-b border-white/5 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="hover:bg-white/10 text-gray-400 hover:text-white rounded-xl"
              >
                <ArrowLeft size={20} />
              </Button>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-1">
                  <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2 truncate max-w-[200px] sm:max-w-none">
                    {lot?.name || "Parking Lot"}
                    {wsConnected ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider shrink-0">
                        Live
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px font-bold uppercase tracking-wider shrink-0">
                        Demo Data
                      </span>
                    )}
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} className="text-primary/70" />
                    <span>{lot?.address || "Loading location..."}</span>
                  </div>
                  <div className="w-1 h-1 rounded-full bg-gray-700 hidden sm:block"></div>
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck size={12} className="text-emerald-500/70" />
                    <span>Secure Zone</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Indicators */}
            <div className="flex items-center gap-3 sm:gap-6 shrink-0">
              {/* Free Spots */}
              <div className="bg-white/5 border border-white/10 rounded-xl px-3 sm:px-4 py-2 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                    <Car size={16} className="text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none">Free Spots</div>
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="text-base sm:text-lg font-black text-white tabular-nums leading-none mt-0.5"
                    >
                      <span className="text-emerald-400">{availableCount}</span>
                      <span className="text-xs sm:text-sm text-gray-600 font-medium">/ {totalCount}</span>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 py-8 sm:py-10">
        <div className="space-y-6">
          {/* Main Slot Grid Section - Full Width */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-[2.5rem] p-6 sm:p-8 md:p-12 border-white/5 relative overflow-hidden group min-h-[60vh]"
          >
            {/* Decorative background glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/20 transition-all duration-1000"></div>

            <div className="relative z-10">
              {/* Reconnection Banner - Only show when disconnected */}
              {!wsConnected && lastUpdateTimestamp && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-6 p-4 rounded-xl border-2 border-amber-500/30 bg-amber-500/10 backdrop-blur-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <div>
                      <p className="font-bold text-amber-400 text-sm">Reconnecting...</p>
                      <p className="text-xs text-amber-300">
                        Showing last known state as of {lastUpdateTimestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Slot Selection</h2>
                  <p className="text-gray-400 text-sm">
                    {wsConnected 
                      ? "Tap an available spot to initiate your booking session" 
                      : "Waiting for reconnection — booking disabled until data refreshes"
                    }
                  </p>
                </div>
              </div>

              <SlotGrid
                slots={slots}
                selectable={selectable && wsConnected}
                onSelect={handleSlotSelect}
                isStale={!wsConnected}
              />
            </div>
          </motion.div>
        </div>
      </main>

      {/* Checkout Dialog - Wide Horizontal Card */}
      <Dialog open={!!selectedSlot && !showPaymentModal} onOpenChange={(open) => !open && setSelectedSlot(null)}>
        <DialogContent hideCloseButton className="bg-neutral-900/95 backdrop-blur-xl border border-neutral-800 text-white max-w-4xl p-0 overflow-hidden rounded-2xl" style={{
          boxShadow: "0 20px 60px -15px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08) inset, 0 0 40px -10px rgba(99, 102, 241, 0.15)"
        }}>
          <VisuallyHidden>
            <DialogTitle>Checkout</DialogTitle>
          </VisuallyHidden>
          <motion.div
            initial={{ scale: 0.9, rotateX: 8, translateZ: -120, opacity: 0 }}
            animate={{ scale: 1, rotateX: 0, translateZ: 0, opacity: 1 }}
            exit={{ scale: 0.9, rotateX: 8, translateZ: -120, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="p-6"
          >
            {/* Top Header */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800/80">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-neutral-800 border border-neutral-700/60 text-white">
                  <CreditCard size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold tracking-wide uppercase font-mono">CHECKOUT</h3>
                    <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">SECURE</span>
                  </div>
                  <p className="text-xs text-neutral-400 font-mono">TIMER ACTIVE • SECURE CHANNEL</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Countdown Timer */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 font-mono text-xs">
                  <span className={`h-2 w-2 rounded-full ${timeRemaining < 120 ? 'bg-amber-400 animate-pulse' : timeRemaining < 60 ? 'bg-red-400 animate-pulse' : 'bg-emerald-400 animate-pulse'}`}></span>
                  <span className={`${timeRemaining < 120 ? 'text-amber-400' : timeRemaining < 60 ? 'text-red-400' : 'text-emerald-400'} font-bold`}>
                    {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                  </span>
                  {timeRemaining < 120 && (
                    <span className="text-amber-400 text-[10px] ml-1">Hold expiring soon</span>
                  )}
                </div>
                {/* Close Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedSlot(null)}
                  className="h-8 w-8 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-transform hover:rotate-90"
                >
                  <X size={16} />
                </Button>
              </div>
            </div>

            {selectedSlot && (
              <>
                {/* Horizontal 3-Column Content */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6">
                  
                  {/* Col 1: Selected Spot */}
                  <div className="bg-[#13161C] border border-white/6 rounded-xl p-5 flex flex-col justify-between" style={{
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.03) inset"
                  }}>
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-3">SELECTED SPOT</span>
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-extrabold font-mono text-white">S{selectedSlot.slotNumber}</span>
                        <span className="text-xs font-mono text-slate-400">{selectedSlot.row} ZONE</span>
                        {selectedSlot.slotType === "EV" && <span className="text-xs font-mono text-cyan-400">⚡ EV</span>}
                        {selectedSlot.slotType === "ACCESSIBLE" && <span className="text-xs font-mono text-blue-400">♿ Accessible</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold text-white">₹{selectedSlot.price}</span>
                        <span className="text-xs text-slate-500 font-mono">/hr</span>
                      </div>
                    </div>
                  </div>

                  {/* Col 2: Parking Time Stepper */}
                  <div className="bg-[#13161C] border border-white/6 rounded-xl p-5 flex flex-col justify-between" style={{
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.03) inset"
                  }}>
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-3">PARKING DURATION</span>
                    <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-lg p-1.5">
                      <button 
                        onClick={() => setDuration(Math.max(1, duration - 1))}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 font-bold font-mono text-sm transition-colors"
                      >-</button>
                      <motion.div
                        key={duration}
                        initial={{ y: -5, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.15 }}
                        className="text-center font-mono flex items-center"
                      >
                        <span className="text-xl font-bold text-white">{duration}</span>
                        <span className="text-xs text-neutral-400 ml-1">HRS</span>
                      </motion.div>
                      <button 
                        onClick={() => setDuration(Math.min(24, duration + 1))}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 font-bold font-mono text-sm transition-colors"
                      >+</button>
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-slate-500 mt-2">
                      <span>MIN 1H</span>
                      <span>MAX 24H</span>
                    </div>
                  </div>

                  {/* Col 3: Total Estimate - Enhanced */}
                  <div className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border-2 border-indigo-500/30 rounded-xl p-5 flex flex-col justify-between" style={{
                    boxShadow: "0 4px 20px rgba(99, 102, 241, 0.3), 0 0 0 1px rgba(99, 102, 241, 0.2) inset"
                  }}>
                    <div>
                      <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-wider block mb-1">TOTAL ESTIMATE</span>
                      <p className="text-[10px] text-indigo-200">Itemized with service fee & GST</p>
                    </div>
                    <div className="text-right space-y-1">
                      <motion.div
                        key={duration}
                        initial={{ y: -5, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.15 }}
                        className="text-3xl font-black text-white tracking-tight font-mono"
                      >
                        ₹{total}
                      </motion.div>
                      <div className="text-[9px] text-indigo-300 font-mono space-y-0.5">
                        <div>Base: ₹{baseRate * duration}</div>
                        <div>Service: ₹{serviceFee}</div>
                        <div>GST (18%): ₹{gst}</div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Vehicle Selection - Required */}
                <div className="bg-[#13161C] border border-white/6 rounded-xl p-5" style={{
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.03) inset"
                }}>
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-3">VEHICLE SELECTION *</span>
                  {vehicles.length > 0 ? (
                    <div className="space-y-2">
                      {vehicles.map((vehicle) => (
                        <button
                          key={vehicle.id}
                          onClick={() => setSelectedVehicle(vehicle)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                            selectedVehicle?.plate === vehicle.plate
                              ? "bg-indigo-500/10 border-indigo-500/30"
                              : "bg-neutral-900 border-neutral-800 hover:border-neutral-700"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Car className="w-4 h-4 text-slate-400" />
                            <div className="text-left">
                              <p className="text-sm font-medium text-white">{vehicle.model}</p>
                              <p className="text-xs font-mono text-slate-400">{vehicle.plate}</p>
                            </div>
                          </div>
                          {selectedVehicle?.plate === vehicle.plate && (
                            <CheckCircle2 className="w-5 h-5 text-indigo-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <AlertCircle className="w-5 h-5 text-amber-400" />
                      <div>
                        <p className="text-sm font-medium text-amber-400">No registered vehicles</p>
                        <p className="text-xs text-amber-300">Please add a vehicle in your profile first</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Action Footer */}
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedSlot(null)}
                    className="h-14 px-6 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-300 text-sm font-medium transition-colors w-40"
                  >
                    Change Spot
                  </Button>

                  <Button
                    onClick={() => {
                      if (!selectedVehicle) {
                        // Close the dialog first, then navigate to profile
                        setSelectedSlot(null)
                        setTimeout(() => {
                          router.push("/dashboard/profile")
                        }, 100)
                        return
                      }
                      handleBooking()
                    }}
                    disabled={!selectedSlot}
                    className="h-14 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>{selectedVehicle ? "PROCEED TO PAYMENT" : "ADD VEHICLE FIRST"}</span>
                    <ArrowRight size={16} />
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      {selectedSlot && lot && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          slotId={selectedSlot.id}
          slotNumber={selectedSlot.slotNumber.toString()}
          parkingName={lot.name}
          parkingLotId={lotId}
          pricePerHour={selectedSlot.price}
          duration={duration}
          onSuccess={handlePaymentSuccess}
          parkingAddress={lot?.address ?? "123 Main St, Downtown"}
          slotType={selectedSlot.slotType}
          vehiclePlate={selectedVehicle?.plate || ""}
          vehicleModel={selectedVehicle?.model || ""}
          totalAmount={total}
          serviceFee={serviceFee}
          gst={gst}
        />
      )}
    </div>
  )
}

export default function CustomerParkingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full bg-mesh flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin"></div>
            <div className="absolute inset-2 rounded-full border-r-2 border-primary/50 animate-spin-slow"></div>
          </div>
          <p className="text-gray-400 font-medium tracking-wide animate-pulse">Initializing Parking Grid...</p>
        </div>
      </div>
    }>
      <CustomerParkingContent />
    </Suspense>
  )
}
