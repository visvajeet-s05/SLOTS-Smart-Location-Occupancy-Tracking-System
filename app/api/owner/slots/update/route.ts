import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { slot_status, slot_updatedBy } from "@prisma/client"

// WebSocket server URL
const WS_SERVER = process.env.WS_SERVER_URL || "ws://localhost:4000"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { lotId, slotId, status, confidence = 100 } = body

    // Validate required fields
    if (!lotId || !slotId || !status) {
      return NextResponse.json(
        { error: "Missing required fields: lotId, slotId, status" },
        { status: 400 }
      )
    }

    // Validate status - support all statuses including CLOSED
    const validStatuses = ["AVAILABLE", "OCCUPIED", "RESERVED", "DISABLED", "CLOSED"]
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      )
    }

    // Find the slot and verify it belongs to the specified lot
    const slot = await (prisma as any).slot.findFirst({
      where: { 
        id: slotId,
        lotId: lotId 
      },
      include: { parkinglot: true }
    })

    if (!slot) {
      return NextResponse.json(
        { error: "Slot not found or does not belong to this parking lot" },
        { status: 404 }
      )
    }

    // Store old status for logging
    const oldStatus = slot.status

    // Update slot in database
    const updatedSlot = await (prisma as any).slot.update({
      where: { id: slotId },
      data: {
        status: status as any,
        updatedBy: "OWNER",
        aiConfidence: confidence
      }
    })

    // Create status log entry
    await (prisma as any).slotstatuslog.create({
      data: {
        slotId: slotId,
        oldStatus: oldStatus,
        newStatus: status as any,
        updatedBy: "OWNER",
        aiConfidence: confidence
      }
    })

    // Broadcast update via WebSocket
    try {
      const WebSocket = (await import("ws")).default
      const ws = new WebSocket(WS_SERVER)
      
      ws.on("open", () => {
        ws.send(JSON.stringify({
          type: "SLOT_UPDATE",
          lotId: lotId,
          slotId: slotId,
          status: status,
          confidence: confidence,
          updatedBy: "OWNER",
          oldStatus: oldStatus,
          timestamp: new Date().toISOString()
        }))
        ws.close()
      })

      ws.on("error", (err) => {
        console.error("WebSocket error:", err)
        // Non-critical: DB is already updated
      })
    } catch (wsError) {
      console.error("Failed to push WebSocket update:", wsError)
      // Non-critical: DB is already updated
    }

    return NextResponse.json({
      success: true,
      slot: updatedSlot,
      message: `Slot ${slotId} updated to ${status}`
    })

  } catch (error) {
    console.error("Error updating slot:", error)
    return NextResponse.json(
      { error: "Failed to update slot" },
      { status: 500 }
    )
  }
}
