"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { motion, AnimatePresence } from "framer-motion"
import {
    CreditCard,
    CheckCircle2,
    ShieldCheck,
    Clock,
    Car,
    ScrollText,
    Wallet,
    Building2,
    Smartphone,
    QrCode,
    Tag,
    X,
    Loader2,
    ArrowLeft,
    Check,
    Download,
    MapPin,
    Share2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import Confetti from "react-confetti"
import QRCode from "qrcode"
import { useRouter } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, LinkAuthenticationElement, useStripe, useElements } from "@stripe/react-stripe-js"

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

type PaymentModalProps = {
    isOpen: boolean
    onClose: () => void
    slotId: string
    slotNumber: string
    parkingName: string
    parkingLotId: string
    pricePerHour: number
    duration: number
    onSuccess: () => void
    parkingAddress?: string
    slotType?: string
    vehiclePlate?: string
    vehicleModel?: string
    totalAmount?: number
    serviceFee?: number
    gst?: number
}

export default function PaymentModal({
    isOpen,
    onClose,
    slotId,
    slotNumber,
    parkingName,
    parkingLotId,
    pricePerHour,
    duration,
    onSuccess,
    parkingAddress = "123 Main St, Downtown",
    slotType = "STANDARD",
    vehiclePlate = "",
    vehicleModel = "",
    totalAmount = 0,
    serviceFee = 10,
    gst = 0
}: PaymentModalProps) {
    const { toast } = useToast()
    const [clientSecret, setClientSecret] = useState("")
    const [bookingId, setBookingId] = useState("")
    const [isMock, setIsMock] = useState(false)
    const [step, setStep] = useState(1)

    // Use the slotType prop directly in pricing calculations
    const currentSlotType = slotType
    const basePrice = pricePerHour * duration
    const evPremium = currentSlotType === "EV" ? 20 * duration : 0
    const subtotal = basePrice + evPremium + serviceFee
    const total = totalAmount || subtotal + gst

    // Use the vehicle data from prop
    const plateToUse = vehiclePlate || "TN-EX-9999"
    const modelToUse = vehicleModel || localVehicleModel || "Registered Vehicle"

    // Fetch Client Secret on Open
    useEffect(() => {
        if (isOpen) {
            const createIntent = async (retryCount = 0) => {
                const controller = new AbortController()
                const timeoutMs = 45000 // 45s for slower connections
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

                try {
                    console.log(`[PAYMENT] Attempt ${retryCount + 1}: Initializing intent call...`)
                    const res = await fetch("/api/payments/create-intent", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            slotId,
                            duration,
                            amount: total,
                            parkingLotId,
                            licensePlate: plateToUse,
                            vehicleModel: vehicleModel || localVehicleModel || modelToUse,
                            currency: "inr"
                        }),
                        signal: controller.signal
                    })

                    clearTimeout(timeoutId)

                    if (!res.ok) {
                        const textResponse = await res.text()
                        console.error("[PAYMENT] API Error Response (raw):", textResponse, "Status:", res.status)
                        let errData
                        try {
                            errData = JSON.parse(textResponse)
                        } catch {
                            errData = { error: "Unknown Error", rawResponse: textResponse }
                        }
                        console.error("[PAYMENT] API Error Response (parsed):", errData)

                        // Handle specific business errors
                        if (res.status === 409) {
                            const errorMsg = errData.message || errData.error || "Slot is no longer available. Someone else might be booking it."
                            toast({
                                title: "Slot Unavailable",
                                description: errorMsg,
                                variant: "destructive"
                            })
                            onClose()
                            return
                        }
                        throw new Error(errData.message || errData.error || "Server failed to create payment session")
                    }

                    const data = await res.json()
                    console.log("[PAYMENT] Intent created successfully", { isMock: data.isMock, bookingId: data.bookingId })
                    
                    setClientSecret(data.clientSecret)
                    setBookingId(data.bookingId)
                    setIsMock(data.isMock)
                } catch (error: any) {
                    clearTimeout(timeoutId)
                    console.error("[PAYMENT] Failed to initialize payment flow:", {
                        name: error.name,
                        message: error.message,
                        attempt: retryCount + 1
                    })
                    
                    let message = error.message || "Could not set up payment. Please try again."
                    
                    if (error.name === 'AbortError') {
                        message = "The request timed out. Our servers are a bit busy, please try once more."
                        
                        // Auto-retry once for timeouts
                        if (retryCount < 1) {
                            console.log("[PAYMENT] Auto-retrying once due to timeout...")
                            return createIntent(retryCount + 1)
                        }
                    }

                    toast({
                        title: "Checkout Problem",
                        description: message,
                        variant: "destructive"
                    })
                    
                    // Don't close immediately — let them see the error for 5 seconds
                    // If it's a "no longer available" error, close faster so they can pick a new one
                    const closeDelay = error.message.includes("no longer available") ? 2500 : 5000
                    setTimeout(() => {
                        if (isOpen) onClose()
                    }, closeDelay)
                }
            }
            createIntent()
        }
    }, [isOpen, slotId, duration, total, parkingLotId, toast, vehiclePlate, vehicleModel])

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`bg-slate-950 border border-slate-800 rounded-2xl md:rounded-3xl w-full ${step === 2 ? 'max-w-6xl h-[95vh] md:h-[90vh]' : 'max-w-4xl h-fit max-h-[95vh] md:max-h-[90vh]'} overflow-hidden flex flex-col shadow-2xl relative transition-all duration-500 m-2 md:m-0`}
                >
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-slate-900 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition z-50 border border-white/5"
                    >
                        <X size={20} />
                    </button>

                    {clientSecret && clientSecret.startsWith("mock_secret") ? (
                        <div className="h-full flex flex-col">
                            <CheckoutContent
                                clientSecret={clientSecret}
                                bookingId={bookingId}
                                total={total}
                                slotNumber={slotNumber}
                                parkingName={parkingName}
                                duration={duration}
                                pricePerHour={pricePerHour}
                                subtotal={subtotal}
                                serviceFee={serviceFee}
                                basePrice={basePrice}
                                evPremium={evPremium}
                                gst={gst}
                                onSuccess={onSuccess}
                                onClose={onClose}
                                isMock={true}
                                slotId={slotId}
                                parkingLotId={parkingLotId}
                                parkingAddress={parkingAddress}
                                step={step}
                                setStep={setStep}
                                slotType={currentSlotType}
                                vehiclePlate={vehiclePlate}
                                vehicleModel={vehicleModel}
                            />
                        </div>
                    ) : clientSecret ? (
                        <Elements
                            stripe={stripePromise}
                            options={{
                                clientSecret,
                                appearance: {
                                    theme: 'night',
                                    variables: {
                                        colorPrimary: '#06b6d4',
                                        colorBackground: '#0B0E14',
                                        colorText: '#f8fafc',
                                        colorDanger: '#ef4444',
                                        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                                        borderRadius: '12px',
                                        spacingUnit: '4px',
                                        gridRowSpacing: '16px'
                                    }
                                }
                            }}
                        >
                            <CheckoutContent
                                clientSecret={clientSecret}
                                bookingId={bookingId}
                                total={total}
                                slotNumber={slotNumber}
                                parkingName={parkingName}
                                duration={duration}
                                pricePerHour={pricePerHour}
                                subtotal={subtotal}
                                serviceFee={serviceFee}
                                basePrice={basePrice}
                                evPremium={evPremium}
                                gst={gst}
                                onSuccess={onSuccess}
                                onClose={onClose}
                                isMock={isMock}
                                slotId={slotId}
                                parkingLotId={parkingLotId}
                                parkingAddress={parkingAddress}
                                step={step}
                                setStep={setStep}
                                slotType={currentSlotType}
                                vehiclePlate={vehiclePlate}
                                vehicleModel={vehicleModel}
                            />
                        </Elements>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[50vh] gap-6 text-center px-6">
                            <div className="relative">
                                <Loader2 className="w-16 h-16 text-cyan-500 animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <ShieldCheck className="w-6 h-6 text-cyan-500/50" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <p className="text-white text-xl font-bold">Initializing Secure Checkout</p>
                                <p className="text-slate-400 text-sm max-w-[280px]">Configuring encrypted tunnel to payment gateway...</p>
                            </div>
                            <Button
                                variant="ghost"
                                onClick={onClose}
                                className="mt-4 text-slate-500 hover:text-white"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Cancel and Return
                            </Button>
                        </div>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    )
}

interface CheckoutContentProps {
    clientSecret: string
    bookingId: string
    total: number
    slotNumber: string
    parkingName: string
    duration: number
    pricePerHour: number
    subtotal: number
    serviceFee: number
    basePrice?: number
    evPremium?: number
    gst?: number
    onSuccess: () => void
    onClose: () => void
    isMock?: boolean
    slotId: string
    parkingLotId: string
    parkingAddress: string
    step: number
    setStep: (step: number) => void
    slotType?: string
    vehiclePlate?: string
    vehicleModel?: string
}

function CheckoutContent({
    clientSecret,
    bookingId,
    total,
    slotNumber,
    parkingName,
    duration,
    pricePerHour,
    subtotal,
    serviceFee,
    basePrice = 0,
    evPremium = 0,
    gst = 0,
    onSuccess,
    onClose,
    isMock = false,
    slotId,
    parkingLotId,
    parkingAddress,
    step,
    setStep,
    slotType = "STANDARD",
    vehiclePlate = "",
    vehicleModel = ""
}: CheckoutContentProps) {
    const stripe = isMock ? null : useStripe()
    const elements = isMock ? null : useElements()
    const { toast } = useToast()
    const router = useRouter()
    const { data: session } = useSession() // <-- Added session

    const [isProcessing, setIsProcessing] = useState(false)
    const [qrBase64, setQrBase64] = useState("")
    const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })

    // Vehicle Data
    const [licensePlate, setLicensePlate] = useState("")
    const [localVehicleModel, setLocalVehicleModel] = useState("")
    const [isLoadingProfile, setIsLoadingProfile] = useState(true)
    const [selectedMethod, setSelectedMethod] = useState<"card" | "upi" | "netbanking" | null>(null)

    // Use the vehicle plate from prop
    const plateToUse = vehiclePlate || licensePlate || "TN-EX-9999"

    useEffect(() => {
        if (typeof window !== "undefined") {
            setWindowSize({ width: window.innerWidth, height: window.innerHeight })
        }

        // Pre-fill vehicle data if provided from checkout
        if (vehiclePlate) {
            setLicensePlate(vehiclePlate)
            setLocalVehicleModel(vehicleModel || "Registered Vehicle")
            setIsLoadingProfile(false)
        } else {
            // Fetch Profile only if no vehicle provided
            const fetchProfile = async () => {
                try {
                    const res = await fetch("/api/user/profile")
                    if (res.ok) {
                        const data = await res.json()
                        if (data.vehicle) {
                            setLicensePlate(data.vehicle.licensePlate)
                            setLocalVehicleModel(data.vehicle.model)
                        }
                    }
                } catch (error) {
                    console.error("Failed to fetch profile", error)
                } finally {
                    setIsLoadingProfile(false)
                }
            }
            fetchProfile()
        }
    }, [vehiclePlate, vehicleModel])

    const handlePayment = async (e: React.FormEvent) => {
        e.preventDefault()

        const isCurrentFlowMock = isMock || selectedMethod === "upi" || selectedMethod === "netbanking"

        console.log("[PAYMENT] Handle payment triggered", { isMock, isCurrentFlowMock, hasStripe: !!stripe, hasElements: !!elements })

        if (!isCurrentFlowMock && (!stripe || !elements)) {
            console.error("[PAYMENT] Stripe or Elements missing")
            toast({
                title: "Payment configuration error",
                description: "Stripe has not initialized correctly. Please refresh or check configuration.",
                variant: "destructive"
            })
            return
        }

        // Use the local state values (which may have been pre-filled from props or edited by user)
        const paymentModelToUse = localVehicleModel || vehicleModel || modelToUse
        const paymentPlateToUse = licensePlate || plateToUse

        setIsProcessing(true)

        // --- MOCK FLOW ---
        if (isCurrentFlowMock) {
            console.log("[MOCK PAYMENT] Starting mock payment flow", { bookingId, slotId, parkingLotId, selectedMethod })
            setTimeout(async () => {
                try {
                    console.log("[MOCK PAYMENT] Processing payment confirmation...")
                    // 1. Confirm Booking API
                    const res = await fetch("/api/bookings/confirm", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            bookingId,
                            slotId,
                            parkingLotId,
                            paymentId: "MOCK_PAYMENT_" + Date.now()
                        })
                    })

                    // Check if booking confirmation succeeded
                    if (!res.ok) {
                        const errorText = await res.text()
                        console.error("Booking confirmation failed:", errorText)
                        throw new Error(`Booking confirmation failed: ${errorText}`)
                    }

                    const confirmData = await res.json()
                    console.log("Booking confirmed successfully:", confirmData)

                    // 2. Generate QR
                    let url = ""
                    try {
                        url = await QRCode.toDataURL(JSON.stringify({
                            bookingId: bookingId || "MOCK_BK_" + Date.now(),
                            slot: slotNumber,
                            plate: paymentPlateToUse,
                            paymentId: "MOCK_PAYMENT_" + Date.now()
                        }))
                    } catch (qrErr) {
                        console.error("QR Gen Failed", qrErr)
                        url = "https://via.placeholder.com/300?text=QR+Error"
                    }

                    setQrBase64(url)
                    console.log("[MOCK PAYMENT] QR generated, moving to success screen (step 2)")
                    setStep(2)

                    toast({
                        title: "Payment Successful",
                        description: `Booking confirmed for Slot S${slotNumber}`,
                    })
                    onSuccess()
                } catch (err) {
                    console.error("Mock Process Error", err)
                    const errorMessage = err instanceof Error ? err.message : "Mock payment process interrupted"
                    toast({
                        title: "Payment Processing Failed",
                        description: errorMessage,
                        variant: "destructive"
                    })
                } finally {
                    setIsProcessing(false)
                }
            }, 1000)
            return
        }

        // --- STRIPE FLOW ---
        console.log("[STRIPE PAYMENT] Starting Stripe payment flow", { bookingId, slotId, parkingLotId })
        try {
            // 0. Submit Elements (Validate & Prepare)
            console.log("[STRIPE PAYMENT] Submitting payment elements for validation...")
            const { error: submitError } = await elements!.submit()
            if (submitError) {
                console.error("[STRIPE PAYMENT] Validation error:", submitError)
                toast({
                    title: "Validation Error",
                    description: submitError.message || "Please check your details.",
                    variant: "destructive"
                })
                setIsProcessing(false)
                return
            }

            // 1. Confirm Payment with Stripe
            console.log("[STRIPE PAYMENT] Elements submitted successfully, confirming payment with Stripe...")
            const result = await stripe!.confirmPayment({
                elements: elements!,
                redirect: "if_required",
                confirmParams: {
                    return_url: window.location.href,
                    payment_method_data: {
                        billing_details: { name: paymentPlateToUse }
                    }
                }
            })

            console.log("[STRIPE PAYMENT] Stripe Result:", result)

            if (result.error) {
                // Show meaningful error
                toast({
                    title: "Payment Failed",
                    description: result.error.message || "Please check your card details.",
                    variant: "destructive"
                })
            } else if (result.paymentIntent) {
                const { status } = result.paymentIntent

                if (status === "succeeded" || status === "processing") {

                    // 2. Confirm Booking API (Update Slot Status)
                    try {
                        const confirmRes = await fetch("/api/bookings/confirm", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                bookingId,
                                slotId,
                                parkingLotId,
                                paymentId: result.paymentIntent.id
                            })
                        })

                        if (!confirmRes.ok) {
                            console.warn("Backend confirm warning:", await confirmRes.text())
                        }
                    } catch (confirmError) {
                        console.error("Failed to confirm booking backend:", confirmError)
                    }

                    // 3. Generate QR
                    try {
                        const url = await QRCode.toDataURL(JSON.stringify({
                            bookingId: bookingId,
                            slot: slotNumber,
                            plate: paymentPlateToUse,
                            paymentId: result.paymentIntent.id
                        }))
                        setQrBase64(url)
                    } catch (err) {
                        console.error("QR Error", err)
                    }

                    // FORCE MOVE TO NEXT STEP
                    setStep(2)

                    toast({
                        title: "Payment Successful",
                        description: `Booking confirmed for Slot S${slotNumber}`,
                    })
                    onSuccess()
                } else if (status === "requires_action") {
                    // This should be handled by 'if_required' usually, but if we end up here
                    // we might need to let Stripe handle it, or it means the redirect didn't happen auto?
                    // Typically 'if_required' handles the redirect.
                    console.log("Payment requires action - UI should have updated or redirected.")
                } else {
                    console.log("Unexpected status:", status)
                    toast({
                        title: "Payment Status Unknown",
                        description: `Status: ${status}. Please check your dashboard or try again.`,
                        variant: "default" // or warning
                    })
                }
            }
        } catch (err) {
            console.error("Payment Exception:", err)
            toast({
                title: "Error",
                description: "An unexpected error occurred during payment processing.",
                variant: "destructive"
            })
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <AnimatePresence mode="wait">
            {step === 1 ? (
                <motion.div
                    key="payment-form"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex flex-col lg:flex-row h-full overflow-hidden"
                >
                    {/* Left Side: Summary */}
                    <div className="lg:w-1/3 bg-slate-900/80 p-6 border-r border-slate-800/50 overflow-y-auto">
                        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-white">
                            <ScrollText className="w-5 h-5 text-cyan-400" />
                            Booking Summary
                        </h3>

                        <div className="space-y-6">
                            <div className="bg-slate-800/30 p-4 rounded-2xl border border-white/5 backdrop-blur-sm" style={{
                              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.03) inset"
                            }}>
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-500/20 to-indigo-600/20 rounded-xl flex items-center justify-center text-indigo-400 font-black text-2xl border border-indigo-500/30 shadow-inner">
                                        S{slotNumber}
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Selected Slot</p>
                                        <p className="font-bold text-white text-lg leading-tight">{parkingName}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 px-1">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500 flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-slate-600" /> Duration
                                    </span>
                                    <span className="text-white font-semibold">{duration} Hours</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500 flex items-center gap-2">
                                        <Tag className="w-4 h-4 text-slate-600" /> Rate
                                    </span>
                                    <span className="text-white font-semibold">₹{pricePerHour}/hr</span>
                                </div>
                                {slotType === "EV" && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500 flex items-center gap-2">
                                            <span className="text-cyan-400">⚡</span> EV Premium
                                        </span>
                                        <span className="text-cyan-400 font-semibold">+₹20/hr</span>
                                    </div>
                                )}
                            </div>

                            <div className="h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent" />

                            <div className="space-y-4 px-1">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Base Rate</span>
                                    <span className="text-slate-300">₹{basePrice}</span>
                                </div>
                                {slotType === "EV" && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500 flex items-center gap-2">
                                            <span className="text-cyan-400">⚡</span> EV Premium
                                        </span>
                                        <span className="text-cyan-400 font-semibold">+₹{evPremium}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Service Fee</span>
                                    <span className="text-slate-300">₹{serviceFee}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">GST (18%)</span>
                                    <span className="text-slate-300">₹{gst}</span>
                                </div>
                                <div className="flex justify-between items-end pt-2">
                                    <div>
                                        <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Total Amount</span>
                                        <div className="text-3xl font-black text-white tabular-nums">₹{total}</div>
                                    </div>
                                    <div className="text-[10px] text-slate-600 italic">Incl. GST & service fee</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Payment Form */}
                    <div className="lg:w-2/3 p-8 bg-slate-950/50 overflow-y-auto custom-scrollbar text-white relative">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-[100px] -z-10" />

                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
                                CHECKOUT
                                <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-widest border border-indigo-500/20">
                                    SECURE
                                </span>
                            </h2>
                        </div>

                        <form onSubmit={handlePayment} className="space-y-8">
                            {/* Vehicle Details */}
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Car className="w-3 h-3" />
                                    Vehicle Specification
                                </h3>
                                <div className="grid md:grid-cols-2 gap-5 relative">
                                    {isLoadingProfile && (
                                        <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] flex items-center justify-center z-10 rounded-2xl border border-white/5">
                                            <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-400 ml-1">License Plate</Label>
                                        <Input
                                            value={licensePlate}
                                            onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                                            placeholder="TN-01-AB-1234 (Optional for Test)"
                                            disabled={!!vehiclePlate}
                                            className={`h-12 bg-[#0B0E14] border-slate-800 text-white placeholder:text-slate-600 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all uppercase font-mono tracking-widest text-lg ${vehiclePlate ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        />
                                        {vehiclePlate && (
                                            <p className="text-[10px] text-slate-500 italic">Pre-selected from checkout</p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-400 ml-1">Vehicle Model</Label>
                                        <Input
                                            value={localVehicleModel}
                                            onChange={(e) => setLocalVehicleModel(e.target.value)}
                                            placeholder="e.g. Honda City"
                                            disabled={!!vehicleModel}
                                            className={`h-12 bg-[#0B0E14] border-slate-800 text-white placeholder:text-slate-600 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all font-medium ${vehicleModel ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        />
                                        {vehicleModel && (
                                            <p className="text-[10px] text-slate-500 italic">Pre-selected from checkout</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Payment Element */}
                            <div className="space-y-4 pt-4 border-t border-white/5">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Wallet className="w-3 h-3" />
                                    Payment Method
                                </h3>

                                {!selectedMethod ? (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-in fade-in zoom-in-95 duration-500 pt-2">
                                        <button 
                                            type="button"
                                            onClick={() => setSelectedMethod("upi")}
                                            className="p-5 bg-slate-900/40 hover:bg-indigo-500/10 border border-white/5 hover:border-indigo-500/50 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all group shadow-sm hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                        >
                                            <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                                                <Smartphone className="w-6 h-6 text-indigo-400" />
                                            </div>
                                            <span className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">UPI / GPay</span>
                                        </button>

                                        <button 
                                            type="button"
                                            onClick={() => setSelectedMethod("card")}
                                            className="p-5 bg-slate-900/40 hover:bg-slate-700/50 border border-white/5 hover:border-slate-600/50 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all group shadow-sm hover:shadow-[0_0_20px_rgba(148,163,184,0.15)] focus:ring-2 focus:ring-slate-500 focus:outline-none"
                                        >
                                            <div className="w-12 h-12 rounded-full bg-slate-700/10 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                                                <CreditCard className="w-6 h-6 text-slate-400" />
                                            </div>
                                            <span className="text-sm font-bold text-white group-hover:text-slate-300 transition-colors">Credit Card</span>
                                        </button>

                                        <button 
                                            type="button"
                                            onClick={() => setSelectedMethod("netbanking")}
                                            className="p-5 bg-slate-900/40 hover:bg-slate-700/50 border border-white/5 hover:border-slate-600/50 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all group shadow-sm hover:shadow-[0_0_20px_rgba(148,163,184,0.15)] focus:ring-2 focus:ring-slate-500 focus:outline-none"
                                        >
                                            <div className="w-12 h-12 rounded-full bg-slate-700/10 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                                                <Building2 className="w-6 h-6 text-slate-400" />
                                            </div>
                                            <span className="text-sm font-bold text-white group-hover:text-slate-300 transition-colors">Net Banking</span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-2">
                                        <div className="flex items-center justify-between bg-slate-900/40 p-3 rounded-xl border border-white/5 backdrop-blur-sm">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                                                    {selectedMethod === "card" ? <CreditCard className="w-4 h-4 text-slate-400" /> : 
                                                     selectedMethod === "upi" ? <Smartphone className="w-4 h-4 text-indigo-400" /> : 
                                                     <Building2 className="w-4 h-4 text-slate-400" />}
                                                </div>
                                                <span className="text-sm font-bold text-white">
                                                    {selectedMethod === "card" ? "Credit / Debit Card" : 
                                                     selectedMethod === "upi" ? "UPI / GPay" : "Net Banking"}
                                                </span>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => setSelectedMethod(null)}
                                                className="text-xs font-bold text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-white/5"
                                            >
                                                Change
                                            </button>
                                        </div>

                                        {selectedMethod === "upi" ? (
                                            <div className="bg-slate-900/50 p-6 rounded-xl border border-dashed border-indigo-500/30 relative overflow-hidden group">
                                                <div className="space-y-5 relative z-10">
                                                    <div className="space-y-2">
                                                        <Label className="text-xs font-bold text-slate-400 ml-1">Enter your UPI ID</Label>
                                                        <Input 
                                                            placeholder="example@upi" 
                                                            className="h-12 bg-[#0B0E14] border-slate-800 text-white placeholder:text-slate-600 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all font-mono tracking-wider"
                                                            required
                                                        />
                                                    </div>
                                                    <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-lg flex items-start gap-3">
                                                        <Smartphone className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                                                        <p className="text-xs text-indigo-400/80 leading-relaxed font-medium">You will receive a secure payment request on your registered UPI application (GPay, PhonePe, Paytm).</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : selectedMethod === "netbanking" ? (
                                            <div className="bg-slate-900/50 p-6 rounded-xl border border-dashed border-slate-600/30 relative overflow-hidden group">
                                                <div className="space-y-5 relative z-10">
                                                    <div className="space-y-2">
                                                        <Label className="text-xs font-bold text-slate-400 ml-1">Select your Bank</Label>
                                                        <select className="w-full h-12 bg-[#0B0E14] border border-slate-800 rounded-lg px-4 text-slate-200 focus:border-slate-600/50 outline-none hover:border-slate-700 transition-colors cursor-pointer appearance-none font-medium">
                                                            <option>HDFC Bank</option>
                                                            <option>State Bank of India</option>
                                                            <option>ICICI Bank</option>
                                                            <option>Axis Bank</option>
                                                            <option>Kotak Mahindra Bank</option>
                                                        </select>
                                                    </div>
                                                    <div className="bg-slate-700/10 border border-slate-600/20 p-3 rounded-lg flex items-start gap-3">
                                                        <ShieldCheck className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                                                        <p className="text-xs text-slate-400/80 leading-relaxed font-medium">You will be securely redirected to your bank's portal to authorize this payment.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : isMock ? (
                                            <div className="bg-slate-900/50 p-6 rounded-xl border border-dashed border-slate-600/30 relative overflow-hidden group">
                                                <div className="absolute top-2 right-2 bg-slate-700/90 text-black text-[10px] font-black px-2 py-0.5 rounded shadow-lg uppercase tracking-widest z-10">SANDBOX ENV</div>
                                                <div className="space-y-4 opacity-75 grayscale transition-all group-hover:grayscale-0">
                                                    <div className="space-y-2">
                                                        <Label className="text-xs text-slate-500">Card Number</Label>
                                                        <div className="h-12 bg-[#0B0E14] border border-slate-800 rounded flex items-center px-4 font-mono text-slate-400">
                                                            xxxx xxxx xxxx 4242
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label className="text-xs text-slate-500">Expiry</Label>
                                                            <div className="h-12 bg-[#0B0E14] border border-slate-800 rounded flex items-center px-4 font-mono text-slate-400">
                                                                12/28
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label className="text-xs text-slate-500">CVC</Label>
                                                            <div className="h-12 bg-[#0B0E14] border border-slate-800 rounded flex items-center px-4 font-mono text-slate-400">
                                                                •••
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 space-y-4">
                                                <LinkAuthenticationElement
                                                    options={{ defaultValues: { email: session?.user?.email || "" } }}
                                                />
                                                <PaymentElement options={{ layout: "tabs" }} />
                                            </div>
                                        )}

                                        <div className="pt-6">
                                            {selectedMethod && (
                                                <Button
                                                    type="submit"
                                                    disabled={(!stripe && !isMock && selectedMethod === "card") || isProcessing}
                                                    className="w-full h-14 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-lg rounded-2xl shadow-[0_10px_30px_rgba(6,182,212,0.3)] transition-all hover:scale-[1.02] active:scale-95 disabled:grayscale"
                                                >
                                                    {isProcessing ? (
                                                        <span className="flex items-center gap-3">
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                            Processing Securely...
                                                        </span>
                                                    ) : (
                                                        `Pay Now • ₹${total}`
                                                    )}
                                                </Button>
                                            )}
                                            <p className="text-center text-[10px] text-slate-600 mt-4 flex items-center justify-center gap-2 font-bold uppercase tracking-widest">
                                                <ShieldCheck size={10} className="text-emerald-600" />
                                                PCI-DSS Compliant Secure Checkout
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </form>
                    </div>
                </motion.div>
            ) : (
                <motion.div
                    key="success-screen"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col h-full bg-[#0B0E14] text-white overflow-hidden"
                >
                    {/* Confetti */}
                    <div className="absolute inset-0 pointer-events-none z-50">
                        <Confetti
                            width={windowSize.width}
                            height={windowSize.height}
                            recycle={false}
                            numberOfPieces={800}
                            gravity={0.2}
                            colors={['#06b6d4', '#3b82f6', '#10b981', '#ffffff']}
                        />
                    </div>

                    {/* Header */}
                    <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#151921] shrink-0">
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")} className="text-slate-400 hover:text-white hover:bg-white/5">
                                <ArrowLeft size={18} />
                            </Button>
                            <div>
                                <h1 className="text-lg font-bold text-white">Booking Confirmation</h1>
                                <p className="text-xs text-slate-400">Your parking slot has been booked successfully</p>
                            </div>
                        </div>
                        <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle2 size={14} /> Confirmed
                        </div>
                    </div>

                    {/* Main Content Grid */}
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto h-full min-h-0">

                            {/* Left Column: Details & Location */}
                            <div className="lg:col-span-2 flex flex-col gap-6">
                                {/* Booking Details Card */}
                                <div className="bg-[#151921] rounded-2xl p-8 border border-white/5 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                                    <div className="flex flex-col items-center mb-8 text-center relative z-10">
                                        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 border-2 border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                                            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                                        </div>
                                        <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Booking Successful!</h2>
                                        <p className="text-slate-400 text-sm font-medium">Your parking slot has been reserved successfully.</p>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-x-12 gap-y-6 relative z-10">
                                        <DetailRow label="Booking ID" value={bookingId || "BK8910632"} />
                                        <DetailRow label="Parking Area" value={parkingName} />
                                        <DetailRow label="Slot Number" value={`S${slotNumber}`} textClass="text-emerald-400 font-bold text-lg" />
                                        <DetailRow label="Date" value={new Date().toLocaleDateString()} />
                                        <DetailRow label="Time" value={new Date().toLocaleTimeString()} />
                                        <DetailRow label="Duration" value={`${duration} hours`} />
                                        <div className="md:col-span-2 pt-4 border-t border-white/5 flex justify-between items-center">
                                            <span className="text-slate-500 font-medium">Amount Paid</span>
                                            <span className="text-2xl font-black text-white">₹{total}</span>
                                        </div>
                                        <div className="md:col-span-2 pt-2 border-t border-dashed border-white/5">
                                            <DetailRow label="Address" value={parkingAddress} />
                                        </div>
                                    </div>
                                </div>

                                {/* Location Card */}
                                <div className="bg-[#151921] rounded-2xl p-6 border border-white/5 h-48 relative overflow-hidden group flex-shrink-0">
                                    <div className="flex justify-between items-start relative z-20 mb-4">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                            <MapPin size={16} className="text-purple-500" />
                                            Location
                                        </h3>
                                    </div>

                                    {/* Interactive Embedded Map */}
                                    <div className="absolute inset-0 bg-[#0f1219] overflow-hidden">
                                        <iframe 
                                            src={`https://maps.google.com/maps?q=${encodeURIComponent(parkingAddress || parkingName || "Chennai")}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                                            className="w-full h-full"
                                            style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) contrast(90%) brightness(110%)', opacity: 0.7 }}
                                            allowFullScreen 
                                            loading="lazy" 
                                        />
                                        {/* Inner shadow to blend map edges with card */}
                                        <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_40px_rgba(21,25,33,1)]" />
                                    </div>

                                    <div className="absolute bottom-4 left-4 right-4 flex gap-3 z-30">
                                        <Button 
                                            size="sm" 
                                            onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(parkingAddress || parkingName)}`, "_blank")}
                                            className="flex-1 bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/20 shadow-lg"
                                        >
                                            <MapPin className="w-3 h-3 mr-2 text-cyan-400" /> Get Directions
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            onClick={() => {
                                                navigator.clipboard.writeText(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parkingAddress || parkingName)}`);
                                                toast({ title: "Link Copied!", description: "Location link copied to clipboard." });
                                            }}
                                            className="flex-1 hover:bg-white/10 text-white bg-slate-900/60 backdrop-blur-md border border-white/10 shadow-lg"
                                        >
                                            <Share2 className="w-3 h-3 mr-2 text-purple-400" /> Share Location
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: QR & Actions */}
                            <div className="flex flex-col gap-6">
                                {/* QR Code Card */}
                                <div className="bg-[#151921] rounded-2xl p-6 border border-white/5 flex flex-col items-center text-center relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
                                    <h3 className="text-sm font-bold text-white mb-6 w-full text-left flex items-center gap-2">
                                        <QrCode size={16} className="text-cyan-400" />
                                        Entry QR Code
                                    </h3>
                                    <div className="bg-white p-5 rounded-2xl mb-6 shadow-[0_0_40px_rgba(255,255,255,0.05)] relative group">
                                        {qrBase64 ? (
                                            <img src={qrBase64} alt="QR Code" className="w-40 h-40 object-contain mix-blend-multiply" />
                                        ) : (
                                            <div className="w-40 h-40 bg-slate-100 flex items-center justify-center rounded text-slate-400 text-xs font-mono">GENERATING...</div>
                                        )}
                                        <div className="absolute inset-0 border-[3px] border-dashed border-slate-900/10 rounded-xl pointer-events-none" />
                                    </div>
                                    <p className="text-xs text-slate-500 mb-6 px-4">
                                        Scan this QR code at the parking entrance scanner for seamless automated entry.
                                    </p>
                                    <Button className="w-full bg-slate-800 hover:bg-slate-700 text-white border border-white/5 h-10 font-medium text-xs rounded-xl transition-all">
                                        <Download className="w-3 h-3 mr-2 text-slate-400" /> Save to Gallery
                                    </Button>
                                </div>

                                {/* Important Info & Actions */}
                                <div className="bg-[#151921] rounded-2xl p-6 border border-white/5 flex flex-col flex-1">
                                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                        <ShieldCheck size={16} className="text-slate-400" />
                                        Important Information
                                    </h3>
                                    <div className="space-y-4 mb-8">
                                        <InfoItem text="Arrive 10 mins before start time." />
                                        <InfoItem text="Overstay charges apply." />
                                        <InfoItem text="Cancellation available up to 30 mins prior." />
                                    </div>

                                    <div className="mt-auto space-y-3">
                                        <Button
                                            onClick={() => {
                                                onClose()
                                                router.push("/dashboard")
                                            }}
                                            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold h-12 rounded-xl shadow-lg shadow-cyan-500/20"
                                        >
                                            Back to Home
                                        </Button>
                                        <Button
                                            onClick={onClose}
                                            variant="ghost"
                                            className="w-full hover:bg-white/5 text-slate-400 hover:text-white h-12 rounded-xl"
                                        >
                                            View All Bookings
                                        </Button>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </motion.div>
            )
            }
        </AnimatePresence >
    )
}


function DetailRow({ label, value, textClass = "text-white" }: { label: string, value: string | number, textClass?: string }) {
    return (
        <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500 font-medium">{label}</span>
            <span className={textClass}>{value}</span>
        </div>
    )
}

function InfoItem({ text }: { text: string }) {
    return (
        <li className="flex items-start gap-2 text-xs text-slate-400 leading-relaxed">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
            <span>{text}</span>
        </li>
    )
}
