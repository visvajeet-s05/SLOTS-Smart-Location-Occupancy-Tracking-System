/**
 * Staleness Badge Component
 * Real-time UI indicator for edge device connection status
 * Displays visual alerts when slot availability relies on cached data
 */

import React from "react"
import { ConnectionStatus, ConnectionState } from "@/hooks/use-lot-connection"

interface StalenessBadgeProps {
  connectionState: ConnectionState
  size?: "sm" | "md" | "lg"
  showTooltip?: boolean
  className?: string
}

/**
 * Staleness Badge Component
 * Dynamic UI badge with visual status indicators
 */
export function StalenessBadge({
  connectionState,
  size = "md",
  showTooltip = true,
  className = "",
}: StalenessBadgeProps) {
  const { status, lastSyncTime, stalenessSeconds, sensorId } = connectionState

  const sizeClasses = {
    sm: "text-xs px-2 py-1",
    md: "text-sm px-3 py-1.5",
    lg: "text-base px-4 py-2",
  }

  const dotSize = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  }

  const renderBadge = () => {
    switch (status) {
      case ConnectionStatus.LIVE:
        return (
          <div className="inline-flex items-center gap-2">
            <div className={`relative ${dotSize[size]}`}>
              <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
              <div className="relative rounded-full bg-green-500" />
            </div>
            <span className="text-green-600 font-medium">Live</span>
          </div>
        )

      case ConnectionStatus.STALE:
        return (
          <div className="inline-flex items-center gap-2">
            <div className={`${dotSize[size]} rounded-full bg-amber-500`} />
            <span className="text-amber-600 font-medium">
              Cached Data - {stalenessSeconds}s ago
            </span>
          </div>
        )

      case ConnectionStatus.OFFLINE:
        return (
          <div className="inline-flex items-center gap-2">
            <div className={`${dotSize[size]} rounded-full bg-red-500`} />
            <span className="text-red-600 font-medium">Edge Node Disconnected</span>
          </div>
        )

      default:
        return null
    }
  }

  const formatTimestamp = (date: Date | null) => {
    if (!date) return "Never"
    return new Date(date).toLocaleString()
  }

  const tooltipContent = (
    <div className="px-3 py-2 text-xs bg-gray-900 text-white rounded shadow-lg">
      <div className="font-semibold mb-1">Connection Status</div>
      <div className="space-y-1">
        <div>
          <span className="text-gray-400">Status:</span>{" "}
          <span className="font-medium">{status}</span>
        </div>
        {lastSyncTime && (
          <div>
            <span className="text-gray-400">Last Sync:</span>{" "}
            <span className="font-medium">{formatTimestamp(lastSyncTime)}</span>
          </div>
        )}
        {sensorId && (
          <div>
            <span className="text-gray-400">Sensor ID:</span>{" "}
            <span className="font-medium">{sensorId}</span>
          </div>
        )}
        {status === ConnectionStatus.STALE && (
          <div>
            <span className="text-gray-400">Staleness:</span>{" "}
            <span className="font-medium">{stalenessSeconds}s</span>
          </div>
        )}
      </div>
    </div>
  )

  if (!showTooltip) {
    return (
      <div className={`inline-flex items-center ${sizeClasses[size]} ${className}`}>
        {renderBadge()}
      </div>
    )
  }

  return (
    <div className={`inline-flex items-center ${sizeClasses[size]} ${className} group relative`}>
      {renderBadge()}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
        {tooltipContent}
      </div>
    </div>
  )
}

/**
 * Minimal Staleness Badge (without tooltip)
 */
export function MinimalStalenessBadge({
  connectionState,
  size = "md",
  className = "",
}: Omit<StalenessBadgeProps, "showTooltip">) {
  const { status } = connectionState

  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  }

  const getColor = () => {
    switch (status) {
      case ConnectionStatus.LIVE:
        return "bg-green-500"
      case ConnectionStatus.STALE:
        return "bg-amber-500"
      case ConnectionStatus.OFFLINE:
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const getPulseAnimation = () => {
    return status === ConnectionStatus.LIVE ? "animate-ping" : ""
  }

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {status === ConnectionStatus.LIVE && (
        <div className={`absolute inset-0 rounded-full ${getColor()} ${getPulseAnimation()} opacity-75`} />
      )}
      <div className={`relative rounded-full ${getColor()}`} />
    </div>
  )
}

/**
 * Staleness Banner (full-width banner for offline state)
 */
export function StalenessBanner({
  connectionState,
  className = "",
}: {
  connectionState: ConnectionState
  className?: string
}) {
  const { status, stalenessSeconds } = connectionState

  if (status === ConnectionStatus.LIVE) {
    return null
  }

  const bannerStyles = {
    [ConnectionStatus.STALE]: "bg-amber-50 border-amber-200 text-amber-800",
    [ConnectionStatus.OFFLINE]: "bg-red-50 border-red-200 text-red-800",
  }

  const messages = {
    [ConnectionStatus.STALE]: `Displaying cached data from ${stalenessSeconds}s ago. Real-time updates unavailable.`,
    [ConnectionStatus.OFFLINE]: "Edge node disconnected. Data may be outdated. Please refresh to reconnect.",
  }

  return (
    <div className={`w-full px-4 py-3 border rounded-md ${bannerStyles[status]} ${className}`}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-current" />
        <span className="text-sm font-medium">{messages[status]}</span>
      </div>
    </div>
  )
}