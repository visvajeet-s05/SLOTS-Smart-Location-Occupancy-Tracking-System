"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  User, Mail, Phone, Car, CreditCard, Shield,
  Edit2, Save, LucideIcon, Wallet, Zap, History,
  LogOut, Plus, Trash2, Camera, CheckCircle2, X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { useSession } from "next-auth/react"
import Footer from "@/components/layout/footer"
import { StatCard, SemanticBadge } from "@/components/design-system"

// Mock server action call (replace with import from @/app/actions/profile)
// import { getUserProfile, updateUserProfile } from "@/app/actions/profile"

// Since we can't easily import server actions in this client component w/o proper setup or 'use server' file
// We will simulate the data fetching for the UI as requested "perfectly".
// The real data connection would replace these mocks.

interface ProfileData {
  name: string
  email: string
  phone: string
  avatar: string
  vehicles: Vehicle[]
  paymentMethods: PaymentMethod[]
  walletBalance: number
  notifications: boolean
  fastTagId?: string
}

interface Vehicle {
  id: string
  model: string
  plate: string
  type: "Car" | "Bike"
  isDefault: boolean
}

interface PaymentMethod {
  id: string
  type: "Card" | "UPI"
  last4?: string
  upiId?: string
  isDefault: boolean
}

export default function ProfilePage() {
  const { data: session } = useSession()
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [totalBookings, setTotalBookings] = useState(0)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false)
  const [newVehicle, setNewVehicle] = useState({
    make: "",
    model: "",
    licensePlate: "",
    color: "",
    fastagId: ""
  })

  // Initial State based on User Session or Default
  const [profile, setProfile] = useState<ProfileData>({
    name: session?.user?.name || "Visvajeet",
    email: session?.user?.email || "visvajeet@gmail.com",
    phone: "+91 98765 43210",
    avatar: "https://github.com/shadcn.png",
    walletBalance: 2450.00,
    fastTagId: "FASTAG-VIS-001",
    notifications: true,
    vehicles: [], // Start empty - will be populated from real API data
    paymentMethods: [
      { id: "1", type: "Card", last4: "4242", isDefault: true },
      { id: "2", type: "UPI", upiId: "visvajeet@oksbi", isDefault: false },
    ]
  })

  useEffect(() => {
    // Fetch real user profile data
    const fetchProfileData = async () => {
      try {
        console.log("🔍 Fetching profile data...")
        const res = await fetch("/api/user/profile")
        if (res.ok) {
          const data = await res.json()
          console.log("📦 Profile data received:", data)
          
          if (data.name || data.email || data.phone) {
            setProfile(prev => ({
              ...prev,
              name: data.name || prev.name,
              email: data.email || prev.email,
              phone: data.phone || prev.phone,
              vehicles: data.vehicles && data.vehicles.length > 0 
                ? data.vehicles 
                : [], // Use real vehicles or empty array
              fastTagId: data.fastagId || prev.fastTagId
            }))
          }
        } else {
          console.error("❌ Failed to fetch profile:", res.status)
        }
      } catch (error) {
        console.error("Failed to fetch profile data:", error)
      }
    }

    // Fetch real booking count for consistency
    const fetchBookingCount = async () => {
      try {
        const res = await fetch("/api/bookings")
        if (res.ok) {
          const data = await res.json()
          setTotalBookings(Array.isArray(data) ? data.length : 0)
        }
      } catch (error) {
        console.error("Failed to fetch booking count:", error)
        setTotalBookings(0)
      } finally {
        setLoading(false)
      }
    }
    
    fetchProfileData()
    fetchBookingCount()
  }, [session?.user?.email])

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: profile.name,
          phone: profile.phone
        })
      })

      if (res.ok) {
        setIsEditing(false)
        toast.success("Profile updated successfully")
      } else {
        toast.error("Failed to update profile")
      }
    } catch (error) {
      console.error("Failed to save profile:", error)
      toast.error("An error occurred while saving")
    } finally {
      setLoading(false)
    }
  }

  const handleTopUp = () => {
    // Navigate to payment/wallet top-up flow
    toast.info("Wallet top-up feature coming soon!")
  }

  const handleDeleteVehicle = async (vehicleId: string) => {
    if (profile.vehicles.length === 1) {
      toast.error("You must have at least one vehicle registered")
      return
    }
    
    try {
      const res = await fetch("/api/user/vehicles", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ vehicleId })
      })

      if (res.ok) {
        setProfile(prev => ({
          ...prev,
          vehicles: prev.vehicles.filter(v => v.id !== vehicleId)
        }))
        toast.success("Vehicle removed successfully")
      } else {
        const error = await res.text()
        toast.error(error || "Failed to remove vehicle")
      }
    } catch (error) {
      console.error("Failed to delete vehicle:", error)
      toast.error("An error occurred while removing vehicle")
    }
  }

  const handleAddVehicle = async () => {
    setIsAddVehicleOpen(true)
  }

  const handleSaveVehicle = async () => {
    if (!newVehicle.licensePlate || !newVehicle.make || !newVehicle.model) {
      toast.error("Please fill in all required fields")
      return
    }

    try {
      const res = await fetch("/api/user/vehicles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(newVehicle)
      })

      if (res.ok) {
        const vehicle = await res.json()
        setProfile(prev => ({
          ...prev,
          vehicles: [...prev.vehicles, vehicle]
        }))
        setNewVehicle({
          make: "",
          model: "",
          licensePlate: "",
          color: "",
          fastagId: ""
        })
        setIsAddVehicleOpen(false)
        toast.success("Vehicle added successfully")
      } else {
        const error = await res.text()
        toast.error(error || "Failed to add vehicle")
      }
    } catch (error) {
      console.error("Failed to add vehicle:", error)
      toast.error("An error occurred while adding vehicle")
    }
  }

  const handleToggle2FA = () => {
    setTwoFactorEnabled(!twoFactorEnabled)
    toast.info(twoFactorEnabled ? "Two-Factor Authentication disabled" : "Two-Factor Authentication enabled")
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: "var(--bg-void)" }}>
      {/* Hero Header */}
      <div className="relative h-64 overflow-hidden" style={{ background: "linear-gradient(to right, var(--accent-dim), var(--bg-surface))" }}>
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
        <div className="absolute -bottom-16 left-0 right-0 h-32" style={{ background: "linear-gradient(to top, var(--bg-void), transparent)" }} />
      </div>

      <div className="px-4 max-w-[1440px] mx-auto -mt-24 relative z-10">

        {/* Profile Card Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row items-end md:items-center gap-6 mb-8"
        >
          <div className="relative group">
            <motion.div 
              className="absolute -inset-1 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" 
              style={{ background: "var(--accent-glow)" }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <Avatar className="w-32 h-32 border-4 relative transition-transform group-hover:scale-105" style={{ borderColor: "var(--bg-void)" }}>
              <AvatarFallback className="text-3xl font-bold" style={{ background: "var(--accent)", color: "var(--text-primary)" }}>
                {profile.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="absolute bottom-0 right-0 p-2 rounded-full text-white shadow-lg transition-all group-hover:bg-indigo-500 cursor-pointer"
              style={{ background: "var(--accent)" }}
              aria-label="Upload avatar"
            >
              <Camera className="w-4 h-4" />
            </motion.button>
            {/* Upload Progress Ring (hidden by default, shown on interaction) */}
            <motion.div 
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            />
          </div>

          <div className="flex-1 space-y-2 mb-2">
            <h1 className="text-4xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>{profile.name}</h1>
            <div className="flex flex-wrap items-center gap-3" style={{ color: "var(--text-secondary)" }}>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                <Mail className="w-3.5 h-3.5" />
                <span className="text-sm">{profile.email}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                <Phone className="w-3.5 h-3.5" />
                <span className="text-sm">{profile.phone}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => setIsEditing(!isEditing)}
              variant={isEditing ? "destructive" : "outline"}
              className={isEditing ? "" : ""}
              style={isEditing ? {} : { background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}
            >
              {isEditing ? (
                <>Cancel</>
              ) : (
                <>
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit Profile
                </>
              )}
            </Button>
            {isEditing && (
              <Button onClick={handleSave} style={{ background: "var(--accent)", color: "var(--text-primary)" }}>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            )}
          </div>
        </motion.div>

        {/* Content Tabs */}
        <motion.div
          initial="hidden"
          animate="visible"
        >
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="p-1 h-12 rounded-xl backdrop-blur-md w-full justify-start overflow-x-auto overflow-y-hidden no-scrollbar relative" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", border: "1px solid" }}>
              <motion.div 
                className="absolute bottom-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-500 to-transparent transition-all duration-300"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
              />
              <TabsTrigger value="overview" className="rounded-lg px-6 data-[state=active]:bg-[var(--accent)] data-[state=active]:text-white relative z-10" style={{ color: "var(--text-secondary)" }}>Overview</TabsTrigger>
              <TabsTrigger value="vehicles" className="rounded-lg px-6 data-[state=active]:bg-[var(--accent)] data-[state=active]:text-white relative z-10" style={{ color: "var(--text-secondary)" }}>Vehicles & FASTag</TabsTrigger>
              <TabsTrigger value="payment" className="rounded-lg px-6 data-[state=active]:bg-[var(--accent)] data-[state=active]:text-white relative z-10" style={{ color: "var(--text-secondary)" }}>Payment & Wallet</TabsTrigger>
              <TabsTrigger value="security" className="rounded-lg px-6 data-[state=active]:bg-[var(--accent)] data-[state=active]:text-white relative z-10" style={{ color: "var(--text-secondary)" }}>Security</TabsTrigger>
            </TabsList>

            {/* OVERVIEW TAB */}
            <TabsContent value="overview" className="space-y-6 px-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Stats Cards - Using Design System */}
                <motion.div variants={itemVariants} className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <StatCard
                    label="Wallet Balance"
                    value={`₹${profile.walletBalance.toFixed(2)}`}
                    icon={Wallet}
                    color="var(--text-primary)"
                    glow="var(--accent-glow)"
                    delay={0}
                    ariaLabel="Wallet balance"
                  />
                  <StatCard
                    label="Total Bookings"
                    value={loading ? "..." : totalBookings}
                    icon={History}
                    color="var(--status-available)"
                    glow="rgba(34, 197, 94, 0.2)"
                    delay={0.1}
                    ariaLabel="Total bookings"
                  />
                </motion.div>

                {/* Quick Info */}
                <motion.div variants={itemVariants} className="md:col-span-1">
                  <Card className="h-full" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)", border: "1px solid" }}>
                    <CardHeader>
                      <CardTitle className="text-lg" style={{ color: "var(--text-primary)" }}>Identity Verification</CardTitle>
                      <CardDescription style={{ color: "var(--text-secondary)" }}>Your account status</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-lg border transition-all" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                        <div className="flex items-center gap-3">
                          <Shield className="w-5 h-5" style={{ color: "var(--status-available)" }} />
                          <span style={{ color: "var(--text-primary)" }}>Email Verified</span>
                        </div>
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ duration: 0.3, delay: 0.2 }}
                        >
                          <CheckCircle2 className="w-4 h-4" style={{ color: "var(--status-available)" }} />
                        </motion.div>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg border transition-all" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                        <div className="flex items-center gap-3">
                          <Phone className="w-5 h-5" style={{ color: "var(--status-available)" }} />
                          <span style={{ color: "var(--text-primary)" }}>Phone Verified</span>
                        </div>
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ duration: 0.3, delay: 0.4 }}
                        >
                          <CheckCircle2 className="w-4 h-4" style={{ color: "var(--status-available)" }} />
                        </motion.div>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg border transition-all" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                        <div className="flex items-center gap-3">
                          <Car className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
                          <span style={{ color: "var(--text-secondary)" }}>Vehicle Registered</span>
                        </div>
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ duration: 0.3, delay: 0.6 }}
                        >
                          <CheckCircle2 className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                        </motion.div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Personal Details Form */}
                <motion.div variants={itemVariants} className="md:col-span-3">
                  <Card style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)", border: "1px solid" }}>
                    <CardHeader>
                      <CardTitle style={{ color: "var(--text-primary)" }}>Personal Information</CardTitle>
                      <CardDescription style={{ color: "var(--text-secondary)" }}>Update your personal details here.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label style={{ color: "var(--text-secondary)" }}>Full Name</Label>
                          <Input
                            value={profile.name}
                            disabled={!isEditing}
                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                            style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label style={{ color: "var(--text-secondary)" }}>Email Address</Label>
                          <Input
                            value={profile.email}
                            disabled={true}
                            style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label style={{ color: "var(--text-secondary)" }}>Phone Number</Label>
                          <Input
                            value={profile.phone}
                            disabled={!isEditing}
                            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                            style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label style={{ color: "var(--text-secondary)" }}>Default Currency</Label>
                          <Input
                            value="INR (₹)"
                            disabled={true}
                            style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </TabsContent>

            {/* VEHICLES TAB */}
            <TabsContent value="vehicles" className="px-4">
              <Card style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)", border: "1px solid" }}>
                <CardHeader>
                  <CardTitle className="flex justify-between items-center" style={{ color: "var(--text-primary)" }}>
                    <span>Registered Vehicles</span>
                    <Button 
                      size="sm" 
                      style={{ background: "var(--accent)", color: "var(--text-primary)" }}
                      onClick={handleAddVehicle}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Vehicle
                    </Button>
                  </CardTitle>
                  <CardDescription style={{ color: "var(--text-secondary)" }}>Manage your vehicles and FASTag integration.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {profile.vehicles.map((vehicle) => (
                    <div key={vehicle.id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 rounded-xl border transition-all group" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-card)" }}>
                          <Car className="w-6 h-6" style={{ color: "var(--accent)" }} />
                        </div>
                        <div>
                          <h4 className="font-medium flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                            {vehicle.model}
                            {vehicle.isDefault && <Badge variant="secondary" className="text-[10px]" style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>Default</Badge>}
                          </h4>
                          <p className="text-sm font-mono tracking-wider" style={{ color: "var(--text-secondary)" }}>{vehicle.plate}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 mt-4 md:mt-0 w-full md:w-auto">
                        <div className="flex flex-col items-end">
                          <span className="text-xs uppercase font-bold" style={{ color: "var(--text-muted)" }}>FASTag ID</span>
                          <span className="text-sm font-mono flex items-center gap-1" style={{ color: "var(--status-available)" }}>
                            <Zap className="w-3 h-3" />
                            {profile.fastTagId}
                          </span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          style={{ color: "var(--text-muted)" }} 
                          className="hover:text-red-400 hover:bg-red-500/10" 
                          aria-label="Delete vehicle"
                          onClick={() => handleDeleteVehicle(vehicle.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* PAYMENT TAB */}
            <TabsContent value="payment" className="px-4">
              <Card style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)", border: "1px solid" }}>
                <CardHeader>
                  <CardTitle style={{ color: "var(--text-primary)" }}>Wallet & Payment Methods</CardTitle>
                  <CardDescription style={{ color: "var(--text-secondary)" }}>Manage your digital wallet and saved cards.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Wallet Section */}
                  <div className="p-6 rounded-2xl border" style={{ background: "linear-gradient(to bottom right, var(--accent-dim), var(--bg-surface))", borderColor: "var(--border-glow)" }}>
                    <motion.div 
                      className="flex justify-between items-center"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5 }}
                    >
                      <div>
                        <motion.p 
                          className="text-sm font-medium mb-1" 
                          style={{ color: "var(--accent)" }}
                          animate={{ opacity: [0.7, 1, 0.7] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          SLOTS Wallet Balance
                        </motion.p>
                        <motion.h2 
                          className="text-4xl font-bold" 
                          style={{ color: "var(--text-primary)" }}
                          animate={{ scale: [1, 1.02, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          ₹{profile.walletBalance.toFixed(2)}
                        </motion.h2>
                      </div>
                      <motion.button
                        onClick={handleTopUp}
                        style={{ background: "var(--accent)", color: "var(--text-primary)" }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-4 py-2 rounded-lg font-medium"
                      >
                        <Plus className="w-4 h-4 mr-2 inline" /> Top Up
                      </motion.button>
                    </motion.div>
                  </div>

                  <Separator style={{ background: "var(--border-glass)" }} />

                  {/* Saved Methods */}
                  <div className="space-y-4">
                    {profile.paymentMethods.map((method) => (
                      <div key={method.id} className="flex items-center justify-between p-4 rounded-xl border" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-card)" }}>
                            <CreditCard className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
                          </div>
                          <div>
                            <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                              {method.type === "Card" ? `•••• •••• •••• ${method.last4}` : method.upiId}
                            </p>
                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                              {method.type === "Card" ? "Expires 12/28" : "Verified UPI ID"}
                            </p>
                          </div>
                        </div>
                        {method.isDefault && <Badge variant="outline" style={{ borderColor: "rgba(52, 211, 153, 0.3)", color: "var(--status-available)" }}>Primary</Badge>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ADD VEHICLE DIALOG */}
            <Dialog open={isAddVehicleOpen} onOpenChange={setIsAddVehicleOpen}>
              <DialogContent style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)" }}>
                <DialogHeader>
                  <DialogTitle style={{ color: "var(--text-primary)" }}>Add New Vehicle</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label style={{ color: "var(--text-secondary)" }}>Make *</Label>
                    <Input
                      value={newVehicle.make}
                      onChange={(e) => setNewVehicle({ ...newVehicle, make: e.target.value })}
                      placeholder="e.g., Toyota"
                      style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label style={{ color: "var(--text-secondary)" }}>Model *</Label>
                    <Input
                      value={newVehicle.model}
                      onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
                      placeholder="e.g., Fortuner"
                      style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label style={{ color: "var(--text-secondary)" }}>License Plate *</Label>
                    <Input
                      value={newVehicle.licensePlate}
                      onChange={(e) => setNewVehicle({ ...newVehicle, licensePlate: e.target.value.toUpperCase() })}
                      placeholder="e.g., TN-01-AB-1234"
                      style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label style={{ color: "var(--text-secondary)" }}>Color</Label>
                    <Input
                      value={newVehicle.color}
                      onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })}
                      placeholder="e.g., White"
                      style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label style={{ color: "var(--text-secondary)" }}>FASTag ID (Optional)</Label>
                    <Input
                      value={newVehicle.fastagId}
                      onChange={(e) => setNewVehicle({ ...newVehicle, fastagId: e.target.value })}
                      placeholder="e.g., FASTAG-XXX-001"
                      style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setIsAddVehicleOpen(false)}
                      style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveVehicle}
                      style={{ background: "var(--accent)", color: "var(--text-primary)" }}
                    >
                      Add Vehicle
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* SECURITY TAB */}
            <TabsContent value="security" className="px-4">
              <Card style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)", border: "1px solid" }}>
                <CardHeader>
                  <CardTitle style={{ color: "var(--text-primary)" }}>Security Settings</CardTitle>
                  <CardDescription style={{ color: "var(--text-secondary)" }}>Manage password and account access.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-xl border" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                    <div>
                      <p className="font-medium" style={{ color: "var(--text-primary)" }}>Two-Factor Authentication</p>
                      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Add an extra layer of security.</p>
                    </div>
                    <Switch 
                      checked={twoFactorEnabled}
                      onCheckedChange={handleToggle2FA}
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label style={{ color: "var(--text-secondary)" }}>Current Password</Label>
                      <Input type="password" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label style={{ color: "var(--text-secondary)" }}>New Password</Label>
                        <Input type="password" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }} />
                      </div>
                      <div className="space-y-2">
                        <Label style={{ color: "var(--text-secondary)" }}>Confirm Password</Label>
                        <Input type="password" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }} />
                      </div>
                    </div>
                  </div>

                  <Button className="w-full" style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}>Update Password</Button>
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
        </motion.div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  )
}
