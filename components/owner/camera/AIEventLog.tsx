"use client"

import { useEffect, useRef, useState } from "react"
import { BrainCircuit, ScrollText, Clock, TrendingUp, AlertTriangle, CheckCircle, Package, DoorOpen } from "lucide-react"
import type { AIEvent } from "./types"

interface AIEventLogProps {
  events: AIEvent[]
}

const TYPE_STYLES: Record<AIEvent["type"], { color: string; label: string; icon: typeof BrainCircuit; borderColor: string }> = {
  VEHICLE_DETECTED: { color: "text-cyan-300", label: "VEHICLE DETECTED", icon: TrendingUp, borderColor: "border-cyan-500/30" },
  PLATE_RECOGNIZED: { color: "text-emerald-300", label: "PLATE RECOGNIZED", icon: CheckCircle, borderColor: "border-emerald-500/30" },
  SLOT_OCCUPIED: { color: "text-amber-300", label: "SLOT OCCUPIED", icon: Package, borderColor: "border-amber-500/30" },
  SLOT_RELEASED: { color: "text-indigo-300", label: "SLOT RELEASED", icon: DoorOpen, borderColor: "border-indigo-500/30" },
  ANOMALY_FLAGGED: { color: "text-rose-400", label: "ANOMALY FLAGGED", icon: AlertTriangle, borderColor: "border-rose-500/30" },
  VEHICLE_EXITED: { color: "text-zinc-300", label: "VEHICLE EXITED", icon: DoorOpen, borderColor: "border-neutral-500/30" },
}

export default function AIEventLog({ events }: AIEventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [events, autoScroll])

  const handleScroll = () => {
    if (!scrollRef.current) return
    const isAtTop = scrollRef.current.scrollTop < 10
    setAutoScroll(isAtTop)
  }

  const visibleEvents = showAll ? events : events.slice(0, 15)

  return (
    <div className="flex flex-col h-full rounded-xl border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-2">
          <BrainCircuit size={14} className="text-cyan-400" />
          <h2 className="text-[11px] font-black uppercase tracking-widest text-zinc-300">
            Real-Time AI Log
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE
          </span>
          {events.length > 15 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className={`text-[8px] font-mono font-bold uppercase transition-colors ${
                showAll ? "text-cyan-400" : "text-neutral-600 hover:text-neutral-400"
              }`}
            >
              {showAll ? "LESS" : `MORE (${events.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Last event highlight */}
      {events.length > 0 && (
        <div className="px-4 py-2 border-b border-neutral-800/60 bg-neutral-950/40 shrink-0">
          <div className="flex items-center gap-2">
            <Clock size={10} className="text-neutral-500" />
            <span className="text-[9px] font-mono text-neutral-500">
              Last event: {events[0].timestamp}
            </span>
          </div>
        </div>
      )}

      {/* Event list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
        role="log"
        aria-live="polite"
        aria-label="Live AI detection events"
      >
        {visibleEvents.length === 0 ? (
          <div className="p-6 text-center">
            <BrainCircuit size={24} className="mx-auto mb-2 text-neutral-700" />
            <p className="text-[9px] text-neutral-600 font-mono">
              Waiting for AI detections...
            </p>
          </div>
        ) : (
          visibleEvents.map((event, idx) => {
            const style = TYPE_STYLES[event.type]
            const Icon = style.icon
            const isLatest = idx === 0
            return (
              <div
                key={event.id}
                className={`px-3 py-2 border-l-2 ${style.borderColor} ${
                  isLatest
                    ? "bg-neutral-800/40"
                    : "hover:bg-white/[0.02]"
                } transition-colors`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Icon size={10} className={style.color} />
                    <span className={`text-[9px] font-bold ${style.color} uppercase tracking-wider min-w-[70px]`}>
                      {style.label}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[8px] font-mono text-neutral-600">
                        [{event.timestamp}]
                      </span>
                      <span className="text-[8px] font-mono text-neutral-500">
                        {event.camId}
                      </span>
                      <span className="text-[8px] font-mono text-neutral-600">
                        Slot {event.slot}
                      </span>
                      {isLatest && (
                        <span className="text-[7px] font-bold text-cyan-400 uppercase tracking-wider">
                          LIVE
                        </span>
                      )}
                    </div>

                    {event.plate && (
                      <p className="text-[8px] font-mono font-bold tracking-widder text-emerald-300 mt-0.5">
                        ┌─ License Plate: {event.plate}
                      </p>
                    )}

                    {event.confidence !== undefined && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="text-[8px] font-mono text-neutral-600">
                          Confidence: {Math.round(event.confidence * 100)}%
                        </span>
                        <div className="flex-1 h-1 rounded-full bg-neutral-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              (event.confidence || 0) > 0.9
                                ? "bg-gradient-to-r from-cyan-400 to-emerald-400"
                                : (event.confidence || 0) > 0.8
                                ? "bg-gradient-to-r from-amber-400 to-yellow-400"
                                : "bg-gradient-to-r from-rose-400 to-red-400"
                            }`}
                            style={{ width: `${Math.round((event.confidence || 0) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer with auto-scroll toggle */}
      <div className="px-3 py-1.5 border-t border-neutral-800/60 bg-neutral-950/40 shrink-0 flex items-center justify-between">
        <span className="text-[8px] font-mono text-zinc-600">
          {events.length} events captured
        </span>
        <button
          onClick={() => setAutoScroll((v) => !v)}
          className={`flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider transition-colors ${
            autoScroll ? "text-cyan-400" : "text-zinc-500 hover:text-zinc-300"
          }`}
          aria-pressed={autoScroll}
        >
          <ScrollText size={10} />
          Auto-Scroll {autoScroll ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  )
}