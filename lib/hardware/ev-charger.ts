import { PrismaClient, EVSessionStatus as PrismaEVSessionStatus, BayType, PaymentMethod, payment_status } from "@prisma/client"
import { logAuditEvent } from "@/lib/audit"
import crypto from "crypto"

const prisma = new PrismaClient()

export interface EVSessionStartRequest {
  slotId: string
  targetKwh?: number
  costPerKwh?: number
}

export interface EVSessionStartResponse {
  success: boolean
  sessionId?: string
  message: string
}

export interface EVTelemetryUpdate {
  sessionId: string
  addedKwh: number
  currentPowerKw: number
}

export interface EVSessionStopResponse {
  success: boolean
  totalEnergyKwh?: number
  totalCost?: number
  durationMinutes?: number
  message: string
}

export interface EVSessionDetails {
  sessionId: string
  status: PrismaEVSessionStatus
  energyConsumedKwh: number
  currentPowerKw: number
  costPerKwh: number
  startTime: Date
  endTime?: Date
  slotId: string
  estimatedCost?: number
}

/**
 * Start EV charging session
 * Verifies bay type, initializes session, emits signal to hardware
 */
export async function startEVChargingSession(
  request: EVSessionStartRequest
): Promise<EVSessionStartResponse> {
  const { slotId, targetKwh, costPerKwh = 15.0 } = request

  try {
    // 1. Verify parking slot is EV_CHARGING type
    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
      include: {
        parkingLot: true,
      },
    })

    if (!slot) {
      return {
        success: false,
        message: "Parking slot not found",
      }
    }

    if (slot.slotType !== "EV_CHARGING") {
      return {
        success: false,
        message: "Parking slot is not an EV charging slot",
      }
    }

    if (slot.status !== "AVAILABLE") {
      return {
        success: false,
        message: `Parking slot is ${slot.status}`,
      }
    }

    // 2. Check if there's already an active session for this slot
    const existingSession = await prisma.eVSession.findFirst({
      where: {
        slotId,
        status: {
          in: [PrismaEVSessionStatus.ACTIVE],
        },
      },
    })

    if (existingSession) {
      return {
        success: false,
        message: "Charging session already active for this bay",
      }
    }

    // 3. Create EV session
    const sessionId = crypto.randomUUID()
    const session = await prisma.eVSession.create({
      data: {
        id: sessionId,
        slotId,
        status: PrismaEVSessionStatus.ACTIVE,
        energyConsumedKwh: 0.0,
        powerKw: 7.2, // Standard AC/DC rate
        costPerKwh,
        startTime: new Date(),
      },
    })

    // 4. Mark slot as occupied
    await prisma.slot.update({
      where: { id: slotId },
      data: {
        status: "OCCUPIED",
      },
    })

    // 5. Emit session start signal to hardware relay/OCPP proxy
    const commandPayload = {
      cmd: "EV_START",
      sessionId,
      slotId,
      targetKwh: targetKwh || null,
      maxPower: 7.2,
      timestamp: new Date().toISOString(),
    }

    console.log(`[EV_CHARGER] Dispatching start command:`, commandPayload)

    // In production, this would send to MQTT or OCPP endpoint
    // await sendMQTTCommand(`ev/${slotId}/command`, commandPayload)
    // or
    // await fetch(`http://${chargerIpAddress}/api/start`, { method: "POST", body: JSON.stringify(commandPayload) })

    // 6. Log audit event
    await logAuditEvent({
      userId: "SYSTEM",
      action: "EV_CHARGING_STARTED",
      resource: `EVSession:${sessionId}`,
      ipAddress: "hardware",
      userAgent: "ev-charger",
      details: {
        slotId,
        targetKwh,
        costPerKwh,
      },
    })

    // 7. Transition to CHARGING status after connection established
    setTimeout(async () => {
      await prisma.eVSession.update({
        where: { id: sessionId },
        data: {
          status: PrismaEVSessionStatus.ACTIVE,
        },
      })
    }, 5000) // Simulate 5 seconds connection time

    return {
      success: true,
      sessionId,
      message: "Charging session started",
    }
  } catch (error: any) {
    console.error("Error starting EV charging session:", error)
    return {
      success: false,
      message: error.message || "Failed to start charging session",
    }
  }
}

/**
 * Update EV telemetry
 * Updates energy consumed, broadcasts to WebSocket room
 */
export async function updateEVTelemetry(
  update: EVTelemetryUpdate
): Promise<{
  success: boolean
  message: string
}> {
  const { sessionId, addedKwh, currentPowerKw } = update

  try {
    // 1. Get session
    const session = await prisma.eVSession.findUnique({
      where: { id: sessionId },
    })

    if (!session) {
      return {
        success: false,
        message: "Session not found",
      }
    }

    if (session.status !== PrismaEVSessionStatus.ACTIVE) {
      return {
        success: false,
        message: `Session is ${session.status}, not charging`,
      }
    }

    // 2. Update energy consumed
    const newEnergy = session.energyConsumedKwh + addedKwh
    await prisma.eVSession.update({
      where: { id: sessionId },
      data: {
        energyConsumedKwh: newEnergy,
        powerKw: currentPowerKw,
      },
    })

    // 3. Broadcast real-time telemetry to WebSocket room
    const telemetryPayload = {
      sessionId,
      energyConsumedKwh: newEnergy,
      currentPowerKw,
      estimatedCost: newEnergy * session.costPerKwh,
      timestamp: new Date().toISOString(),
    }

    console.log(`[EV_CHARGER] Broadcasting telemetry:`, telemetryPayload)

    // In production, this would broadcast via Socket.IO or WebSocket
    // io.to(`ev:telemetry:${sessionId}`).emit("telemetry", telemetryPayload)

    return {
      success: true,
      message: "Telemetry updated",
    }
  } catch (error: any) {
    console.error("Error updating EV telemetry:", error)
    return {
      success: false,
      message: error.message || "Failed to update telemetry",
    }
  }
}

/**
 * Stop EV charging session
 * Finalizes energy calculation, computes cost, generates billing
 */
export async function stopEVChargingSession(
  sessionId: string
): Promise<EVSessionStopResponse> {
  try {
    // 1. Get session
    const session = await prisma.eVSession.findUnique({
      where: { id: sessionId },
    })

    if (!session) {
      return {
        success: false,
        message: "Session not found",
      }
    }

    if (session.status !== PrismaEVSessionStatus.ACTIVE) {
      return {
        success: false,
        message: `Session is ${session.status}, cannot stop`,
      }
    }

    // 2. Calculate final cost
    const totalEnergy = session.energyConsumedKwh
    const totalCost = totalEnergy * session.costPerKwh
    const startTime = new Date(session.startTime)
    const endTime = new Date()
    const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60))

    // 3. Update session status
    await prisma.eVSession.update({
      where: { id: sessionId },
      data: {
        status: PrismaEVSessionStatus.COMPLETED,
        endTime,
      },
    })

    // 4. Emit stop signal to hardware
    const commandPayload = {
      cmd: "EV_STOP",
      sessionId,
      bayId: session.slotId,
      timestamp: new Date().toISOString(),
    }

    console.log(`[EV_CHARGER] Dispatching stop command:`, commandPayload)

    // In production, this would send to MQTT or OCPP endpoint
    // await sendMQTTCommand(`ev/${session.slotId}/command`, commandPayload)

    // 5. Release parking bay
    await prisma.parkingBay.update({
      where: { id: session.slotId },
      data: {
        status: "AVAILABLE",
      },
    })

    // 6. Generate billing invoice / charge record
    const payment = await prisma.payment.create({
      data: {
        id: crypto.randomUUID(),
        amount: totalCost,
        currency: "INR",
        status: payment_status.COMPLETED,
        paymentMethod: PaymentMethod.CASH_VALET,
        txHash: sessionId,
        fromAddress: session.slotId,
        region: "in",
        updatedAt: new Date(),
      },
    })

    // 7. Log audit event
    await logAuditEvent({
      userId: "SYSTEM",
      action: "EV_CHARGING_STOPPED",
      resource: `EVSession:${sessionId}`,
      ipAddress: "hardware",
      userAgent: "ev-charger",
      details: {
        totalEnergyKwh: totalEnergy,
        totalCost,
        durationMinutes,
        paymentId: payment.id,
      },
    })

    return {
      success: true,
      totalEnergyKwh: totalEnergy,
      totalCost,
      durationMinutes,
      message: "Charging session stopped",
    }
  } catch (error: any) {
    console.error("Error stopping EV charging session:", error)
    return {
      success: false,
      message: error.message || "Failed to stop charging session",
    }
  }
}

/**
 * Get EV session status
 * Returns real-time charging status and energy delivered
 */
export async function getEVSessionStatus(
  sessionId: string
): Promise<EVSessionDetails | null> {
  try {
    const session = await prisma.eVSession.findUnique({
      where: { id: sessionId },
      include: {
        slot: true,
      },
    })

    if (!session) {
      return null
    }

    const estimatedCost = session.energyConsumedKwh * session.costPerKwh

    return {
      sessionId: session.id,
      status: session.status,
      energyConsumedKwh: session.energyConsumedKwh,
      currentPowerKw: session.powerKw,
      costPerKwh: session.costPerKwh,
      startTime: session.startTime,
      endTime: session.endTime || undefined,
      slotId: session.slotId,
      estimatedCost,
    }
  } catch (error) {
    console.error("Error getting EV session status:", error)
    return null
  }
}

/**
 * Get active EV sessions
 */
export async function getActiveEVSessions(): Promise<EVSessionDetails[]> {
  try {
    const sessions = await prisma.eVSession.findMany({
      where: {
        status: {
          in: [PrismaEVSessionStatus.ACTIVE],
        },
      },
      include: {
        slot: true,
      },
    })

    return sessions.map((session) => ({
      sessionId: session.id,
      status: session.status,
      energyConsumedKwh: session.energyConsumedKwh,
      currentPowerKw: session.powerKw,
      costPerKwh: session.costPerKwh,
      startTime: session.startTime,
      endTime: session.endTime || undefined,
      slotId: session.slotId,
      estimatedCost: session.energyConsumedKwh * session.costPerKwh,
    }))
  } catch (error) {
    console.error("Error getting active EV sessions:", error)
    return []
  }
}