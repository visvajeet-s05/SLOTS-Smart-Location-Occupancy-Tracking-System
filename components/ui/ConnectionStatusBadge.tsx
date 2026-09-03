"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"

/**
 * Connection Status Badge
 * Warns operators and users when live data streams drop
 */
export function ConnectionStatusBadge() {
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "degraded" | "offline">("connected")
  const [lastHeartbeat, setLastHeartbeat] = useState<number>(Date.now())
  const [lagSeconds, setLagSeconds] = useState<number>(0)

  useEffect(() => {
    // Simulate WebSocket heartbeat monitoring
    const interval = setInterval(() => {
      const now = Date.now()
      const timeSinceLastHeartbeat = (now - lastHeartbeat) / 1000
      setLagSeconds(timeSinceLastHeartbeat)

      if (timeSinceLastHeartbeat > 10) {
        setConnectionStatus("offline")
      } else if (timeSinceLastHeartbeat > 5) {
        setConnectionStatus("degraded")
      } else {
        setConnectionStatus("connected")
      }
    }, 1000)

    // Simulate heartbeat updates
    const heartbeatInterval = setInterval(() => {
      // Random heartbeat delay simulation
      if (Math.random() > 0.9) {
        setLastHeartbeat(Date.now())
      }
    }, 3000)

    return () => {
      clearInterval(interval)
      clearInterval(heartbeatInterval)
    }
  }, [lastHeartbeat])

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "bg-green-500"
      case "degraded":
        return "bg-yellow-500"
      case "offline":
        return "bg-red-500"
    }
  }

  const getStatusText = () => {
    switch (connectionStatus) {
      case "connected":
        return "Connected"
      case "degraded":
        return "Reconnecting..."
      case "offline":
        return "Offline"
    }
  }

  const getWarningMessage = () => {
    if (connectionStatus === "degraded") {
      return "Reconnecting live video feed..."
    }
    if (connectionStatus === "offline") {
      return "Edge controller operating offline"
    }
    return null
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`} />
      <Badge variant={connectionStatus === "connected" ? "default" : "destructive"}>
        {getStatusText()}
      </Badge>
      {getWarningMessage() && (
        <span className="text-sm text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
          {getWarningMessage()}
        </span>
      )}
      {lagSeconds > 0 && (
        <span className="text-xs text-gray-500">
          {lagSeconds.toFixed(1)}s lag
        </span>
      )}
    </div>
  )
}