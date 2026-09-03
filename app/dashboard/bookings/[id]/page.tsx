"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  Calendar, Clock, MapPin, Car, Download, Share2, AlertCircle,
  ArrowLeft, QrCode, Phone
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import QRCode from "qrcode"
import Footer from "@/components/layout/footer"

interface Booking {
  id: string
  bookingId: string
  parkingLocation: string
  slotId: string
  bookingDate: string
  bookingTime: string
  duration: number
  licensePlate: string
  vehicleModel: string
  amount: number
  paymentMethod: string
  status: "UPCOMING" | "ACTIVE" | "COMPLETED" | "CANCELLED"
  createdAt: string
  checkInTime?: string
  checkOutTime?: string
  parkingAddress?: string
  ownerBusinessName?: string
  ownerPhone?: string
  txHash?: string | null
}

export default function BookingDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const res = await fetch("/api/bookings")
        if (res.ok) {
          const data: Booking[] = await res.json()
          const foundBooking = data.find(b => b.id === id)
          setBooking(foundBooking || null)
        }
      } catch (error) {
        console.error("Failed to fetch booking:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchBooking()
  }, [id])

  // Generate QR Code for active bookings
  useEffect(() => {
    if (booking && booking.status === "ACTIVE") {
      const qrData = JSON.stringify({
        bookingId: booking.bookingId,
        slot: booking.slotId,
        plate: booking.licensePlate
      })
      QRCode.toDataURL(qrData, { 
        width: 200,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' }
      })
      .then((url: string) => setQrCodeUrl(url))
      .catch((err: unknown) => console.error("QR Generation Error", err))
    } else {
      setQrCodeUrl(null)
    }
  }, [booking])

  const getStatusStyles = (status: string) => {
    switch (status) {
      case "UPCOMING": return { bg: "var(--accent-dim)", color: "var(--status-upcoming)", border: "var(--border-glow)" }
      case "ACTIVE": return { bg: "rgba(52, 211, 153, 0.1)", color: "var(--status-available)", border: "rgba(52, 211, 153, 0.3)" }
      case "COMPLETED": return { bg: "rgba(199, 199, 218, 0.1)", color: "var(--status-completed)", border: "rgba(199, 199, 218, 0.2)" }
      case "CANCELLED": return { bg: "rgba(229, 72, 77, 0.1)", color: "var(--status-cancelled)", border: "rgba(229, 72, 77, 0.3)" }
      default: return { bg: "rgba(199, 199, 218, 0.1)", color: "var(--status-completed)", border: "rgba(199, 199, 218, 0.2)" }
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen font-sans flex items-center justify-center" style={{ background: "var(--bg-void)", color: "var(--text-secondary)" }}>
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }} />
          <p>Loading booking details...</p>
        </div>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="min-h-screen font-sans flex items-center justify-center" style={{ background: "var(--bg-void)", color: "var(--text-secondary)" }}>
        <div className="text-center">
          <AlertCircle className="w-16 h-16 mx-auto mb-4" style={{ color: "var(--status-cancelled)" }} />
          <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Booking Not Found</h2>
          <p className="mb-6">The booking you're looking for doesn't exist or has been removed.</p>
          <Button
            onClick={() => router.push("/dashboard/bookings")}
            style={{ background: "var(--accent)", color: "var(--text-primary)" }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Bookings
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "var(--bg-void)", color: "var(--text-secondary)" }}>
      {/* Background Ambient Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl" style={{ background: "var(--accent-glow)" }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-3xl" style={{ background: "var(--accent-glow)" }} />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03]" />
      </div>

      <div className="relative z-10 px-4 max-w-[1440px] mx-auto pt-8 pb-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard/bookings")}
            className="mb-4"
            style={{ color: "var(--text-secondary)" }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Bookings
          </Button>
          <h1 className="text-4xl font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Booking Details
          </h1>
        </motion.div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-4xl mx-auto"
        >
          {/* Header Card */}
          <div className="relative h-40 rounded-2xl overflow-hidden mb-6" style={{ background: "linear-gradient(to bottom right, var(--accent-dim), var(--bg-surface))" }}>
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
            <div className="relative z-10 h-full flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-white mb-2">{booking.parkingLocation}</h2>
                <p className="text-sm opacity-90">Booking ID: {booking.bookingId}</p>
              </div>
            </div>
          </div>

          {/* Status and Amount */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-6 rounded-2xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
              <p className="text-xs font-bold uppercase mb-2" style={{ color: "var(--text-muted)" }}>Status</p>
              <Badge
                className="px-3 py-1 text-sm"
                style={{ background: getStatusStyles(booking.status).bg, color: getStatusStyles(booking.status).color, borderColor: getStatusStyles(booking.status).border }}
              >
                {booking.status}
              </Badge>
            </div>
            <div className="p-6 rounded-2xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
              <p className="text-xs font-bold uppercase mb-2" style={{ color: "var(--text-muted)" }}>Total Amount</p>
              <p className="text-3xl font-black" style={{ color: "var(--status-available)" }}>₹{booking.amount}</p>
            </div>
          </div>

          {/* Booking Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
              <p className="text-xs font-bold uppercase mb-2" style={{ color: "var(--text-muted)" }}>Date</p>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" style={{ color: "var(--accent)" }} />
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {new Date(booking.bookingDate).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="p-4 rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
              <p className="text-xs font-bold uppercase mb-2" style={{ color: "var(--text-muted)" }}>Time</p>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" style={{ color: "var(--accent)" }} />
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {booking.bookingTime}
                </span>
              </div>
            </div>
            <div className="p-4 rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
              <p className="text-xs font-bold uppercase mb-2" style={{ color: "var(--text-muted)" }}>Slot</p>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" style={{ color: "var(--accent)" }} />
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {booking.slotId}
                </span>
              </div>
            </div>
            <div className="p-4 rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
              <p className="text-xs font-bold uppercase mb-2" style={{ color: "var(--text-muted)" }}>Duration</p>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {booking.duration} hour{booking.duration > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Vehicle Details */}
          <div className="p-6 rounded-2xl border mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
            <h3 className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>Vehicle Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-bold uppercase mb-1" style={{ color: "var(--text-muted)" }}>Vehicle Model</p>
                <div className="flex items-center gap-2 font-medium" style={{ color: "var(--text-primary)" }}>
                  <Car className="w-4 h-4" style={{ color: "var(--accent)" }} />
                  {booking.vehicleModel}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase mb-1" style={{ color: "var(--text-muted)" }}>License Plate</p>
                <p className="font-mono font-medium" style={{ color: "var(--text-primary)" }}>{booking.licensePlate}</p>
              </div>
            </div>
          </div>

          {/* Web3 Confirmation */}
          {booking.txHash && (
            <div className="p-6 rounded-2xl border mb-6 relative overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glow)", border: "1px solid" }}>
              <div className="absolute top-0 right-0 px-4 py-2 text-xs font-bold rounded-bl-lg uppercase tracking-wider flex items-center gap-1" style={{ background: "var(--accent)", color: "var(--text-primary)" }}>
                Immutable
              </div>
              <p className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: "var(--accent)" }}>
                Web3 Digital Receipt
              </p>
              <p className="font-mono text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                TX: {booking.txHash}
              </p>
            </div>
          )}

          {/* QR Code for Active Bookings */}
          {booking.status === "ACTIVE" && qrCodeUrl && (
            <div className="p-6 rounded-2xl border border-dashed mb-6 flex flex-col items-center justify-center text-center relative overflow-hidden" style={{ background: "rgba(52, 211, 153, 0.05)", borderColor: "rgba(52, 211, 153, 0.3)" }}>
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[40px] pointer-events-none" style={{ background: "rgba(52, 211, 153, 0.1)" }} />
              
              <div className="bg-white p-4 rounded-2xl mb-4 relative z-10" style={{ boxShadow: "0 0 40px rgba(52, 211, 153, 0.15)" }}>
                <img src={qrCodeUrl} alt="Entry QR Code" className="w-32 h-32 object-contain mix-blend-multiply" />
              </div>
              
              <div className="flex items-center gap-2 mb-2 z-10">
                <QrCode className="w-5 h-5" style={{ color: "var(--status-available)" }} />
                <p className="font-extrabold tracking-[0.15em] text-sm uppercase" style={{ color: "var(--status-available)" }}>Active Gate Pass</p>
              </div>
              <p className="text-xs uppercase font-bold tracking-widest leading-relaxed max-w-[300px] z-10" style={{ color: "rgba(52, 211, 153, 0.7)" }}>
                Present this code at the boom barrier scanner for automated entry
              </p>
            </div>
          )}

          {/* Service Provider */}
          {booking.ownerBusinessName && (
            <div className="p-6 rounded-2xl border mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>Service Provider</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center border" style={{ background: "var(--accent-dim)", borderColor: "var(--border-glow)" }}>
                    <MapPin className="w-6 h-6" style={{ color: "var(--accent)" }} />
                  </div>
                  <div>
                    <p className="font-bold text-lg tracking-wide" style={{ color: "var(--text-primary)" }}>{booking.ownerBusinessName}</p>
                    <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{booking.parkingAddress || "Pre-booked Slot"}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="flex flex-col items-end h-auto py-2" style={{ color: "var(--status-available)" }}>
                  <span className="text-sm font-bold leading-tight flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Support
                  </span>
                  <span className="text-xs font-mono leading-tight mt-1">{booking.ownerPhone}</span>
                </Button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button className="flex-1 font-bold" style={{ background: "var(--accent)", color: "var(--text-primary)" }}>
              <Download className="w-4 h-4 mr-2" /> Download Receipt
            </Button>
            <Button variant="outline" className="flex-1 hover:bg-white/5" style={{ borderColor: "var(--border-glass)", color: "var(--text-primary)" }}>
              <Share2 className="w-4 h-4 mr-2" /> Share Booking
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  )
}
