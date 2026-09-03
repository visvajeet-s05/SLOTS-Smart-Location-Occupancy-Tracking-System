"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import Link from "next/link"
import {
  Camera,
  Grid3x3,
  LayoutGrid,
  Maximize2,
  Monitor,
  Radio,
  Settings2,
  ShieldCheck,
  MapPin,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { useOwnerWS } from "@/components/ws/OwnerWebSocketProvider"
import VideoFeedGrid from "./VideoFeedGrid"
import StreamTopologyCard from "./StreamTopologyCard"
import AIEventLog from "./AIEventLog"
import {
  buildCamerasForLot,
  type CameraFeed,
  type LayoutMode,
  type AIEvent,
  type SlotStatus,
  type ParkingSlot,
  type LotConfig,
} from "./types"
import { PARKING_LOT_DETAILS, getLotIdForOwner } from "@/lib/owner-mapping"

interface CameraSurveillanceHubProps {
  parkingLotId: string
}

const IP_WEBCAM_URL = process.env.NEXT_PUBLIC_CAMERA_STREAM_URL || ""

const LAYOUT_MODES: { mode: LayoutMode; label: string; icon: typeof Grid3x3; hint: string }[] = [
  { mode: "3x3", label: "3x3", icon: Grid3x3, hint: "Nine view" },
  { mode: "4x4", label: "4x4", icon: LayoutGrid, hint: "Sixteen view" },
  { mode: "1UP", label: "1-UP", icon: Maximize2, hint: "Single feed" },
]

const MAX_EVENTS = 60

/** Find lot config by matching API lot name to known mapping */
function findLotConfig(apiLotName?: string, totalSlots?: number): LotConfig {
  if (apiLotName) {
    for (const [key, details] of Object.entries(PARKING_LOT_DETAILS)) {
      if (details.name.toLowerCase() === apiLotName.toLowerCase()) {
        return { id: key, name: details.name, totalSlots: details.totalSlots, location: details.location, price: details.price }
      }
    }
  }
  // Fallback based on URL id or default
  if (totalSlots) {
    return { id: "UNKNOWN", name: "Parking Lot", totalSlots, location: "", price: 0 }
  }
  return { id: "PHOENIX_MARKETCITY", name: "Phoenix Marketcity Parking", totalSlots: 250, location: "Velachery Main Road, Chennai", price: 55 }
}

export default function CameraSurveillanceHub({ parkingLotId }: CameraSurveillanceHubProps) {
  const { isConnected: wsConnected, lastMessage } = useOwnerWS()
  const [cameras, setCameras] = useState<CameraFeed[]>([])
  const [slots, setSlots] = useState<Record<string, ParkingSlot>>({})
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("3x3")
  const [activeCameraId, setActiveCameraId] = useState<string>("")
  const [events, setEvents] = useState<AIEvent[]>([])
  const [latencyMs, setLatencyMs] = useState(12)
  const [lotName, setLotName] = useState<string>("")
  const [streamUrl, setStreamUrl] = useState<string>(IP_WEBCAM_URL)
  const [showConfig, setShowConfig] = useState(false)
  const [customUrl, setCustomUrl] = useState<string>(IP_WEBCAM_URL || "")
   const [isLoading, setIsLoading] = useState(true)
   const eventQueueRef = useRef<AIEvent[]>([])
  const slotsRef = useRef<Record<string, ParkingSlot>>({})
  const hasUserCustomUrl = useRef(false)


  // Fetch initial parking lot + slot data
  useEffect(() => {
    let cancelled = false

    const fetchData = async () => {
      try {
        const response = await fetch(`/api/parking/${parkingLotId}/slots`)
        if (!response.ok) throw new Error(`API returned ${response.status}`)

        const data = await response.json()
        const apiSlots: any[] = data.slots || []
        const apiLot: any = data.lot || {}
        const apiCameraUrl: string | undefined = data.cameraUrl

        if (cancelled) return

        setLotName(apiLot.name || parkingLotId)
        if (apiCameraUrl && !hasUserCustomUrl.current) setStreamUrl(apiCameraUrl)

        // Build slot map from API data
        const slotMap: Record<string, ParkingSlot> = {}
        apiSlots.forEach((s: any) => {
          const slotKey = `${s.row || "A"}${String(s.slotNumber).padStart(2, "0")}`
          slotMap[slotKey] = {
            id: s.id,
            slotNumber: s.slotNumber,
            row: s.row || "A",
            status: s.status as SlotStatus,
            aiConfidence: s.aiConfidence,
            updatedBy: s.updatedBy,
            price: s.price,
          }
        })
        setSlots(slotMap)
        slotsRef.current = slotMap
        const lotConfig = findLotConfig(apiLot.name, apiSlots.length)
        const webcamUrl = apiCameraUrl || IP_WEBCAM_URL || undefined
        const camFeeds = buildCamerasForLot(lotConfig, webcamUrl, apiSlots)

        // Apply real slot statuses to cameras
        const updatedCameras = camFeeds.map((cam) => {
          let occupied = 0
          const coveredSlots = cam.coveredSlots || []
          coveredSlots.forEach((slotKey) => {
            const slot = slotMap[slotKey]
            if (slot && slot.status === "OCCUPIED") occupied++
          })
          return { ...cam, occupied }
        })

        setCameras(updatedCameras.map(cam => ({ ...cam, ipWebcamUrl: streamUrl })))
        if (updatedCameras.length > 0 && !activeCameraId) {
          setActiveCameraId(updatedCameras[0].id)
        }
      } catch (err) {
        console.error("Error fetching parking data:", err)
        // Fallback to default lot config
        const lotConfig = findLotConfig(undefined, undefined)
        const camFeeds = buildCamerasForLot(lotConfig, IP_WEBCAM_URL || undefined)
        setCameras(camFeeds)
        if (camFeeds.length > 0 && !activeCameraId) {
          setActiveCameraId(camFeeds[0].id)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchData()

    return () => {
      cancelled = true
    }
  }, [parkingLotId])

  // Apply stream URL to all cameras whenever it changes
  useEffect(() => {
    setCameras((prev) => prev.map((cam) => ({ ...cam, ipWebcamUrl: streamUrl || undefined })))
  }, [streamUrl])

  // Handle real-time WebSocket updates
  useEffect(() => {
    if (!lastMessage) return

    // Real slot update from telemetry gateway: { lotSlug, slotNumber, status, confidence, source, timestamp }
    if (lastMessage.slotNumber !== undefined && lastMessage.status) {
      const slotNumber: number = lastMessage.slotNumber
      const newStatus: SlotStatus = lastMessage.status as SlotStatus
      const confidence = lastMessage.confidence
      const source = lastMessage.source || lastMessage.updatedBy || "AI"

      // Update slots state
      setSlots((prev) => {
        const next: Record<string, ParkingSlot> = { ...prev }
        for (const key of Object.keys(next)) {
          if (next[key].slotNumber === slotNumber) {
            next[key] = { ...next[key], status: newStatus, aiConfidence: confidence, updatedBy: source as any }
            break
          }
        }
        slotsRef.current = next
        return next
      })

      // Update camera occupancy using ref to get latest slots
      setCameras((prevCameras) => {
        const currentSlots = slotsRef.current
        return prevCameras.map((cam) => {
          if (!cam.coveredSlots) return cam

          // Find which column this updated slot falls into for this camera
          const slotInCam = cam.coveredSlots.find((key) => {
            const s = currentSlots[key]
            return s && s.slotNumber === slotNumber
          })

          if (!slotInCam) return cam

          // Recalculate occupied count for this camera
          let occupied = 0
          cam.coveredSlots.forEach((key) => {
            const s = currentSlots[key]
            if (s && s.status === "OCCUPIED") occupied++
          })
          // Apply the new status for the updated slot
          if (newStatus === "OCCUPIED") occupied++
          else occupied = Math.max(0, occupied - (currentSlots[slotInCam]?.status === "OCCUPIED" ? 1 : 0))

          return { ...cam, occupied }
        })
      })

      // Generate AI event using ref for camera lookup
      const cam = cameras.find((c) =>
        c.coveredSlots?.some((key) => {
          const s = slotsRef.current[key]
          return s && s.slotNumber === slotNumber
        })
      )
      if (cam) {
        const eventType =
          newStatus === "OCCUPIED"
            ? "SLOT_OCCUPIED"
            : newStatus === "AVAILABLE"
            ? "SLOT_RELEASED"
            : "VEHICLE_DETECTED"

        const newEvent: AIEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          camId: cam.name,
          slot: `Slot ${slotNumber}`,
          type: eventType,
          confidence: confidence ? confidence / 100 : 0.95,
          plate: lastMessage.plate,
        }

        eventQueueRef.current = [newEvent, ...eventQueueRef.current].slice(0, MAX_EVENTS)
        setEvents(eventQueueRef.current)
      }

      setLatencyMs(Math.floor(Math.random() * 8) + 10)
    }
  }, [lastMessage, parkingLotId])

  // Sync slotsRef whenever slots state changes
  useEffect(() => {
    // slotsRef is updated inside setSlots, no extra sync needed
  }, [])

  // Simulate low-latency jitter when connected
  useEffect(() => {
    if (!wsConnected) return
    const timer = setInterval(() => {
      setLatencyMs(12 + Math.round((Math.random() - 0.5) * 4))
    }, 1200)
    return () => clearInterval(timer)
  }, [wsConnected])

  const handleExpand = useCallback(
    (camId: string) => {
      setActiveCameraId(camId)
      setLayoutMode("1UP")
    },
    []
  )

  const handlePrevCamera = useCallback(() => {
    if (cameras.length === 0) return
    const currentIdx = cameras.findIndex((c) => c.id === activeCameraId)
    const prevIdx = currentIdx <= 0 ? cameras.length - 1 : currentIdx - 1
    setActiveCameraId(cameras[prevIdx].id)
    setLayoutMode("1UP")
  }, [cameras, activeCameraId])

  const handleNextCamera = useCallback(() => {
    if (cameras.length === 0) return
    const currentIdx = cameras.findIndex((c) => c.id === activeCameraId)
    const nextIdx = currentIdx >= cameras.length - 1 ? 0 : currentIdx + 1
    setActiveCameraId(cameras[nextIdx].id)
    setLayoutMode("1UP")
  }, [cameras, activeCameraId])

  const handleStreamUrlChange = () => {
    if (!customUrl.trim()) return
    hasUserCustomUrl.current = true
    setStreamUrl(customUrl.trim())
    setShowConfig(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleStreamUrlChange()
  }

  const totalSlots = Object.keys(slots).length

  const activeCamera = cameras.find((c) => c.id === activeCameraId)

  return (
    <div
      className="relative flex h-[calc(100vh-5rem)] w-full flex-col overflow-hidden bg-[#050507] text-white selection:bg-cyan-500/20"
      aria-label="SLOTIFY Live AI Camera Surveillance Hub"
    >
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-cyan-900/10 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-900/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.04]" />
      </div>

      {/* ── Header / Control Bar ─────────────────────────────── */}
      <header className="relative z-10 flex shrink-0 flex-col gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 backdrop-blur-md lg:flex-row lg:items-center lg:justify-between">
        {/* Branding + Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
              <Camera size={18} className="text-cyan-400" />
              <span className="absolute inset-0 rounded-lg bg-cyan-500/20 animate-pulse-soft" />
            </div>
            <div className="leading-tight">
              <h1 className="text-sm font-black uppercase tracking-[0.18em] text-white">
                Slots <span className="text-gradient-primary">Optic Hub</span>
              </h1>
              <p className="text-[9px] font-medium uppercase tracking-[0.22em] text-zinc-500">
                {lotName} • Live AI Camera Matrix
              </p>
             </div>
           </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/owner/parking-lots/${parkingLotId}/slots`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/20 text-xs font-semibold transition-all"
              title="Go to Slot Management"
            >
              <Grid3x3 className="w-4 h-4" />
              <span>Slot Management</span>
            </Link>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800/50 border border-neutral-700 text-neutral-400 hover:text-white hover:border-cyan-500/30 transition-all text-xs font-mono"
              title="Configure IP webcam stream URL"
            >
              <Settings2 size={11} />
            </button>
          {LAYOUT_MODES.map(({ mode, label, icon: Icon, hint }) => {
            const active = layoutMode === mode
            return (
              <button
                key={mode}
                onClick={() => setLayoutMode(mode)}
                className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${
                  active
                    ? "bg-cyan-500 text-black shadow-[0_0_16px_rgba(6,182,212,0.35)]"
                    : "text-zinc-400 hover:bg-neutral-700"
                }`}
                aria-pressed={active}
                aria-label={`${hint} layout`}
                title={hint}
              >
                <Icon size={12} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            )
          })}
        </div>
      </header>

      {/* IP Webcam URL Config Panel */}
      {showConfig && (
        <div className="relative z-10 border-b border-neutral-800 bg-neutral-900/80 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-4 max-w-3xl">
            <span className="text-xs font-mono text-neutral-400">IP WEBCAM URL:</span>
            <input
              type="url"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="http://192.168.x.x:8080/video or mjpeg URL"
              className="flex-1 px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-xs font-mono text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={handleStreamUrlChange}
              className="px-3 py-1.5 bg-cyan-500 text-black text-xs font-bold rounded-lg hover:bg-cyan-400 transition-colors"
            >
              APPLY
            </button>
            <button
              onClick={() => { setShowConfig(false); setCustomUrl(IP_WEBCAM_URL || "") }}
              className="px-3 py-1.5 bg-neutral-800 text-neutral-300 text-xs rounded-lg hover:bg-neutral-700 transition-colors"
            >
              CANCEL
            </button>
          </div>
          <div className="mt-2 text-[8px] font-mono text-neutral-600">
            {cameras.length > 0 && `Current: ${cameras[0].ipWebcamUrl || "No stream configured"}`}
          </div>
        </div>
      )}

      {/* ── Main Body: Feed Grid + Telemetry Sidebar ─────────── */}
      <div className="relative z-10 flex min-h-0 flex-1 gap-3 p-3">
        {/* Left: Video Feed Matrix (75-80%) */}
        <section className="flex min-w-0 flex-1 flex-col" aria-label="Live video feed matrix">
          {/* Feed toolbar */}
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio size={12} className="text-emerald-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Live Feed Matrix
              </span>
              <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[9px] font-mono text-zinc-500">
                {layoutMode === "1UP" ? `${activeCameraId} FOCUS` : `${layoutMode} MODE`}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[9px] font-mono text-zinc-600">
              <span className="flex items-center gap-1">
                <MapPin size={10} className="text-cyan-400" />
                <span>{cameras.length} cameras • {totalSlots} slots</span>
              </span>
              {streamUrl && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span>IP WEBCAM ACTIVE</span>
                </span>
              )}
            </div>
          </div>

          {/* The video grid fills remaining vertical space */}
          <div className="min-h-0 flex-1">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
                  <p className="text-neutral-400 text-sm">Loading camera topology...</p>
                </div>
              </div>
            ) : (
              <VideoFeedGrid
                cameras={cameras}
                layoutMode={layoutMode}
                activeCameraId={activeCameraId}
                onExpand={handleExpand}
                slots={slots}
              />
            )}
          </div>
        </section>

        {/* Right: Telemetry Sidebar (20-25%) */}
        <aside className="flex w-[25%] min-w-[280px] max-w-[340px] flex-col gap-3" aria-label="Stream telemetry and AI event log">
          {/* Active Camera Detail */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor size={14} className="text-cyan-400" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Active Camera
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevCamera}
                  disabled={cameras.length <= 1}
                  className="p-1 rounded-lg bg-neutral-800/50 border border-neutral-700 text-neutral-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all disabled:opacity-30"
                  title="Previous camera"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[9px] font-mono text-neutral-500">
                  {cameras.findIndex((c) => c.id === activeCameraId) + 1} / {cameras.length}
                </span>
                <button
                  onClick={handleNextCamera}
                  disabled={cameras.length <= 1}
                  className="p-1 rounded-lg bg-neutral-800/50 border border-neutral-700 text-neutral-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all disabled:opacity-30"
                  title="Next camera"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
            {activeCamera && (
              <>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-500">ID</span>
                    <span className="text-cyan-400 font-mono">{activeCamera.id}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-500">Coverage</span>
                    <span className="text-neutral-300 font-mono">{activeCamera.row}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-500">Label</span>
                    <span className="text-neutral-300 font-mono">{activeCamera.label}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-500">Slots Covered</span>
                    <span className="text-neutral-300 font-mono">{activeCamera.coveredSlots?.length || 0}</span>
                  </div>
                </div>

              </>
            )}
          </div>

          {/* Stream Topology */}
          <StreamTopologyCard latencyMs={latencyMs} />

          {/* AI Event Log — always visible, takes remaining space */}
          <div className="flex-1 min-h-0">
            <AIEventLog events={events} />
          </div>
        </aside>
      </div>

      {/* ── Bottom status strip ──────────────────────────────── */}
      <footer className="relative z-10 flex shrink-0 items-center justify-between border-t border-white/[0.06] bg-white/[0.02] px-4 py-1.5">
        <div className="flex items-center gap-3 text-[9px] font-mono text-zinc-600">
          <ShieldCheck size={11} className="text-emerald-500" />
          <span>ENCRYPTED AES-256</span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">WS RELAY SUBNET 4</span>
          <span className="hidden md:inline">•</span>
          <span className="hidden md:inline">YOLOv8 + PaddleOCR</span>
          <span className="hidden xl:inline">•</span>
          <span className="hidden xl:inline">
            {streamUrl ? "IP WEBCAM MODE" : "SIMULATION MODE"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[9px] font-mono text-zinc-600">
          <Settings2 size={11} className="text-zinc-700" />
          <span>{lotName || parkingLotId.toUpperCase()}</span>
        </div>
      </footer>
    </div>
  )
}
