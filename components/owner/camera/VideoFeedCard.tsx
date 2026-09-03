"use client"

import { useState } from "react"
import { Maximize2, Radio, Video, AlertCircle } from "lucide-react"
import type { CameraFeed, Detection } from "./types"

interface VideoFeedCardProps {
  camera: CameraFeed
  slots?: Record<string, any>
  expanded?: boolean
  onExpand?: (camId: string) => void
}

const DETECTION_COLORS: Record<Detection["label"], string> = {
  CAR: "border-cyan-400",
  TRUCK: "border-amber-400",
  MOTORCYCLE: "border-emerald-400",
  BUS: "border-indigo-400",
  PEDESTRIAN: "border-rose-400",
}

const DETECTION_TEXT: Record<Detection["label"], string> = {
  CAR: "text-cyan-300",
  TRUCK: "text-amber-300",
  MOTORCYCLE: "text-emerald-300",
  BUS: "text-indigo-300",
  PEDESTRIAN: "text-rose-300",
}

const STATUS_COLOR: Record<string, string> = {
  OCCUPIED: "bg-red-400",
  RESERVED: "bg-amber-400",
  DISABLED: "bg-neutral-600",
  CLOSED: "bg-gray-500",
  AVAILABLE: "bg-emerald-400",
}

export default function VideoFeedCard({ camera, slots, expanded = false, onExpand }: VideoFeedCardProps) {
  const [hovered, setHovered] = useState(false)
  const [imgError, setImgError] = useState(false)
  const occupancyPct = Math.round((camera.occupied / camera.capacity) * 100)
  const isFull = camera.occupied >= camera.capacity
  const hasWebcam = !!camera.ipWebcamUrl && !imgError

  // Build slot status summary for this camera
  const slotStatusSummary = camera.coveredSlots && slots
    ? (() => {
        const summary: Record<string, number> = {}
        camera.coveredSlots.slice(0, 12).forEach((slotKey) => {
          const slot = slots?.[slotKey]
          const status = slot?.status || "AVAILABLE"
          summary[status] = (summary[status] || 0) + 1
        })
        return summary
      })()
    : null

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 transition-all duration-300 ${
        hovered ? "border-cyan-500/60 shadow-[0_0_24px_rgba(6,182,212,0.15)]" : "hover:border-neutral-700"
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="region"
      aria-label={`${camera.name} live feed`}
    >
      {/* Feed Canvas */}
      <div className="relative flex-1 min-h-0 bg-[#0a0a0a] overflow-hidden">
        {camera.ipWebcamUrl && !imgError ? (
          <>
            <img
              src={camera.ipWebcamUrl}
              alt={`${camera.name} live feed`}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-center">
              <span className="text-[8px] font-mono text-emerald-300">
                IP WEBCAM LIVE STREAM
              </span>
            </div>
          </>
        ) : (
          <>
            {/* Simulated CCTV background grid */}
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
                backgroundSize: expanded ? "48px 48px" : "32px 32px",
              }}
            />

            {/* Simulated parking lot floor */}
            <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/0 via-neutral-900/40 to-black/80" />

            {/* Simulated lane markings */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 -translate-x-1/2" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10 -translate-y-1/2" />

            {/* Simulated parked vehicle silhouettes */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-3/5 h-2/5">
                <div className="absolute left-[8%] top-[30%] w-[22%] h-[55%] rounded-md bg-gradient-to-br from-neutral-700 to-neutral-800 border border-white/5" />
                <div className="absolute left-[38%] top-[30%] w-[22%] h-[55%] rounded-md bg-gradient-to-br from-neutral-700 to-neutral-800 border border-white/5" />
                <div className="absolute left-[68%] top-[30%] w-[22%] h-[55%] rounded-md bg-gradient-to-br from-neutral-700 to-neutral-800 border border-white/5" />
              </div>
            </div>

            {/* YOLO Detection Bounding Boxes */}
            {camera.detections.map((det) => (
              <div key={det.id} className="absolute" style={{ left: `${det.box.x}%`, top: `${det.box.y}%`, width: `${det.box.w}%`, height: `${det.box.h}%` }}>
                <div className={`absolute inset-0 border-2 ${DETECTION_COLORS[det.label]} rounded-sm`}>
                  <span className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-white/80" />
                  <span className="absolute -top-px -right-px w-2 h-2 border-t-2 border-r-2 border-white/80" />
                  <span className="absolute -bottom-px -left-px w-2 h-2 border-b-2 border-l-2 border-white/80" />
                  <span className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-white/80" />
                </div>

                <div className="absolute -top-5 left-0 flex items-center gap-1 bg-black/80 backdrop-blur-sm px-1.5 py-0.5 rounded-t-sm border border-b-0 border-white/10">
                  <span className={`text-[9px] font-black tracking-wider ${DETECTION_TEXT[det.label]}`}>
                    {det.label}
                  </span>
                  <span className="text-[8px] font-mono text-white/70">
                    {Math.round(det.confidence * 100)}%
                  </span>
                </div>

                {det.plate && (
                  <div className="absolute -bottom-5 left-0 flex items-center gap-1 bg-black/85 backdrop-blur-sm px-1.5 py-0.5 rounded-b-sm border border-t-0 border-white/10">
                    <span className="text-[8px] font-mono font-bold tracking-widest text-emerald-300">
                      {det.plate}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {/* Scan line animation */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent animate-scan-line" />

            {/* REC indicator */}
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-md border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[9px] font-black tracking-widest text-red-400">REC</span>
            </div>
          </>
        )}

        {/* No webcam fallback */}
        {!camera.ipWebcamUrl && !imgError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <CameraIcon className="w-12 h-12 text-neutral-700 mx-auto mb-2" />
              <p className="text-neutral-600 text-sm">No IP Webcam Configured</p>
              <p className="text-neutral-700 text-xs mt-1">Add a stream URL to view live feed</p>
            </div>
          </div>
        )}

        {camera.ipWebcamUrl && imgError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
              <p className="text-neutral-500 text-sm">Stream Unavailable</p>
              <p className="text-neutral-600 text-xs mt-1">Check the IP webcam URL</p>
            </div>
          </div>
        )}

        {/* Center crosshair (simulated mode only) */}
        {!camera.ipWebcamUrl && !imgError && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 opacity-20">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/60 -translate-x-1/2" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/60 -translate-y-1/2" />
          </div>
        )}

        {/* Compact Slot Status Overlay — visible on ALL cameras */}
        {slotStatusSummary && camera.coveredSlots && (
          <div className="absolute bottom-2 left-12 right-2 flex flex-wrap items-center gap-0.5">
            {camera.coveredSlots.slice(0, 12).map((slotKey) => {
               const slot = slots?.[slotKey]
              const status = slot?.status || "AVAILABLE"
              const dotColor = STATUS_COLOR[status] || STATUS_COLOR["AVAILABLE"]
              return (
                <div
                  key={slotKey}
                  className={`w-2.5 h-2.5 rounded-full ${dotColor} border border-black/50`}
                  title={`${slotKey}: ${status}`}
                />
              )
            })}
            <div className="flex items-center gap-1 ml-1.5">
              {Object.entries(slotStatusSummary).map(([status, count]) => {
                const dotColor = STATUS_COLOR[status] || STATUS_COLOR["AVAILABLE"]
                return (
                  <div key={status} className="flex items-center gap-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                    <span className="text-[6px] font-mono text-zinc-500">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Top Info Bar */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-2.5 py-1.5 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-1.5">
          <Video size={11} className="text-cyan-400" />
          <span className="text-[10px] font-black tracking-wider text-white">
            {camera.name}
          </span>
          <span className="text-[9px] font-medium text-neutral-400">• {camera.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400">
            <Radio size={9} />
            {camera.fps} FPS
          </span>
          <span className="text-[9px] font-mono text-neutral-400">{camera.bitrateMbps} Mbps</span>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="relative flex items-center justify-between px-2.5 py-1.5 bg-neutral-950/90 border-t border-neutral-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isFull ? "bg-red-500" : hasWebcam ? "bg-cyan-400" : "bg-emerald-400"} animate-status-pulse`} />
          <span className={`text-[9px] font-bold truncate ${isFull ? "text-red-400" : hasWebcam ? "text-cyan-400" : "text-emerald-400"}`}>
            {isFull ? "FULL" : `${camera.occupied}/${camera.capacity} Filled`}
          </span>
          <span className="hidden sm:inline text-[8px] font-mono text-neutral-500">
            {occupancyPct}% OCC
          </span>
        </div>
        <button
          onClick={() => onExpand?.(camera.id)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-neutral-400 hover:text-cyan-400 hover:bg-white/5 transition-colors pointer-events-auto"
          aria-label={`Expand ${camera.name} feed`}
          title="Expand Feed"
        >
          <Maximize2 size={11} />
          <span className="text-[9px] font-bold hidden sm:inline">EXPAND</span>
        </button>
      </div>
    </div>
  )
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 19V5a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2Z" />
      <path d="M8 9l3 3-3 3" />
      <circle cx="18" cy="14" r="4" />
    </svg>
  )
}