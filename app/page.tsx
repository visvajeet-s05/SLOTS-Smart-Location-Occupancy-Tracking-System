"use client"

import { useState } from "react"
import { MapPin, Star, Clock, Shield, Zap, CheckCircle2, Globe, LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import LoginModal from "@/components/auth/LoginModal"
import SLOTSNavbar from "@/components/landing/SLOTSNavbar"
import SLOTSHero from "@/components/landing/SLOTSHero"
import SLOTSStats from "@/components/landing/SLOTSStats"
import SLOTSFeatures from "@/components/landing/SLOTSFeatures"
import SLOTSHowItWorks from "@/components/landing/SLOTSHowItWorks"
import SLOTSMobileShowcase from "@/components/landing/SLOTSMobileShowcase"
import SLOTSCTA from "@/components/landing/SLOTSCTA"
import SLOTSFooter from "@/components/landing/SLOTSFooter"

export default function LandingPage() {
  const [showLogin, setShowLogin] = useState(false)
  const router = useRouter()

  const features: Array<{
    icon: LucideIcon
    title: string
    description: string
    accentType: "indigo" | "purple" | "teal" | "emerald"
  }> = [
    {
      icon: MapPin,
      title: "Real-time Availability",
      description: "See live parking availability across all zones. Never circle again.",
      accentType: "indigo",
    },
    {
      icon: Star,
      title: "Premium Spaces",
      description: "Access exclusive, secure parking zones reserved only for SLOTS members.",
      accentType: "purple",
    },
    {
      icon: Clock,
      title: "Flexible Bookings",
      description: "Reserve by the minute, hour, or month. Ultimate flexibility for your busy life.",
      accentType: "teal",
    },
    {
      icon: Shield,
      title: "Guaranteed Security",
      description: "24/7 surveillance and secure encrypted digital locks for every parking bay.",
      accentType: "emerald",
    },
  ]

  const stats = [
    { label: "IoT-Powered", value: "Sensor Accuracy" },
    { label: "Real-Time", value: "Occupancy Data" },
    { label: "Smart City", value: "Ready" },
    { label: "Secure", value: "Encryption" },
  ]

  const steps = [
    {
      title: "Scan & Search",
      description: "Open the app and instantly see every available spot around your destination.",
      icon: <Zap className="h-6 w-6" />,
    },
    {
      title: "Instant Booking",
      description: "Secure your bay with one tap. No more driving in circles searching for space.",
      icon: <CheckCircle2 className="h-6 w-6" />,
    },
    {
      title: "Seamless Arrival",
      description: "Follow real-time turn-by-turn directions to your reserved bay with automated plate recognition at entry.",
      icon: <Globe className="h-6 w-6" />,
    },
  ]

  return (
    <main className="relative min-h-screen w-full" style={{ background: "var(--bg-void)" }}>
      {/* Navigation */}
      <SLOTSNavbar onLoginClick={() => setShowLogin(true)} />

      {/* Hero Section */}
      <SLOTSHero onCTAClick={() => setShowLogin(true)} />

      {/* Stats Section */}
      <SLOTSStats stats={stats} />

      {/* Features Grid */}
      <SLOTSFeatures features={features} />

      {/* How It Works */}
      <SLOTSHowItWorks steps={steps} />

      {/* Mobile App Showcase */}
      <SLOTSMobileShowcase />

      {/* CTA Section */}
      <SLOTSCTA 
        onPrimaryCTAClick={() => setShowLogin(true)}
        onSecondaryCTAClick={() => router.push("/about")}
      />

      {/* Footer */}
      <SLOTSFooter />

      {/* Login Modal */}
      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
      />
    </main>
  )
}

