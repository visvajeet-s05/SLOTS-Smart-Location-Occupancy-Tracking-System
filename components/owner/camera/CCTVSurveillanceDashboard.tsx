"use client"

import { useState, useEffect, useRef } from "react"
import { 
  Camera, 
  Monitor, 
  Activity, 
  Grid3x3, 
  Grid2x2, 
  Maximize2,
  Zap,
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  Wifi,
  WifiOff
} from "lucide-react"
import { io, Socket } from "socket.io-client"

interface CCTVSurveillanceDashboardProps {
  parkingLotId: string
}

interface CameraFeed {
  id: string
  bayId: string
  status: "OCCUPIED" | "AVAILABLE" | "RESERVED"
  plateNumber?: string
  confidence: number
  fps: number
  resolution: string
}

interface NeuralEvent {
  id: string
  timestamp: Date
  bayId: string
  event: "VEHICLE_DETECTED" | "VEHICLE_EXITED" | "PLATE_RECOGNIZED" | "ANOMALY_DETECTED"
  confidence: number
  details: string
}

interface BayStatusChangedEvent {
  site_id: string
  bay_id: string
  status: string
  plate_number?: string
  confidence: number
  timestamp: string
}

interface NeuralEventLogEvent {
  site_id: string
  bay_id: string
  event_type: string
  confidence: number
  plate_number?: string
  timestamp: string
}

export default function CCTVSurveillanceDashboard({ parkingLotId }: CCTVSurveillanceDashboardProps) {
  const [layoutMode, setLayoutMode] = useState<"2x2" | "3x3" | "1-up">("2x2")
  const [systemLatency, setSystemLatency] = useState(12)
  const [selectedBay, setSelectedBay] = useState<string>("BAY-A-101")
  const [cameraFeeds, setCameraFeeds] = useState<CameraFeed[]>([])
  const [neuralEvents, setNeuralEvents] = useState<NeuralEvent[]>([])
  const [isOnline, setIsOnline] = useState(true)
  const [socketConnected, setSocketConnected] = useState(false)
  
  const socketRef = useRef<Socket | null>(null)

  // Initialize camera feeds
  useEffect(() => {
    const initialFeeds: CameraFeed[] = Array.from({ length: 9 }, (_, i) => ({
      id: `CAM-${String(i + 1).padStart(2, '0')}`,
      bayId: `BAY-A-${String(i + 1).padStart(3, '0')}`,
      status: "AVAILABLE",
      confidence: 0,
      fps: 30,
      resolution: "4K"
    }))
    setCameraFeeds(initialFeeds)
  }, [])

  // WebSocket connection
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4001'
    
    socketRef.current = io(socketUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    })

    socketRef.current.on('connect', () => {
      console.log('📡 Connected to telemetry gateway')
      setSocketConnected(true)
      // Subscribe to site updates (both formats for compatibility)
      socketRef.current?.emit('subscribe_site', parkingLotId)
      socketRef.current?.emit('subscribe_site', `site:${parkingLotId}`)
    })

    socketRef.current.on('disconnect', () => {
      console.log('📴 Disconnected from telemetry gateway')
      setSocketConnected(false)
    })

    socketRef.current.on('bay_status_changed', (data: BayStatusChangedEvent) => {
      console.log('📨 Bay status changed:', data)
      
      // Update camera feed
      setCameraFeeds(prev => prev.map(feed => {
        if (feed.bayId === data.bay_id) {
          return {
            ...feed,
            status: data.status as "OCCUPIED" | "AVAILABLE" | "RESERVED",
            plateNumber: data.plate_number,
            confidence: data.confidence
          }
        }
        return feed
      }))

      // Update system latency
      setSystemLatency(Math.floor(Math.random() * 8) + 10)
    })

    socketRef.current.on('neural_event_log', (data: NeuralEventLogEvent) => {
      console.log('📨 Neural event log:', data)
      
      const newEvent: NeuralEvent = {
        id: `EVT-${Date.now()}`,
        timestamp: new Date(data.timestamp),
        bayId: data.bay_id,
        event: data.event_type as NeuralEvent["event"],
        confidence: data.confidence,
        details: data.plate_number || "No plate detected"
      }
      
      setNeuralEvents(prev => [newEvent, ...prev].slice(0, 20))
    })

    return () => {
      socketRef.current?.emit('unsubscribe_site', parkingLotId)
      socketRef.current?.disconnect()
    }
  }, [parkingLotId])

  // Simulate random updates when not connected (fallback mode)
  useEffect(() => {
    if (socketConnected) return

    const interval = setInterval(() => {
      setSystemLatency(10 + Math.floor(Math.random() * 8))
      
      // Update random camera feed
      setCameraFeeds(prev => prev.map(feed => {
        if (Math.random() > 0.95) {
          return {
            ...feed,
            status: feed.status === "OCCUPIED" ? "AVAILABLE" : "OCCUPIED",
            plateNumber: feed.status === "AVAILABLE" ? 
              `TN-${Math.floor(Math.random() * 99)}-AB-${Math.floor(Math.random() * 9999)}` : undefined,
            confidence: Math.floor(Math.random() * 15) + 85,
            fps: Math.floor(Math.random() * 10) + 25
          }
        }
        return feed
      }))

      // Add neural events
      if (Math.random() > 0.7) {
        const eventTypes: NeuralEvent["event"][] = ["VEHICLE_DETECTED", "VEHICLE_EXITED", "PLATE_RECOGNIZED", "ANOMALY_DETECTED"]
        const randomFeed = cameraFeeds[Math.floor(Math.random() * cameraFeeds.length)]
        const newEvent: NeuralEvent = {
          id: `EVT-${Date.now()}`,
          timestamp: new Date(),
          bayId: randomFeed?.bayId || "UNKNOWN",
          event: eventTypes[Math.floor(Math.random() * eventTypes.length)],
          confidence: Math.floor(Math.random() * 20) + 80,
          details: randomFeed?.plateNumber || "No plate detected"
        }
        setNeuralEvents(prev => [newEvent, ...prev].slice(0, 20))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [socketConnected, cameraFeeds])

  const renderGrid = () => {
    const gridSize = layoutMode === "2x2" ? 4 : layoutMode === "3x3" ? 9 : 1
    const feedsToRender = layoutMode === "1-up" ? 
      cameraFeeds.filter(f => f.bayId === selectedBay) : 
      cameraFeeds.slice(0, gridSize)

    return (
      <div className={`grid gap-2 ${
        layoutMode === "2x2" ? "grid-cols-2 grid-rows-2" :
        layoutMode === "3x3" ? "grid-cols-3 grid-rows-3" :
        "grid-cols-1"
      }`}>
        {feedsToRender.map(feed => (
          <div 
            key={feed.id}
            className="relative bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden group"
          >
            {/* Video Feed Canvas Placeholder */}
            <div className="relative aspect-video bg-neutral-950">
              {/* Simulated video feed with AI overlays */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Camera className="w-12 h-12 text-neutral-700 mx-auto mb-2" />
                  <p className="text-neutral-600 text-sm">
                    {socketConnected ? 'Live Feed' : 'Simulated Feed'}
                  </p>
                  {!socketConnected && (
                    <p className="text-neutral-700 text-xs mt-1">Demo Mode</p>
                  )}
                </div>
              </div>

              {/* AI Bounding Box Overlay */}
              {feed.status === "OCCUPIED" && (
                <div className="absolute inset-4 border-2 border-cyan-500/50 rounded bg-cyan-500/10">
                  <div className="absolute -top-6 left-0 bg-cyan-500 text-black text-xs font-bold px-2 py-0.5 rounded">
                    {feed.plateNumber} • {feed.confidence}%
                  </div>
                </div>
              )}

              {/* Top bar overlay */}
              <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-2">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-300 text-xs font-mono">{feed.id}</span>
                  <span className="text-neutral-400 text-xs font-mono">{feed.bayId}</span>
                  <span className="text-emerald-400 text-xs font-mono">{feed.fps} FPS</span>
                </div>
              </div>

              {/* Bottom bar overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <div className="flex justify-between items-center">
                  <div className={`px-2 py-0.5 rounded text-xs font-bold ${
                    feed.status === "OCCUPIED" ? "bg-red-500/20 text-red-400" :
                    feed.status === "AVAILABLE" ? "bg-emerald-500/20 text-emerald-400" :
                    "bg-amber-500/20 text-amber-400"
                  }`}>
                    {feed.status}
                  </div>
                  <button 
                    onClick={() => { setSelectedBay(feed.bayId); setLayoutMode("1-up") }}
                    className="text-cyan-400 text-xs hover:text-cyan-300 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Header Telemetry Strip */}
      <header className="flex-none border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Logo + Title + Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Monitor className="w-6 h-6 text-cyan-400" />
              <div>
                <h1 className="text-lg font-bold tracking-wide">SLOTS OPTIC CONTROL</h1>
                <p className="text-xs text-neutral-500">AI-Powered Surveillance Matrix</p>
              </div>
            </div>
            
            {/* Live Status Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-xs font-bold text-emerald-400">
                {isOnline ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}
              </span>
              <span className="text-neutral-500">|</span>
              <span className="text-xs font-mono text-neutral-400">{systemLatency}ms LATENCY</span>
              <span className="text-neutral-500">|</span>
              <div className="flex items-center gap-1">
                {socketConnected ? (
                  <Wifi className="w-3 h-3 text-cyan-400" />
                ) : (
                  <WifiOff className="w-3 h-3 text-amber-400" />
                )}
                <span className={`text-xs font-mono ${socketConnected ? 'text-cyan-400' : 'text-amber-400'}`}>
                  {socketConnected ? 'LIVE' : 'DEMO'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Matrix View Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 font-medium mr-2">VIEW MODE</span>
            {(["2x2", "3x3", "1-up"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setLayoutMode(mode)}
                className={`p-2 rounded-lg transition-all ${
                  layoutMode === mode 
                    ? 'bg-cyan-500 text-black' 
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                }`}
              >
                {mode === "2x2" && <Grid2x2 className="w-4 h-4" />}
                {mode === "3x3" && <Grid3x3 className="w-4 h-4" />}
                {mode === "1-up" && <Maximize2 className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Camera Grid Matrix (75%) */}
        <div className="flex-1 p-4 overflow-hidden">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-neutral-400 flex items-center gap-2">
                <Camera className="w-4 h-4" />
                {socketConnected ? 'LIVE CAMERA MATRIX' : 'DEMO CAMERA MATRIX'}
              </h2>
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Activity className="w-3 h-3" />
                <span>YOLOv8 + PaddleOCR</span>
                {!socketConnected && <span className="text-amber-400">(Simulation Mode)</span>}
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {renderGrid()}
            </div>
          </div>
        </div>

        {/* Right Panel: Telemetry & Event Sidebar (25%) */}
        <div className="w-80 border-l border-neutral-800 bg-neutral-900/30 flex flex-col">
          {/* Top Card: Stream Topology */}
          <div className="p-4 border-b border-neutral-800">
            <h3 className="text-xs font-bold text-neutral-400 mb-3 flex items-center gap-2">
              <Monitor className="w-3 h-3" />
              STREAM TOPOLOGY
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-500">Selected Bay</span>
                <span className="text-cyan-400 font-mono">{selectedBay}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-500">Resolution</span>
                <span className="text-neutral-300 font-mono">4K</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-500">Codec</span>
                <span className="text-neutral-300 font-mono">H.265</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-500">Engine</span>
                <span className="text-emerald-400 font-mono">YOLOv8 + PaddleOCR</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-500">Data Source</span>
                <span className={`font-mono ${socketConnected ? 'text-cyan-400' : 'text-amber-400'}`}>
                  {socketConnected ? 'REAL-TIME' : 'SIMULATED'}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Container: Neural Event Log */}
          <div className="flex-1 p-4 overflow-hidden flex flex-col">
            <h3 className="text-xs font-bold text-neutral-400 mb-3 flex items-center gap-2">
              <Zap className="w-3 h-3" />
              NEURAL EVENT LOG
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2">
              {neuralEvents.map(event => (
                <div 
                  key={event.id}
                  className="p-2 rounded bg-neutral-800/50 border border-neutral-700 text-xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-neutral-400 font-mono">
                      {event.timestamp.toLocaleTimeString()}
                    </span>
                    <div className="flex items-center gap-1">
                      {event.event === "ANOMALY_DETECTED" ? (
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                      ) : (
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                      )}
                      <span className="text-neutral-500">{event.confidence}%</span>
                    </div>
                  </div>
                  <div className="text-neutral-300">{event.event.replace(/_/g, ' ')}</div>
                  <div className="text-neutral-500 text-[10px] mt-1">
                    {event.bayId} • {event.details}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}