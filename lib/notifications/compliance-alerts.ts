/**
 * Compliance Alert System
 * Handles dispatch of compliance violation alerts via WebSocket and MQTT
 */

import { WebSocket } from "ws"

// Compliance alert types
export type ComplianceAlertType = 
  | "RESERVED_SLOT_VIOLATION" 
  | "PLATE_MISMATCH" 
  | "OVERSTAY_VIOLATION" 
  | "UNAUTHORIZED_ACCESS"

export interface ComplianceAlert {
  type: ComplianceAlertType
  lotId: string
  slotId: string
  vehiclePlateNumber?: string
  expectedPlateNumber?: string
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  timestamp: Date
  metadata?: Record<string, any>
}

// WebSocket client connections by lot ID
const operatorConnections: Map<string, Set<WebSocket>> = new Map()

/**
 * Register an operator WebSocket connection for a specific lot
 */
export function registerOperatorConnection(lotId: string, ws: WebSocket): void {
  if (!operatorConnections.has(lotId)) {
    operatorConnections.set(lotId, new Set())
  }
  operatorConnections.get(lotId)!.add(ws)
  console.log(`✅ Operator registered for lot ${lotId}`)
}

/**
 * Unregister an operator WebSocket connection
 */
export function unregisterOperatorConnection(lotId: string, ws: WebSocket): void {
  const connections = operatorConnections.get(lotId)
  if (connections) {
    connections.delete(ws)
    if (connections.size === 0) {
      operatorConnections.delete(lotId)
    }
  }
}

/**
 * Dispatch compliance alert via WebSocket to operator dashboards
 */
export function dispatchComplianceAlert(alert: ComplianceAlert): void {
  const lotId = alert.lotId
  const connections = operatorConnections.get(lotId)
  
  if (!connections || connections.size === 0) {
    console.log(`⚠️ No operator connections for lot ${lotId}, alert not dispatched via WebSocket`)
    return
  }

  const alertData = JSON.stringify({
    messageType: "COMPLIANCE_VIOLATION",
    ...alert,
    timestamp: alert.timestamp.toISOString(),
  })

  let dispatchedCount = 0
  connections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(alertData)
      dispatchedCount++
    }
  })

  console.log(`📡 Compliance alert dispatched to ${dispatchedCount} operator(s) for lot ${lotId}`)
}

/**
 * Broadcast compliance alert to all operators (global broadcast)
 */
export function broadcastGlobalAlert(alert: ComplianceAlert): void {
  const alertData = JSON.stringify({
    messageType: "GLOBAL_COMPLIANCE_VIOLATION",
    ...alert,
    timestamp: alert.timestamp.toISOString(),
  })

  let dispatchedCount = 0
  operatorConnections.forEach((connections) => {
    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(alertData)
        dispatchedCount++
      }
    })
  })

  console.log(`📡 Global compliance alert dispatched to ${dispatchedCount} operator(s)`)
}

/**
 * Get active operator connection count for a lot
 */
export function getOperatorConnectionCount(lotId: string): number {
  return operatorConnections.get(lotId)?.size || 0
}

/**
 * Get total operator connection count across all lots
 */
export function getTotalOperatorConnectionCount(): number {
  let total = 0
  operatorConnections.forEach((connections) => {
    total += connections.size
  })
  return total
}