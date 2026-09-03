"use client"

import type { ReactNode } from "react"
import { Activity, Cpu, Globe, Network, ShieldCheck, Zap } from "lucide-react"

interface StreamTopologyCardProps {
  latencyMs: number
}

export default function StreamTopologyCard({ latencyMs }: StreamTopologyCardProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-cyan-400" />
          <h2 className="text-[11px] font-black uppercase tracking-widest text-zinc-300">
            Stream Topology
          </h2>
        </div>
        <span className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-400 uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live
        </span>
      </div>

      {/* Topology rows */}
      <div className="p-4 space-y-3">
        <TopologyRow icon={<Globe size={12} className="text-cyan-400" />} label="Resolution" value="3840x2160 4K" />
        <TopologyRow icon={<Cpu size={12} className="text-indigo-400" />} label="Codec" value="H.265 / HEVC" />
        <TopologyRow icon={<Activity size={12} className="text-emerald-400" />} label="Relay Gateway" value="WS Relay Subnet 4" />
        <TopologyRow icon={<ShieldCheck size={12} className="text-amber-400" />} label="Core Engine" value="Slotify Vision v4.2" />
        <TopologyRow icon={<Zap size={12} className="text-rose-400" />} label="Latency" value={`${latencyMs}ms`} highlight />
      </div>

      {/* Mini connection stats */}
      <div className="px-4 pb-4">
        <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
              Uplink Health
            </span>
            <span className="text-[9px] font-mono font-bold text-emerald-400">98.7%</span>
          </div>
          <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
            <div className="h-full w-[98.7%] rounded-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-emerald-500" />
          </div>
          <div className="flex items-center justify-between mt-2 text-[8px] font-mono text-zinc-600">
            <span>IN 184 MB/s</span>
            <span>OUT 92 MB/s</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TopologyRow({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: ReactNode
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0">{icon}</span>
        <span className="text-[10px] font-medium text-zinc-500 truncate">{label}</span>
      </div>
      <span
        className={`text-[10px] font-mono font-bold truncate ${
          highlight ? "text-cyan-300" : "text-zinc-200"
        }`}
      >
        {value}
      </span>
    </div>
  )
}