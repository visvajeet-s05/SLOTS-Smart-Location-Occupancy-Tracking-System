import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { processSensorFusion, type SensorInput, type FusionResult } from "@/lib/vision/sensor-fusion"
import { PrismaClient, SlotStatus } from "@prisma/client"

const prisma = new PrismaClient()

const sensorFusionSchema = z.object({
  slotId: z.string(),
  visionConfidence: z.number().min(0).max(1),
  visionState: z.number().int().min(0).max(1),
  ultrasonicDistanceCm: z.number().positive(),
  irBeamBroken: z.boolean(),
  environmentCondition: z.enum(["daylight_clear", "night_low_light", "monsoon_glare", "unknown"]),
  timestamp: z.string(),
})

/**
 * POST /api/telemetry/sensor-fusion
 * Telemetry ingestion endpoint for sensor fusion data
 * Triggers Redis presence update and Socket.IO broadcast on state transitions
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await req.json()
    const validated = sensorFusionSchema.parse(body)

    const {
      slotId,
      visionConfidence,
      visionState,
      ultrasonicDistanceCm,
      irBeamBroken,
      environmentCondition,
      timestamp,
    } = validated

    // Build sensor input
    const sensorInput: SensorInput = {
      slotId,
      visionConfidence,
      visionState,
      ultrasonicDistanceCm,
      irBeamBroken,
      environmentCondition,
      timestamp: new Date(timestamp),
    }

    // Process sensor fusion
    const fusionResult = processSensorFusion(sensorInput)

    // Get current slot state from database
    const currentSlot = await prisma.slot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        lotId: true,
        status: true,
        updatedAt: true,
      },
    })

    if (!currentSlot) {
      return NextResponse.json(
        { error: "Slot not found" },
        { status: 404 }
      )
    }

    // Check if state transition occurred
    const newStatus = fusionResult.fusedOccupancyState === 1 ? SlotStatus.OCCUPIED : SlotStatus.AVAILABLE
    const stateTransition = currentSlot.status !== newStatus

    // Update slot state in database
    await prisma.slot.update({
      where: { id: slotId },
      data: {
        status: newStatus,
        updatedAt: new Date(timestamp),
      },
    })

    // Redis presence update (if Redis is available)
    try {
      const { updateSlotPresence } = await import("@/lib/redis")
      await updateSlotPresence(slotId, newStatus, {
        lotId: currentSlot.lotId,
        timestamp: new Date(timestamp).toISOString()
      })
    } catch (redisError) {
      console.warn("Redis update failed, continuing:", redisError)
    }

    // Socket.IO broadcast if state transition occurred
    if (stateTransition && currentSlot.lotId) {
      try {
        const { broadcastSlotStateChange } = await import("@/lib/realtime/socketio-server")
        
        broadcastSlotStateChange({
          lotId: currentSlot.lotId,
          slotId,
          slotNumber: 0, // Default value since currentSlot doesn't have slotNumber
          oldStatus: currentSlot.status,
          newStatus,
          source: "SENSOR_FUSION",
          timestamp: new Date(timestamp),
        })
      } catch (socketError) {
        console.warn("Socket.IO broadcast failed, continuing:", socketError)
      }
    }

    const processingTime = Date.now() - startTime

    // Check if processing time meets 50ms target
    if (processingTime > 50) {
      console.warn(`Sensor fusion processing time exceeded 50ms: ${processingTime}ms`)
    }

    return NextResponse.json({
      success: true,
      fusionResult,
      stateTransition,
      oldStatus: currentSlot.status,
      newStatus,
      processingTime,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        "X-Processing-Time": processingTime.toString(),
      },
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request payload", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Sensor fusion error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}