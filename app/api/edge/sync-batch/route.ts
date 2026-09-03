import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { PrismaClient, SlotStatus } from "@prisma/client"

const prisma = new PrismaClient()

const batchSyncSchema = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      slotId: z.string(),
      state: z.number().int().min(0).max(1),
      timestamp: z.string(),
    })
  ).max(100), // Maximum 100 events per batch
})

/**
 * POST /api/edge/sync-batch
 * REST endpoint processing batch payloads up to 100 queued events
 * Atomic database transaction updating slot state only if event timestamp is newer
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = batchSyncSchema.parse(body)

    const { events } = validated

    if (events.length === 0) {
      return NextResponse.json({
        success: true,
        syncedCount: 0,
        failedCount: 0,
        message: "No events to sync",
      })
    }

    console.log(`Processing batch sync with ${events.length} events`)

    // Process events in atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      let syncedCount = 0
      let failedCount = 0
      const errors: string[] = []

      for (const event of events) {
        try {
          const eventTimestamp = new Date(event.timestamp)

          // Get current slot state
          const slot = await tx.slot.findUnique({
            where: { id: event.slotId },
            select: {
              id: true,
              status: true,
              updatedAt: true,
            },
          })

          if (!slot) {
            errors.push(`Slot ${event.slotId} not found`)
            failedCount++
            continue
          }

          // Only update if event timestamp is newer than stored timestamp
          if (eventTimestamp > slot.updatedAt) {
            // Update slot state
            const newStatus = event.state === 1 ? SlotStatus.OCCUPIED : SlotStatus.AVAILABLE

            await tx.slot.update({
              where: { id: event.slotId },
              data: {
                status: newStatus,
                updatedAt: eventTimestamp,
              },
            })

            syncedCount++
            console.log(`Updated slot ${event.slotId} to ${newStatus} at ${eventTimestamp}`)
          } else {
            // Event is older than current state, skip
            console.log(`Skipping old event for slot ${event.slotId} (event: ${eventTimestamp}, current: ${slot.updatedAt})`)
            syncedCount++ // Count as synced but no update needed
          }
        } catch (error: any) {
          console.error(`Error processing event ${event.id}:`, error)
          errors.push(`Event ${event.id}: ${error.message}`)
          failedCount++
        }
      }

      return {
        syncedCount,
        failedCount,
        errors,
      }
    })

    return NextResponse.json({
      success: true,
      syncedCount: result.syncedCount,
      failedCount: result.failedCount,
      errors: result.errors,
      message: `Processed ${events.length} events: ${result.syncedCount} synced, ${result.failedCount} failed`,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request payload", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Batch sync error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}