/**
 * Connection & Staleness Hook
 * Tracks WebSocket/SSE edge camera telemetry updates
 * Detects state staleness during camera or network disconnections
 */

import { useState, useEffect, useCallback, useRef } from "react"

export enum ConnectionStatus {
  LIVE = "LIVE",
  STALE = "STALE",
  OFFLINE = "OFFLINE",
}

export interface TelemetryPulse {
  lotId: string
  slotId?: string
  timestamp: Date
  sensorId?: string
}

export interface ConnectionState {
  status: ConnectionStatus
  lastPulse: Date | null
  lastSyncTime: Date | null
  stalenessSeconds: number
  sensorId?: string
}

export interface UseLotConnectionOptions {
  lotId: string
  slotId?: string
  liveThreshold?: number // seconds (default: 15)
  staleThreshold?: number // seconds (default: 60)
  checkInterval?: number // milliseconds (default: 100)
}

/**
 * Connection & Staleness Hook
 * Tracks edge device connectivity and data freshness
 */
export function useLotConnection(options: UseLotConnectionOptions) {
  const {
    lotId,
    slotId,
    liveThreshold = 15,
    staleThreshold = 60,
    checkInterval = 100,
  } = options

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: ConnectionStatus.OFFLINE,
    lastPulse: null,
    lastSyncTime: null,
    stalenessSeconds: 0,
  })

  const lastPulseRef = useRef<Date | null>(null)
  const sensorIdRef = useRef<string | undefined>(undefined)
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * Determine connection status based on staleness
   */
  const determineStatus = useCallback((stalenessSeconds: number): ConnectionStatus => {
    if (stalenessSeconds < liveThreshold) {
      return ConnectionStatus.LIVE
    } else if (stalenessSeconds < staleThreshold) {
      return ConnectionStatus.STALE
    } else {
      return ConnectionStatus.OFFLINE
    }
  }, [liveThreshold, staleThreshold])

  /**
   * Update connection state based on last pulse
   */
  const updateConnectionState = useCallback(() => {
    const lastPulse = lastPulseRef.current
    
    if (!lastPulse) {
      setConnectionState({
        status: ConnectionStatus.OFFLINE,
        lastPulse: null,
        lastSyncTime: null,
        stalenessSeconds: 0,
        sensorId: sensorIdRef.current,
      })
      return
    }

    const now = new Date()
    const stalenessSeconds = Math.floor((now.getTime() - lastPulse.getTime()) / 1000)
    const status = determineStatus(stalenessSeconds)

    setConnectionState({
      status,
      lastPulse,
      lastSyncTime: lastPulse,
      stalenessSeconds,
      sensorId: sensorIdRef.current,
    })
  }, [determineStatus])

  /**
   * Receive telemetry pulse from edge device
   */
  const receivePulse = useCallback((pulse: TelemetryPulse) => {
    // Validate pulse matches our lot/slot
    if (pulse.lotId !== lotId) return
    if (slotId && pulse.slotId !== slotId) return

    lastPulseRef.current = pulse.timestamp
    sensorIdRef.current = pulse.sensorId

    // Immediately update state
    updateConnectionState()
  }, [lotId, slotId, updateConnectionState])

  /**
   * Manually update last pulse timestamp
   */
  const updateLastPulse = useCallback((timestamp: Date, sensorId?: string) => {
    lastPulseRef.current = timestamp
    sensorIdRef.current = sensorId
    updateConnectionState()
  }, [updateConnectionState])

  /**
   * Start periodic connection checks
   */
  const startMonitoring = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current)
    }

    checkIntervalRef.current = setInterval(() => {
      updateConnectionState()
    }, checkInterval)
  }, [checkInterval, updateConnectionState])

  /**
   * Stop periodic connection checks
   */
  const stopMonitoring = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current)
      checkIntervalRef.current = null
    }
  }, [])

  /**
   * Reset connection state
   */
  const reset = useCallback(() => {
    lastPulseRef.current = null
    sensorIdRef.current = undefined
    setConnectionState({
      status: ConnectionStatus.OFFLINE,
      lastPulse: null,
      lastSyncTime: null,
      stalenessSeconds: 0,
    })
  }, [])

  // Start monitoring on mount
  useEffect(() => {
    startMonitoring()

    return () => {
      stopMonitoring()
    }
  }, [startMonitoring, stopMonitoring])

  return {
    ...connectionState,
    receivePulse,
    updateLastPulse,
    startMonitoring,
    stopMonitoring,
    reset,
  }
}

/**
 * Hook for monitoring multiple lots
 */
export function useMultiLotConnection(lotIds: string[], options?: Omit<UseLotConnectionOptions, 'lotId'>) {
  const [connections, setConnections] = useState<Record<string, ConnectionState>>({})

  const receivePulse = useCallback((pulse: TelemetryPulse) => {
    if (!lotIds.includes(pulse.lotId)) return

    setConnections(prev => {
      const lotId = pulse.lotId
      const lastPulse = prev[lotId]?.lastPulse || null
      const newLastPulse = pulse.timestamp

      const stalenessSeconds = lastPulse
        ? Math.floor((new Date().getTime() - newLastPulse.getTime()) / 1000)
        : 0

      const liveThreshold = options?.liveThreshold || 15
      const staleThreshold = options?.staleThreshold || 60

      let status: ConnectionStatus
      if (stalenessSeconds < liveThreshold) {
        status = ConnectionStatus.LIVE
      } else if (stalenessSeconds < staleThreshold) {
        status = ConnectionStatus.STALE
      } else {
        status = ConnectionStatus.OFFLINE
      }

      return {
        ...prev,
        [lotId]: {
          status,
          lastPulse: newLastPulse,
          lastSyncTime: newLastPulse,
          stalenessSeconds,
          sensorId: pulse.sensorId,
        },
      }
    })
  }, [lotIds, options])

  return {
    connections,
    receivePulse,
  }
}