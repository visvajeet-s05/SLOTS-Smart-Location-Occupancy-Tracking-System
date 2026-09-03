"use client"

import { useEffect, useState, use, useRef } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { useOwnerWS } from "@/components/ws/OwnerWebSocketProvider"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  Camera,
  Grid3X3,
  Power,
  Wrench,
  AlertCircle,
  CheckCircle,
  XCircle,
  Settings,
  Unlock,
  Lock,
  RefreshCw,
  LayoutDashboard,
  ShieldCheck,
  Zap,
  RotateCcw,
  Activity,
  IndianRupee
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OWNER_PARKING_MAPPING, PARKING_LOT_DETAILS } from "@/lib/owner-mapping"

type SlotStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED" | "DISABLED" | "CLOSED"

type Slot = {
  id: string
  slotNumber: number
  row: string
  status: SlotStatus
  aiConfidence?: number
  updatedBy?: "AI" | "OWNER" | "CUSTOMER"
  price?: number
  slotType?: string
}

interface LotInfo {
  id: string
  name: string
  totalSlots: number
  address?: string
}

export default function OwnerSlotsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { id: lotId } = use(params)

  const [slots, setSlots] = useState<Slot[]>([])
  const [lotInfo, setLotInfo] = useState<LotInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRow, setSelectedRow] = useState<string | null>(null)
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [hourlyRate, setHourlyRate] = useState(50)

  const [wsConnected, setWsConnected] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())

  const isFetchingSlotsRef = useRef(false)
  const hasFetchedInitialDataRef = useRef(false)

  const [stats, setStats] = useState({
    total: 0,
    available: 0,
    occupied: 0,
    reserved: 0,
    disabled: 0,
    closed: 0
  })

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

   // Ensure owner is viewing their allowed parking lot
   useEffect(() => {
     if (status === "loading") return
     if (status === "unauthenticated") return

     const ownerEmail = (session?.user?.email || "").toLowerCase()
     const allowedLotId = session?.user?.parkingLotId || OWNER_PARKING_MAPPING[ownerEmail]
     const allowedLotIdNormalized = (allowedLotId || "").toString().trim().toUpperCase()
     const currentLotIdNormalized = (lotId || "").toString().trim().toUpperCase()

     if (allowedLotId && allowedLotIdNormalized && currentLotIdNormalized !== allowedLotIdNormalized) {
       console.warn(`Owner attempted to access lot ${lotId} but is only allowed to access ${allowedLotId}`)
       router.replace(`/dashboard/owner/parking-lots/${allowedLotId}/slots`)
     }
   }, [session, status, lotId, router])

  // Fetch initial data
  useEffect(() => {
    if (!lotId || hasFetchedInitialDataRef.current) return
    hasFetchedInitialDataRef.current = true

    const fetchData = async () => {
      try {
        const slotsRes = await fetch(`/api/parking/${lotId}/slots`)
        const slotsData = await slotsRes.json()
        if (slotsData.slots) {
          setSlots(slotsData.slots)
          updateStats(slotsData.slots)
        }
        if (slotsData.lot) {
          setLotInfo(slotsData.lot)
        } else {
          // Use fallback lot details
          const lotDetails = PARKING_LOT_DETAILS[lotId]
          if (lotDetails) {
            setLotInfo({
              id: lotId,
              name: lotDetails.name,
              totalSlots: lotDetails.totalSlots,
              address: lotDetails.location
            })
          }
        }
      } catch (err) {
        console.error("Failed to fetch initial data:", err)
        // Use fallback data
        const lotDetails = PARKING_LOT_DETAILS[lotId]
        if (lotDetails) {
          setLotInfo({
            id: lotId,
            name: lotDetails.name,
            totalSlots: lotDetails.totalSlots,
            address: lotDetails.location
          })
          // Generate mock slots for demo
          const mockSlots = generateMockSlots(lotDetails.totalSlots)
          setSlots(mockSlots)
          updateStats(mockSlots)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [lotId])

  // WebSocket
  const { isConnected: globalWsConnected, lastMessage } = useOwnerWS()
  useEffect(() => {
    setWsConnected(globalWsConnected)
  }, [globalWsConnected])

   useEffect(() => {
     if (!lastMessage) return
     if (!lastMessage.lotId || lastMessage.lotId !== lotId) {
       // Also accept messages with no lotId (global broadcasts) if type is a broadcast
       if (lastMessage.type !== "BULK_SLOT_UPDATE") return
     }

     if (lastMessage.type === "SLOT_UPDATE" && lastMessage.slotId) {
       setSlots((prev) => {
         const newSlots = prev.map((slot) =>
           slot.id === lastMessage.slotId
             ? { ...slot, status: lastMessage.status as SlotStatus, aiConfidence: lastMessage.confidence, updatedBy: lastMessage.updatedBy }
             : slot
         )
         updateStats(newSlots)
         return newSlots
       })
     } else if (lastMessage.type === "BULK_SLOT_UPDATE") {
       // The bulk API sends BULK_SLOT_UPDATE for notification, followed by individual SLOT_UPDATE messages
       // Re-fetch to ensure consistency
       setStats(prev => ({ ...prev }))
     }
   }, [lastMessage, lotId])

  const updateStats = (slotData: Slot[]) => {
    setStats({
      total: slotData.length,
      available: slotData.filter(s => s.status === "AVAILABLE").length,
      occupied: slotData.filter(s => s.status === "OCCUPIED").length,
      reserved: slotData.filter(s => s.status === "RESERVED").length,
      disabled: slotData.filter(s => s.status === "DISABLED").length,
      closed: slotData.filter(s => s.status === "CLOSED").length
    })
  }

  const handleSlotStatusChange = async (slotId: string, newStatus: SlotStatus) => {
    try {
      const response = await fetch("/api/owner/slots/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId, slotId, status: newStatus, confidence: 100 })
      })
      if (!response.ok) throw new Error("Update failed")
    } catch (error) {
      console.error(error)
      alert("Failed to update slot")
    }
  }

  const handleBulkAction = async (action: string, row?: string) => {
    setBulkActionLoading(true)
    try {
      const response = await fetch("/api/owner/slots/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId, action, row })
      })
      if (!response.ok) throw new Error("Bulk action failed")
    } catch (error) {
      console.error(error)
      alert("Failed to perform bulk action")
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handlePriceUpdate = async () => {
    setBulkActionLoading(true)
    try {
      const response = await fetch("/api/owner/slots/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lotId,
          action: "UPDATE_PRICE",
          price: hourlyRate,
          row: selectedRow
        })
      })
      if (!response.ok) throw new Error("Price update failed")
    } catch (error) {
      console.error(error)
      alert("Failed to update price")
    } finally {
      setBulkActionLoading(false)
    }
  }

  const slotsByRow = slots.reduce((acc, slot) => {
    if (!acc[slot.row]) acc[slot.row] = []
    acc[slot.row].push(slot)
    return acc
  }, {} as Record<string, Slot[]>)

  const rows = Object.keys(slotsByRow).sort()

  // Generate mock slots for demo purposes
  const generateMockSlots = (totalSlots: number): Slot[] => {
    const rowLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    const slots: Slot[] = []
    let slotCounter = 1
    
    rowLetters.forEach(row => {
      const slotsInRow = Math.ceil(totalSlots / rowLetters.length)
      for (let i = 1; i <= slotsInRow && slotCounter <= totalSlots; i++) {
        // Add some variety to statuses
        let status: SlotStatus = "AVAILABLE"
        if (Math.random() > 0.7) status = "OCCUPIED"
        else if (Math.random() > 0.8) status = "RESERVED"
        
        slots.push({
          id: `${row}${i}`,
          slotNumber: i,
          row,
          status,
          aiConfidence: Math.floor(Math.random() * 20) + 80,
          updatedBy: "AI"
        })
        slotCounter++
      }
    })
    
    return slots
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-indigo-500/20 border-b-indigo-500 rounded-full animate-spin-slow" />
          </div>
        </div>
      </div>
    )
  }

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const userName = session?.user?.name || "Owner"
  const userInitial = userName.charAt(0).toUpperCase()

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* MAIN CONTAINER WITH PERFECT HORIZONTAL MARGINS */}
      <main className="max-w-[1536px] mx-auto px-6 py-8 space-y-8">
        
        {/* PAGE TITLE & SUMMARY KPI ROW */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-neutral-800/80 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-indigo-400 uppercase tracking-widest mb-1">
              <span>Owner Portal</span>
              <span>/</span>
              <span>Facility Node #01</span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <h1 className="text-3xl font-extrabold text-white tracking-tight">{lotInfo?.name || "Parking Lot"}</h1>
              <Link
                href={`/dashboard/owner/parking-lots/${lotId}/camera`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/20 text-xs font-semibold transition-all"
              >
                <Camera className="w-4 h-4" />
                <span>Live Camera Feed</span>
              </Link>
            </div>
            <p className="text-xs font-mono text-neutral-400 mt-1">
              Real-time monitoring enabled • <strong className="text-white">{stats.total} total managed nodes</strong>
            </p>
          </div>

          {/* KPI STAT CARDS BAR */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-neutral-900/90 border border-neutral-800/80 min-w-[110px]">
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block">CAPACITY</span>
              <span className="text-2xl font-black text-white font-mono">{stats.total}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 min-w-[110px]">
              <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block">AVAILABLE</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">{stats.available}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 min-w-[110px]">
              <span className="text-[10px] font-mono text-rose-400 uppercase tracking-wider block">OCCUPIED</span>
              <span className="text-2xl font-black text-rose-400 font-mono">{stats.occupied}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 min-w-[110px]">
              <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider block">RESERVED</span>
              <span className="text-2xl font-black text-amber-400 font-mono">{stats.reserved}</span>
            </div>
          </div>
        </div>

        {/* TWO-COLUMN LAYOUT: MAIN GRID (LEFT) + STICKY CONTROLS (RIGHT) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: SLOT MANAGEMENT GRID */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* GRID HEADER & STATUS LEGEND */}
            <div className="p-5 rounded-2xl bg-neutral-900/80 border border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">Slot Grid Architecture</h2>
                <p className="text-xs text-neutral-400">Interactive real-time slot state & manual override triggers</p>
              </div>

              {/* Status Legend */}
              <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50"></span>
                  <span className="text-neutral-300">Available</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50"></span>
                  <span className="text-neutral-300">Occupied</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50"></span>
                  <span className="text-neutral-300">Reserved</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500 shadow-sm shadow-slate-500/50"></span>
                  <span className="text-neutral-300">Maintenance</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-neutral-500 shadow-sm shadow-neutral-500/50"></span>
                  <span className="text-neutral-300">Closed</span>
                </div>
              </div>
            </div>

            {/* RENDER ROWS */}
            <div className="space-y-6">
              {rows.map((row) => (
                <div key={row} className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-800/60 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono font-bold">
                        ROW {row}
                      </span>
                      <span className="text-xs font-mono text-neutral-500">{slotsByRow[row].length} Total Allocated Slots</span>
                    </div>
                    <button className="text-[11px] font-mono text-neutral-400 hover:text-white transition-colors">
                      Configure Row {row} →
                    </button>
                  </div>

                  {/* Responsive Grid Cells */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                    {slotsByRow[row]
                      .sort((a, b) => a.slotNumber - b.slotNumber)
                      .map((slot) => {
                        const slotNum = `${slot.row}${slot.slotNumber}`
                        const isOccupied = slot.status === "OCCUPIED"
                        const isReserved = slot.status === "RESERVED"
                        const isAvailable = slot.status === "AVAILABLE"
                        const isDisabled = slot.status === "DISABLED"
                        const isClosed = slot.status === "CLOSED"

                        // Determine the next status when clicked (cycle)
                        let nextStatus: SlotStatus = "AVAILABLE"
                        let statusLabel = "Available"
                        let statusClass = 'bg-neutral-900 hover:bg-neutral-800/80 border-emerald-500/30 hover:border-emerald-400'
                        let dotClass = 'bg-emerald-400 shadow-sm shadow-emerald-400'

                        if (isOccupied) {
                          nextStatus = "AVAILABLE"
                          statusLabel = "Occupied"
                          statusClass = 'bg-rose-500/10 border-rose-500/30 hover:border-rose-500/60'
                          dotClass = 'bg-rose-500 shadow-sm shadow-rose-500'
                        } else if (isReserved) {
                          nextStatus = "AVAILABLE"
                          statusLabel = "Reserved"
                          statusClass = 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500/60'
                          dotClass = 'bg-amber-400 shadow-sm shadow-amber-400'
                        } else if (isClosed) {
                          nextStatus = "AVAILABLE"
                          statusLabel = "Closed"
                          statusClass = 'bg-neutral-700/50 border-neutral-600 hover:border-neutral-500'
                          dotClass = 'bg-neutral-500 shadow-sm shadow-neutral-500'
                        } else if (isDisabled) {
                          nextStatus = "AVAILABLE"
                          statusLabel = "Maintenance"
                          statusClass = 'bg-slate-500/10 border-slate-500/30 hover:border-slate-500/60'
                          dotClass = 'bg-slate-500 shadow-sm shadow-slate-500'
                        } else if (isAvailable) {
                          nextStatus = "CLOSED"
                          statusLabel = "Available"
                          statusClass = 'bg-neutral-900 hover:bg-neutral-800/80 border-emerald-500/30 hover:border-emerald-400'
                          dotClass = 'bg-emerald-400 shadow-sm shadow-emerald-400'
                        }

                        return (
                          <div
                            key={slot.id}
                            onClick={() => handleSlotStatusChange(slot.id, nextStatus)}
                            className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between h-20 relative group ${statusClass}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-bold font-mono transition-colors ${
                                isDisabled || isClosed ? 'text-neutral-400' : 'text-white group-hover:text-indigo-400'
                              }`}>
                                {slotNum}
                              </span>
                              <span className={`w-2 h-2 rounded-full ${dotClass}`}></span>
                            </div>

                            <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-neutral-400">
                              {statusLabel}
                            </span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* RIGHT COLUMN: STICKY CONTROL PANEL */}
          <div className="lg:col-span-4 sticky top-20 space-y-6">
            
            {/* OVERRIDE PROTOCOLS */}
            <div className="p-6 rounded-2xl bg-neutral-900/90 border border-neutral-800/80 space-y-5 shadow-2xl">
              <div className="flex items-center gap-2 text-white font-mono font-bold text-sm">
                <Zap className="w-4 h-4 text-amber-400" />
                <h3>Override Protocols</h3>
              </div>

              {/* Master Global Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleBulkAction("OPEN_ALL")}
                  disabled={bulkActionLoading}
                  className="p-3.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold transition-all text-center space-y-1 disabled:opacity-50"
                >
                  <span className="block text-base">🔓</span>
                  <span>OPEN ALL</span>
                </button>
                <button
                  onClick={() => handleBulkAction("CLOSE_ALL")}
                  disabled={bulkActionLoading}
                  className="p-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-mono text-xs font-bold transition-all text-center space-y-1 disabled:opacity-50"
                >
                  <span className="block text-base">🔒</span>
                  <span>CLOSE ALL</span>
                </button>
              </div>

              {/* Zone Specific Command */}
              <div className="space-y-3 pt-3 border-t border-neutral-800/80">
                <label className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 block">
                  Zone-Specific Command
                </label>
                <Select
                  value={selectedRow || ""}
                  onValueChange={(val) => setSelectedRow(val && val !== "ALL" ? val : null)}
                >
                  <SelectTrigger className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500">
                    <SelectValue placeholder="Target Row" />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-950 border border-neutral-800 text-white">
                    <SelectItem value="ALL">All Rows</SelectItem>
                    {rows.map(r => <SelectItem key={r} value={r}>Row {r}</SelectItem>)}
                  </SelectContent>
                </Select>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    onClick={() => handleBulkAction("OPEN_ROW", selectedRow!)}
                    disabled={!selectedRow || bulkActionLoading}
                    className="py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-mono text-xs font-semibold transition-colors disabled:opacity-30"
                  >
                    Mass Open
                  </button>
                  <button
                    onClick={() => handleBulkAction("CLOSE_ROW", selectedRow!)}
                    disabled={!selectedRow || bulkActionLoading}
                    className="py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-mono text-xs font-semibold transition-colors disabled:opacity-30"
                  >
                    Mass Close
                  </button>
                  <button
                    onClick={() => handleBulkAction("MAINTENANCE_ROW", selectedRow!)}
                    disabled={!selectedRow || bulkActionLoading}
                    className="py-2 rounded-xl bg-slate-500/20 hover:bg-slate-500/30 text-slate-400 font-mono text-xs font-semibold border border-slate-500/30 transition-colors disabled:opacity-30"
                  >
                    Maintenance
                  </button>
                </div>
              </div>
            </div>

            {/* LIVE PRICING STRATEGY */}
            <div className="p-6 rounded-2xl bg-neutral-900/90 border border-neutral-800/80 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between text-white font-mono font-bold text-sm">
                <div className="flex items-center gap-2">
                  <IndianRupee className="w-4 h-4 text-emerald-400" />
                  <h3>Pricing Strategy</h3>
                </div>
                <span className="text-[10px] font-mono text-neutral-500">INR / HR</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-neutral-500 text-sm">₹</span>
                  <input
                    type="number"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-8 pr-3 py-2 text-sm font-mono text-white font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  onClick={handlePriceUpdate}
                  disabled={bulkActionLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-neutral-950 font-mono text-xs font-bold hover:bg-emerald-400 transition-colors disabled:opacity-50"
                >
                  UPDATE
                </button>
              </div>

              <p className="text-[11px] font-mono text-neutral-500">
                • Dynamic surge pricing automatically scales during peak occupancy hours.
              </p>
            </div>

            {/* SYSTEM AI TELEMETRY */}
            <div className="p-6 rounded-2xl bg-neutral-900/90 border border-neutral-800/80 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between text-white font-bold mb-2">
                <span>System AI Status</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-lg transition-all ${wsConnected
                  ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                  : "text-red-400 bg-red-500/10 border border-red-500/20"
                }`}>
                  {wsConnected ? "ACTIVE" : "OFFLINE"}
                </span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Detection Engine:</span>
                <span className="text-white">YOLOv8 Edge AI</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Real-time Sync:</span>
                <span className={wsConnected ? "text-emerald-400" : "text-red-400"}>
                  {wsConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
              <div className="space-y-1 pt-2">
                <div className="flex justify-between text-[10px] text-neutral-500">
                  <span>Confidence Threshold</span>
                  <span>94%</span>
                </div>
                <div className="w-full bg-neutral-950 rounded-full h-1.5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "94%" }}
                    className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full"
                  />
                </div>
              </div>
            </div>

          </div>

        </div>

      </main>
    </div>
  )
}
