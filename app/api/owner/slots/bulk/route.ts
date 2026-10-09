import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { slot_status, slot_updatedBy } from "@prisma/client"

// WebSocket server URL
const WS_SERVER = process.env.WS_SERVER_URL || "ws://localhost:4000"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { lotId, action, row, status, price } = body

    // Validate required fields
    if (!lotId || !action) {
      return NextResponse.json(
        { error: "Missing required fields: lotId, action" },
        { status: 400 }
      )
    }

    // Validate action
    const validActions = ["OPEN_ALL", "CLOSE_ALL", "OPEN_ROW", "CLOSE_ROW", "MAINTENANCE_ROW", "UPDATE_STATUS", "UPDATE_PRICE"]
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
        { status: 400 }
      )
    }

    // Determine target updates based on action
    let targetStatus: slot_status | undefined
    let targetPrice: number | undefined
    let targetRows: string[] = []

    switch (action) {
      case "OPEN_ALL":
        targetStatus = "AVAILABLE" as slot_status
        break
      case "CLOSE_ALL":
        targetStatus = "CLOSED" as slot_status
        break
      case "OPEN_ROW":
        if (!row) return NextResponse.json({ error: "Row required" }, { status: 400 })
        targetStatus = "AVAILABLE" as slot_status
        targetRows = [row]
        break
      case "CLOSE_ROW":
        if (!row) return NextResponse.json({ error: "Row required" }, { status: 400 })
        targetStatus = "CLOSED" as slot_status
        targetRows = [row]
        break
      case "MAINTENANCE_ROW":
        if (!row) return NextResponse.json({ error: "Row required" }, { status: 400 })
        targetStatus = "DISABLED" as slot_status
        targetRows = [row]
        break
      case "UPDATE_STATUS":
        if (!status) return NextResponse.json({ error: "Status required" }, { status: 400 })
        targetStatus = status as slot_status
        if (row) targetRows = [row]
        break
      case "UPDATE_PRICE":
        if (price === undefined) return NextResponse.json({ error: "Price required" }, { status: 400 })
        targetPrice = parseFloat(price)
        if (isNaN(targetPrice)) return NextResponse.json({ error: "Invalid price" }, { status: 400 })
        if (row) targetRows = [row]
        break
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    // Build where clause
    const whereClause: any = {
      lotId: lotId
    }

    // Only filter RESERVED if we are changing STATUS (to avoid kicking out active users)
    if (targetStatus) {
      whereClause.status = { not: "RESERVED" }
    }

    // Add row filter if specified
    if (targetRows.length > 0) {
      whereClause.row = { in: targetRows }
    }

    // Get slots to update
    const slotsToUpdate = await prisma.slot.findMany({
      where: whereClause
    })

    if (slotsToUpdate.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No slots to update",
        updatedCount: 0
      })
    }

    // Prepare update data
    const updateData: any = {
      updatedBy: "OWNER"
    }
    if (targetStatus) {
      updateData.status = targetStatus
      updateData.aiConfidence = 100
    }
    if (targetPrice !== undefined) {
      updateData.price = targetPrice
    }

    // Update all matching slots
    const updatePromises = slotsToUpdate.map(slot =>
      prisma.slot.update({
        where: { id: slot.id },
        data: updateData
      })
    )

    const updatedSlots = await Promise.all(updatePromises)

    // Create status logs ONLY if status changed
    if (targetStatus) {
      const logPromises = slotsToUpdate.map(slot =>
        (prisma as any).slotstatuslog.create({
          data: {
            slotId: slot.id,
            oldStatus: slot.status,
            newStatus: targetStatus as slot_status,
            updatedBy: "OWNER",
            aiConfidence: 100
          }
        })
      )
      await Promise.all(logPromises)
    }

    // Broadcast updates via WebSocket
    try {
      const WebSocket = (await import("ws")).default
      const ws = new WebSocket(WS_SERVER)

      ws.on("open", () => {
        // Send bulk update notification
        ws.send(JSON.stringify({
          type: "BULK_SLOT_UPDATE",
          lotId: lotId,
          action: action,
          status: targetStatus,
          price: targetPrice,
          updatedCount: updatedSlots.length,
          affectedRows: targetRows,
          timestamp: new Date().toISOString()
        }))

        // Send individual slot updates
        updatedSlots.forEach(slot => {
          ws.send(JSON.stringify({
            type: "SLOT_UPDATE",
            lotId: lotId,
            slotId: slot.id,
            status: slot.status,
            price: slot.price,
            confidence: 100,
            updatedBy: "OWNER",
            timestamp: new Date().toISOString()
          }))
        })

        ws.close()
      })

      ws.on("error", (err) => {
        console.error("WebSocket error:", err)
      })
    } catch (wsError) {
      console.error("Failed to push WebSocket updates:", wsError)
    }

    return NextResponse.json({
      success: true,
      message: `${action} completed successfully`,
      updatedCount: updatedSlots.length,
      status: targetStatus,
      price: targetPrice,
      affectedRows: targetRows.length > 0 ? targetRows : "ALL"
    })

  } catch (error) {
    console.error("Error in bulk slot update:", error)
    return NextResponse.json(
      { error: "Failed to perform bulk update" },
      { status: 500 }
    )
  }
}
