/**
 * Socket.IO Server for Real-time Slot State Changes
 * Handles WebSocket connections and broadcasts for slot state updates
 */

import { Server as SocketIOServer, Socket } from "socket.io"
import { createServer } from "http"
import { PrismaClient, SlotStatus } from "@prisma/client"

const prisma = new PrismaClient()

// Socket.IO server instance
let io: SocketIOServer | null = null

// Room management for lot-specific subscriptions
const lotRooms = new Map<string, Set<string>>()

/**
 * Initialize Socket.IO server
 */
export function initializeSocketIOServer(port: number = 3001): SocketIOServer {
  if (io) {
    console.log("✅ Socket.IO server already initialized")
    return io
  }

  const httpServer = createServer()
  
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" 
        ? process.env.ALLOWED_ORIGINS?.split(",") || ["https://slots.com"]
        : ["http://localhost:3000", "http://localhost:3001"],
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  })

  // Connection handling
  io.on("connection", (socket: Socket) => {
    console.log(`🔌 Socket.IO client connected: ${socket.id}`)

    // Handle lot subscription
    socket.on("subscribe:lot", (lotId: string) => {
      socket.join(`lot:${lotId}`)
      
      if (!lotRooms.has(lotId)) {
        lotRooms.set(lotId, new Set())
      }
      lotRooms.get(lotId)!.add(socket.id)
      
      console.log(`✅ Socket ${socket.id} subscribed to lot ${lotId}`)
      
      // Send confirmation
      socket.emit("subscribed", { lotId, message: `Subscribed to lot ${lotId}` })
    })

    // Handle lot unsubscription
    socket.on("unsubscribe:lot", (lotId: string) => {
      socket.leave(`lot:${lotId}`)
      
      const room = lotRooms.get(lotId)
      if (room) {
        room.delete(socket.id)
        if (room.size === 0) {
          lotRooms.delete(lotId)
        }
      }
      
      console.log(`🔌 Socket ${socket.id} unsubscribed from lot ${lotId}`)
      
      // Send confirmation
      socket.emit("unsubscribed", { lotId, message: `Unsubscribed from lot ${lotId}` })
    })

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`🔌 Socket.IO client disconnected: ${socket.id}`)
      
      // Clean up from all lot rooms
      lotRooms.forEach((sockets, lotId) => {
        sockets.delete(socket.id)
        if (sockets.size === 0) {
          lotRooms.delete(lotId)
        }
      })
    })

    // Handle errors
    socket.on("error", (error) => {
      console.error(`❌ Socket.IO error for ${socket.id}:`, error)
    })
  })

  // Start HTTP server
  httpServer.listen(port, () => {
    console.log(`🚀 Socket.IO server listening on port ${port}`)
  })

  return io
}

/**
 * Broadcast slot state change to specific lot subscribers
 */
export function broadcastSlotStateChange(data: {
  lotId: string
  slotId: string
  slotNumber: number
  oldStatus: SlotStatus
  newStatus: SlotStatus
  confidence?: number
  source: string
  timestamp: Date
}): void {
  if (!io) {
    console.warn("⚠️ Socket.IO server not initialized, cannot broadcast slot state change")
    return
  }

  const room = `lot:${data.lotId}`
  const broadcastData = {
    type: "SLOT_STATE_CHANGE",
    ...data,
    timestamp: data.timestamp.toISOString(),
  }

  io.to(room).emit("slot_state_change", broadcastData)
  console.log(`📡 Slot state change broadcast to lot ${data.lotId}: slot ${data.slotNumber} -> ${data.newStatus}`)
}

/**
 * Broadcast bulk slot state changes to specific lot subscribers
 */
export function broadcastBulkSlotStateChanges(lotId: string, changes: any[]): void {
  if (!io) {
    console.warn("⚠️ Socket.IO server not initialized, cannot broadcast bulk slot state changes")
    return
  }

  const room = `lot:${lotId}`
  const broadcastData = {
    type: "BULK_SLOT_STATE_CHANGE",
    lotId,
    changes: changes.map(change => ({
      ...change,
      timestamp: change.timestamp ? change.timestamp.toISOString() : new Date().toISOString(),
    })),
    timestamp: new Date().toISOString(),
  }

  io.to(room).emit("bulk_slot_state_change", broadcastData)
  console.log(`📡 Bulk slot state changes broadcast to lot ${lotId}: ${changes.length} changes`)
}

/**
 * Broadcast compliance violation alert to lot subscribers
 */
export function broadcastComplianceViolation(data: {
  lotId: string
  slotId: string
  violationType: string
  severity: string
  vehiclePlateNumber?: string
  timestamp: Date
}): void {
  if (!io) {
    console.warn("⚠️ Socket.IO server not initialized, cannot broadcast compliance violation")
    return
  }

  const room = `lot:${data.lotId}`
  const broadcastData = {
    type: "COMPLIANCE_VIOLATION",
    ...data,
    timestamp: data.timestamp.toISOString(),
  }

  io.to(room).emit("compliance_violation", broadcastData)
  console.log(`📡 Compliance violation broadcast to lot ${data.lotId}: ${data.violationType} on slot ${data.slotId}`)
}

/**
 * Get Socket.IO server instance
 */
export function getSocketIOServer(): SocketIOServer | null {
  return io
}

/**
 * Get number of connected clients for a specific lot
 */
export function getLotConnectionCount(lotId: string): number {
  return lotRooms.get(lotId)?.size || 0
}

/**
 * Get total number of connected clients
 */
export function getTotalConnectionCount(): number {
  if (!io) return 0
  return io.sockets.sockets.size
}

/**
 * Shutdown Socket.IO server
 */
export function shutdownSocketIOServer(): void {
  if (io) {
    io.close()
    io = null
    lotRooms.clear()
    console.log("🛑 Socket.IO server shut down")
  }
}