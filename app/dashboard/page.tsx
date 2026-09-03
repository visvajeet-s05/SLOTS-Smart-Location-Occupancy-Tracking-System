"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import dynamic from "next/dynamic"
import { Search, Filter, MapPin, Clock, Car, Star, TrendingUp, RefreshCw, ChevronDown } from "lucide-react"
import { useSession } from "next-auth/react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import ParkingAreaRow from "@/components/parking/parking-area-row"
import QuickViewModal from "@/components/parking/quick-view-modal"
import Footer from "@/components/layout/footer"
import DashboardShell from "@/components/ui/DashboardShell"
import MapSkeleton from "@/components/map/MapSkeleton"
import CustomerNavbar from "@/components/navigation/CustomerNavbar"
import { StatCard, SemanticBadge, ProgressBar } from "@/components/design-system"

// Dynamically import the map to prevent SSR issues
const ParkingMap = dynamic(() => import("@/components/map/parking-map"), {
  ssr: false,
  loading: () => <MapSkeleton />,
})

// WebSocket connection for real-time updates
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000"

// Parking area type from database
interface ParkingArea {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  totalSlots: number
  availableSlots: number
  occupiedSlots: number
  reservedSlots: number
  price: number
  status: "available" | "limited" | "full"
  ownerName: string
  ownerEmail: string
  cameraUrl: string | null
  features: string[]
  distance: number
  rating: number
  openingHours: string
  coordinates: [number, number]
}

export default function Dashboard() {
  const { data: session } = useSession()
  const [searchQuery, setSearchQuery] = useState("")
  const [priceRange, setPriceRange] = useState([0, 150])
  const [selectedParkingArea, setSelectedParkingArea] = useState<string | null>(null)
  const [quickViewArea, setQuickViewArea] = useState<ParkingArea | null>(null)
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false)
  const [sortBy, setSortBy] = useState<"distance" | "price" | "rating">("distance")

  // Database connection states
  const [parkingAreas, setParkingAreas] = useState<ParkingArea[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Fetch parking areas from database
  const fetchParkingAreas = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch("/api/parking")
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch parking areas")
      }

      setParkingAreas(data.parkingAreas || [])
      setLastUpdate(new Date())
    } catch (err) {
      console.error("Error fetching parking areas:", err)
      setError(err instanceof Error ? err.message : "Failed to load parking areas")
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchParkingAreas()
  }, [fetchParkingAreas])

  // WebSocket connection for real-time updates
  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 5
    const BASE_RECONNECT_DELAY = 3000

    const connectWebSocket = () => {
      // Prevent duplicate connections
      if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
        return
      }

      // Stop trying after max attempts
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log("⚠️ Max WebSocket reconnection attempts reached. Stopping reconnection.")
        return
      }

      try {
        ws = new WebSocket(WS_URL)

        ws.onopen = () => {
          console.log("✅ Customer Dashboard WebSocket connected")
          setWsConnected(true)
          reconnectAttempts = 0 // Reset counter on successful connection

          // Subscribe to all parking lot updates
          ws?.send(JSON.stringify({
            type: "SUBSCRIBE",
            role: "CUSTOMER"
          }))
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)

            // Handle slot updates
            if (data.type === "SLOT_UPDATE" && data.lotId) {
              setParkingAreas(prev => prev.map(area => {
                if (area.id === data.lotId) {
                  // Update slot counts based on the status change
                  const newArea = { ...area }

                  if (data.status === "AVAILABLE") {
                    newArea.availableSlots = Math.min(area.availableSlots + 1, area.totalSlots)
                    newArea.occupiedSlots = Math.max(area.occupiedSlots - 1, 0)
                  } else if (data.status === "OCCUPIED") {
                    newArea.availableSlots = Math.max(area.availableSlots - 1, 0)
                    newArea.occupiedSlots = Math.min(area.occupiedSlots + 1, area.totalSlots)
                  } else if (data.status === "RESERVED") {
                    newArea.availableSlots = Math.max(area.availableSlots - 1, 0)
                    newArea.reservedSlots = Math.min(area.reservedSlots + 1, area.totalSlots)
                  }

                  // Recalculate status
                  const availabilityRatio = newArea.totalSlots > 0 ? newArea.availableSlots / newArea.totalSlots : 0
                  newArea.status = availabilityRatio > 0.5 ? "available" :
                    availabilityRatio > 0.2 ? "limited" : "full"

                  return newArea
                }
                return area
              }))

              setLastUpdate(new Date())
            }

            // Handle bulk updates
            if (data.type === "BULK_UPDATE" && data.lotId) {
              // Refresh all data for accuracy
              fetchParkingAreas()
            }
          } catch (err) {
            console.error("Error processing WebSocket message:", err)
          }
        }

        ws.onclose = (event) => {
          console.log(`❌ Customer Dashboard WebSocket disconnected (code: ${event.code}, reason: ${event.reason || 'No reason provided'})`)
          setWsConnected(false)

          // Attempt to reconnect with exponential backoff
          reconnectAttempts++
          const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1), 30000)
          console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)

          reconnectTimeout = setTimeout(connectWebSocket, delay)
        }

        ws.onerror = (error) => {
          // Log error details without causing console error spam
          const errorInfo = {
            type: error?.type || 'unknown',
            timestamp: new Date().toISOString(),
            readyState: ws?.readyState,
            url: WS_URL
          }
          console.warn("WebSocket connection issue:", errorInfo)
          setWsConnected(false)
          // Don't close here - let onclose handle reconnection
        }
      } catch (err) {
        console.error("Failed to create WebSocket connection:", err instanceof Error ? err.message : String(err))
        setWsConnected(false)
      }
    }

    connectWebSocket()

    // Cleanup
    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (ws) {
        ws.onclose = null // Prevent reconnection attempts during cleanup
        ws.close()
      }
    }
  }, [fetchParkingAreas])

  // Filter logic
  let filteredAreas = parkingAreas.filter(
    (area) =>
      area.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      area.address.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Apply price filter
  filteredAreas = filteredAreas.filter(
    (area) => area.price >= priceRange[0] && area.price <= priceRange[1]
  )

  // Apply sorting
  filteredAreas = [...filteredAreas].sort((a, b) => {
    if (sortBy === "distance") return a.distance - b.distance
    if (sortBy === "price") return a.price - b.price
    if (sortBy === "rating") return b.rating - a.rating
    return 0
  })

  const stats = {
    total: parkingAreas.length,
    available: parkingAreas.reduce((sum, a) => sum + a.availableSlots, 0),
    totalSpots: parkingAreas.reduce((sum, a) => sum + a.totalSlots, 0),
    avgRating: (() => {
      const ratedLots = parkingAreas.filter(a => a.rating > 0)
      if (ratedLots.length === 0) return "New"
      return (ratedLots.reduce((sum, a) => sum + a.rating, 0) / ratedLots.length).toFixed(1)
    })(),
    occupancyRate: parkingAreas.length > 0 
      ? ((parkingAreas.reduce((sum, a) => sum + a.availableSlots, 0) / parkingAreas.reduce((sum, a) => sum + a.totalSlots, 0)) * 100).toFixed(1)
      : "0"
  }

  const hasParkingData = parkingAreas.length > 0
  const hasActiveFilters = searchQuery !== "" || priceRange[0] !== 0 || priceRange[1] !== 150

  return (
    <DashboardShell>
      {/* Page Header – Enhanced Hero with Animated Background */}
      <div className="relative pt-8 pb-8 overflow-hidden">
        {/* Animated Gradient Mesh Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-slate-950 to-slate-950" />
          <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-10" />
          <motion.div 
            animate={{
              backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"]
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "linear"
            }}
            className="absolute inset-0 opacity-30"
            style={{
              background: "radial-gradient(circle at 30% 50%, rgba(108, 92, 231, 0.15) 0%, transparent 50%), radial-gradient(circle at 70% 50%, rgba(6, 182, 212, 0.1) 0%, transparent 50%)"
            }}
          />
        </div>

        <div className="relative z-10 px-4 max-w-[1440px] mx-auto text-center md:text-left">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-3">
              <span style={{ color: "var(--text-primary)" }}>
                Welcome, {session?.user?.name?.split(' ')[0] || 'Back'}! Find Your Perfect
              </span>
              <span 
                className="relative inline-block"
                style={{ color: "var(--accent)" }}
              >
                {" "}Spot
                <motion.div
                  className="absolute -inset-2 rounded-lg blur-lg opacity-50"
                  style={{ background: "var(--accent-glow)" }}
                  animate={{
                    opacity: [0.3, 0.6, 0.3],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />
              </span>
            </h1>
            <div className="w-full">
              <p className="text-sm md:text-base lg:text-lg leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Experience seamless parking across Chennai with real-time availability and smart booking.
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="px-4 max-w-[1440px] mx-auto py-4 space-y-8 relative z-20 pb-20">

        {/* Quick Stats - Using Design System Components */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 px-4"
        >
          <StatCard
            label="Total Parking"
            value={stats.total}
            icon={Car}
            color="var(--text-primary)"
            glow="var(--accent-glow)"
            delay={0}
            ariaLabel="Total parking lots"
          />
          <StatCard
            label="Available"
            value={stats.available}
            icon={TrendingUp}
            color="var(--status-available)"
            glow="rgba(34, 197, 94, 0.2)"
            delay={0.1}
            trend={{ value: 12, isPositive: true }}
            ariaLabel="Available parking spots"
          />
          <StatCard
            label="Total Spaces"
            value={stats.totalSpots}
            icon={MapPin}
            color="var(--text-primary)"
            glow="var(--accent-glow)"
            delay={0.2}
            ariaLabel="Total parking spaces"
          />
          <StatCard
            label="Avg Rating"
            value={typeof stats.avgRating === 'number' ? `${stats.avgRating}★` : "New"}
            icon={Star}
            color={typeof stats.avgRating === 'number' ? "#E0B989" : "var(--text-muted)"}
            glow={typeof stats.avgRating === 'number' ? "rgba(201, 165, 116, 0.2)" : "rgba(148, 163, 184, 0.1)"}
            delay={0.3}
            ariaLabel="Average rating"
          />
          <StatCard
            label="Occupancy"
            value={`${stats.occupancyRate}%`}
            icon={TrendingUp}
            color="var(--status-available)"
            glow="rgba(34, 197, 94, 0.2)"
            delay={0.4}
            trend={{ value: 5, isPositive: true }}
            ariaLabel="Network occupancy rate"
          />
        </motion.div>

        {/* Search & Filters - Enhanced Interactive Elements */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-20 rounded-2xl p-1 shadow-2xl px-4"
          style={{ background: "var(--bg-glass)", border: "1px solid var(--border-glass)", backdropFilter: "blur(12px)", boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)" }}
        >
          <div className="flex flex-col md:flex-row gap-2 p-1">
            {/* Search Input */}
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors" aria-hidden="true" style={{ color: "var(--text-muted)" }} />
              <Input
                placeholder="Search parking by name or location..."
                aria-label="Search parking areas"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 bg-transparent border-transparent text-white outline-none transition-all rounded-xl text-lg"
                style={{ color: "var(--text-primary)" }}
                onFocus={(e) => {
                  const parent = e.currentTarget.parentElement
                  if (parent) {
                    parent.style.borderColor = "var(--border-glow)"
                    parent.style.boxShadow = "0 0 20px var(--accent-glow)"
                  }
                }}
                onBlur={(e) => {
                  const parent = e.currentTarget.parentElement
                  if (parent) {
                    parent.style.borderColor = "var(--border-glass)"
                    parent.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.4)"
                  }
                }}
              />
            </div>

            <div className="h-px md:h-14 w-full md:w-px" style={{ background: "var(--border-glass)" }} />

            {/* Filters Row */}
            <div className="flex gap-2">
              {/* Price Filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" className="h-14 px-6 rounded-xl border border-transparent hover:bg-white/5 hover:border-white/5 transition-all" style={{ color: "var(--text-secondary)" }}>
                    <Filter className="mr-2 h-4 w-4" />
                    <div className="text-left">
                      <span className="block text-[10px] uppercase font-bold tracking-wider" style={{ color: "var(--text-muted)" }}>Price Range</span>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>₹{priceRange[0]} - ₹{priceRange[1]}</span>
                    </div>
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 rounded-2xl shadow-xl backdrop-blur-xl p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)", color: "var(--text-primary)" }}>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-bold">Price Range (₹/hr)</h4>
                      <span className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-surface)", color: "var(--text-secondary)" }}>₹{priceRange[0]} - ₹{priceRange[1]}</span>
                    </div>
                    <Slider
                      defaultValue={[0, 150]}
                      max={150}
                      step={5}
                      value={priceRange}
                      onValueChange={setPriceRange}
                      className="py-4"
                    />
                    <div className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                      {filteredAreas.length} results match your filter
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="h-14 w-px hidden md:block" style={{ background: "var(--border-glass)" }} />

              {/* Sort Dropdown */}
              <div className="relative min-w-[180px]">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <span className="block text-[10px] uppercase font-bold tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>Sort By</span>
                  <TrendingUp className="h-0 w-0 hidden" />
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="h-14 w-full appearance-none bg-transparent border border-transparent hover:border-white/5 rounded-xl pl-4 pt-4 pb-1 pr-10 font-medium focus:outline-none cursor-pointer transition-all"
                  style={{ color: "var(--text-primary)" }}
                >
                  <option value="distance" style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}>Distance</option>
                  <option value="price" style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}>Price (Low to High)</option>
                  <option value="rating" style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}>Rating (High to Low)</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "var(--text-muted)" }} />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Map Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative z-10 w-full bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden h-[350px] md:h-[500px] shadow-2xl shadow-black/40 px-4"
        >
          <div className="absolute inset-0 z-0">
            <ParkingMap
              parkingAreas={filteredAreas}
              selectedId={selectedParkingArea}
              onSelectParkingArea={setSelectedParkingArea}
            />
          </div>
        </motion.div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-20">
            <div className="relative mx-auto h-16 w-16 mb-6">
              <div className="absolute inset-0 border-t-2 border-purple-500 rounded-full animate-spin"></div>
              <div className="absolute inset-2 border-r-2 border-indigo-500 rounded-full animate-spin-reverse"></div>
            </div>
            <p className="text-slate-400 font-medium animate-pulse">Syncing real-time parking data...</p>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="text-center py-12 bg-red-500/5 border border-red-500/20 rounded-2xl backdrop-blur-sm mx-auto max-w-2xl">
            <p className="text-red-400 mb-6 flex items-center justify-center gap-2 font-medium"><span className="text-xl">⚠️</span> {error}</p>
            <Button
              onClick={fetchParkingAreas}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20"
            >
              Retry Connection
            </Button>
          </div>
        )}

        {/* Parking Areas Grid */}
        {!isLoading && !error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="px-4"
          >
            <div className="flex items-center justify-between mb-8 scroll-mt-24" id="available-parking">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span className="w-1.5 h-8 bg-gradient-to-b from-purple-500 to-indigo-500 rounded-full block"></span>
                {filteredAreas.length === 0 ? "No Areas Found" : "Available Parking"}
              </h2>
              <div className="text-slate-400 text-sm bg-white/5 px-4 py-2 rounded-full border border-white/5 backdrop-blur-sm">
                Found <span className="text-white font-bold">{filteredAreas.length}</span> results
              </div>
            </div>

            {filteredAreas.length === 0 ? (
              <div className="text-center py-20 bg-slate-900/30 border border-white/5 rounded-3xl backdrop-blur-sm">
                {hasActiveFilters ? (
                  <>
                    <p className="text-slate-400 mb-6 text-lg">No parking areas match your current filters.</p>
                    <Button
                      onClick={() => {
                        setSearchQuery("")
                        setPriceRange([0, 150])
                      }}
                      className="bg-white/10 hover:bg-white/20 text-white px-8 py-6 rounded-xl border border-white/5"
                    >
                      Clear All Filters
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-slate-400 mb-6 text-lg">No parking areas available in your area yet.</p>
                    <p className="text-slate-500 mb-6 text-sm">We're expanding our coverage across Chennai. Check back soon!</p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredAreas.map((area, index) => (
                  <motion.div
                    key={area.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    onClick={() => {
                      setQuickViewArea(area)
                      setIsQuickViewOpen(true)
                    }}
                    className="cursor-pointer"
                  >
                    <div className="rounded-2xl border backdrop-blur-md transition-all duration-300 hover:-translate-y-1 relative overflow-hidden group"
                         style={{ background: "var(--bg-card)", borderColor: "var(--border-glass)", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)" }}>
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" 
                           style={{ background: "linear-gradient(135deg, var(--accent-glow) 0%, transparent 50%)" }} />
                      
                      <div className="relative z-10 p-4 space-y-3">
                        {/* Header */}
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                              {area.name}
                            </h3>
                            <SemanticBadge status={area.status} className="text-[10px]">
                              {area.status === "available" ? "Available" : area.status === "limited" ? "Limited" : "Full"}
                            </SemanticBadge>
                          </div>
                        </div>

                        {/* Location */}
                        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                          <MapPin className="w-3 h-3" />
                          <span className="line-clamp-1">{area.address}</span>
                        </div>

                        {/* Progress Bar */}
                        <ProgressBar
                          value={area.availableSlots}
                          max={area.totalSlots}
                          showLabel={false}
                          animated={true}
                          className="h-1"
                        />

                        {/* Info Grid */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2 rounded-lg border" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                            <p className="text-[8px] uppercase font-bold tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>Price</p>
                            <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>₹{area.price}</p>
                          </div>
                          <div className="p-2 rounded-lg border" style={{ background: "var(--bg-surface)", borderColor: "var(--border-glass)" }}>
                            <p className="text-[8px] uppercase font-bold tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>Rating</p>
                            <div className="flex items-center gap-1">
                              {area.rating > 0 ? (
                                <>
                                  <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{area.rating}</span>
                                  <Star className="w-3 h-3" style={{ color: "#E0B989", fill: "#E0B989" }} />
                                </>
                              ) : (
                                <span className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>New</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Quick View Modal */}
      <QuickViewModal
        isOpen={isQuickViewOpen}
        onClose={() => {
          setIsQuickViewOpen(false)
          setQuickViewArea(null)
        }}
        parkingArea={quickViewArea}
      />

      {/* Footer */}
      <Footer />
    </DashboardShell>
  )
}
