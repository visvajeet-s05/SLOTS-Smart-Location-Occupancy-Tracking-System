import { PrismaClient, DeviceStatus } from "@prisma/client"
import { logAuditEvent } from "@/lib/audit"

const prisma = new PrismaClient()

export interface BarrierOpenRequest {
  siteId: string
  gateId: string
  triggerReason: "BOOKING" | "FASTAG" | "ALPR" | "MANUAL"
  vehicleNumber?: string
  bayId?: string
  userId?: string
}

export interface BarrierStatus {
  gateId: string
  status: "OPEN" | "CLOSED"
  lastHeartbeat: Date
  ipAddress: string | null
}

/**
 * Trigger barrier gate to open
 * Validates booking/plate match, dispatches command, logs audit event
 */
export async function triggerBarrierOpen(request: BarrierOpenRequest): Promise<{
  success: boolean
  message: string
  gateStatus?: BarrierStatus
}> {
  const { siteId, gateId, triggerReason, vehicleNumber, bayId, userId } = request

  try {
    // 1. Validate gate exists and is online
    const gate = await prisma.hardwareDevice.findFirst({
      where: {
        id: gateId,
        siteId,
        deviceType: "BARRIER_GATE",
      },
    })

    if (!gate) {
      return {
        success: false,
        message: "Gate not found",
      }
    }

    if (gate.status !== DeviceStatus.ONLINE) {
      return {
        success: false,
        message: `Gate is ${gate.status}`,
      }
    }

    // 2. Validate trigger reason and check permissions
    let isValidTrigger = false

    if (triggerReason === "BOOKING" && bayId) {
      // Check if there's an active booking for this bay
      const activeBooking = await prisma.booking.findFirst({
        where: {
          parkingBayId: bayId,
          status: "CONFIRMED",
          OR: [
            { startTime: { lte: new Date() } },
            { endTime: { gte: new Date() } },
          ],
        },
      })

      isValidTrigger = !!activeBooking
    } else if (triggerReason === "FASTAG" && vehicleNumber) {
      // FASTag validation is handled in the FASTag processor
      isValidTrigger = true
    } else if (triggerReason === "ALPR" && vehicleNumber) {
      // Check if vehicle has an active booking
      const activeBooking = await prisma.booking.findFirst({
        where: {
          vehicleNumber,
          status: "CONFIRMED",
          OR: [
            { startTime: { lte: new Date() } },
            { endTime: { gte: new Date() } },
          ],
        },
      })

      isValidTrigger = !!activeBooking
    } else if (triggerReason === "MANUAL" && userId) {
      // Manual override requires operator/admin role
      const user = await prisma.user.findUnique({
        where: { id: userId },
      })

      isValidTrigger = (user?.role as any) === "OWNER" || (user?.role as any) === "SUPER_ADMIN"
    }

    if (!isValidTrigger) {
      return {
        success: false,
        message: "Invalid trigger: no active booking or unauthorized",
      }
    }

    // 3. Dispatch MQTT/HTTP command to edge relay controller
    // In production, this would send to MQTT broker or HTTP endpoint
    const commandPayload = {
      cmd: "GATE_OPEN",
      gateId,
      timestamp: new Date().toISOString(),
      triggerReason,
      vehicleNumber,
    }

    console.log(`[GATE_CONTROLLER] Dispatching command:`, commandPayload)

    // Simulate sending command to hardware
    // await sendMQTTCommand(`gate/${gateId}/command`, commandPayload)
    // or
    // await fetch(`http://${gate.ipAddress}/api/open`, { method: "POST", body: JSON.stringify(commandPayload) })

    // 4. Log audit event
    await logAuditEvent({
      userId: userId || "SYSTEM",
      action: "HARDWARE_GATE_OPENED",
      resource: `Gate:${gateId}`,
      ipAddress: "hardware",
      userAgent: "gate-controller",
      details: {
        triggerReason,
        vehicleNumber,
        bayId,
        siteId,
      },
    })

    // 5. Schedule automatic gate close after 10 seconds (simulated loop sensor clear)
    setTimeout(async () => {
      await triggerBarrierClose(gateId, userId || "SYSTEM")
    }, 10000)

    // 6. Update gate status
    await prisma.hardwareDevice.update({
      where: { id: gateId },
      data: {
        lastHeartbeat: new Date(),
      },
    })

    const gateStatus: BarrierStatus = {
      gateId,
      status: "OPEN",
      lastHeartbeat: new Date(),
      ipAddress: gate.ipAddress,
    }

    return {
      success: true,
      message: "Gate opened successfully",
      gateStatus,
    }
  } catch (error: any) {
    console.error("Error triggering barrier open:", error)
    return {
      success: false,
      message: error.message || "Failed to open gate",
    }
  }
}

/**
 * Trigger barrier gate to close
 * Called automatically after vehicle clears loop sensor
 */
async function triggerBarrierClose(
  gateId: string,
  userId: string
): Promise<void> {
  try {
    const commandPayload = {
      cmd: "GATE_CLOSE",
      gateId,
      timestamp: new Date().toISOString(),
    }

    console.log(`[GATE_CONTROLLER] Dispatching close command:`, commandPayload)

    // Simulate sending command to hardware
    // await sendMQTTCommand(`gate/${gateId}/command`, commandPayload)

    // Log audit event
    await logAuditEvent({
      userId,
      action: "HARDWARE_GATE_CLOSED",
      resource: `Gate:${gateId}`,
      ipAddress: "hardware",
      userAgent: "gate-controller",
      details: {
        autoClose: true,
      },
    })

    // Update gate status
    await prisma.hardwareDevice.update({
      where: { id: gateId },
      data: {
        lastHeartbeat: new Date(),
      },
    })
  } catch (error) {
    console.error("Error triggering barrier close:", error)
  }
}

/**
 * Check gate status
 * Queries hardware heartbeat and relay contact position
 */
export async function checkGateStatus(gateId: string): Promise<BarrierStatus | null> {
  try {
    const gate = await prisma.hardwareDevice.findUnique({
      where: { id: gateId },
    })

    if (!gate) {
      return null
    }

    // In production, this would query the actual hardware
    // const response = await fetch(`http://${gate.ipAddress}/api/status`)
    // const status = await response.json()

    // Simulate status based on last heartbeat (if recent, assume closed)
    const isRecentHeartbeat = Date.now() - gate.lastHeartbeat.getTime() < 5000

    return {
      gateId,
      status: isRecentHeartbeat ? "CLOSED" : "CLOSED",
      lastHeartbeat: gate.lastHeartbeat,
      ipAddress: gate.ipAddress,
    }
  } catch (error) {
    console.error("Error checking gate status:", error)
    return null
  }
}

/**
 * Emergency gate stop
 * Immediately stops gate movement
 */
export async function emergencyGateStop(gateId: string, userId: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    const commandPayload = {
      cmd: "GATE_STOP",
      gateId,
      timestamp: new Date().toISOString(),
    }

    console.log(`[GATE_CONTROLLER] Emergency stop:`, commandPayload)

    // Simulate sending command to hardware
    // await sendMQTTCommand(`gate/${gateId}/command`, commandPayload)

    // Log audit event
    await logAuditEvent({
      userId,
      action: "HARDWARE_GATE_EMERGENCY_STOP",
      resource: `Gate:${gateId}`,
      ipAddress: "hardware",
      userAgent: "gate-controller",
      details: {
        emergency: true,
      },
    })

    return {
      success: true,
      message: "Emergency stop activated",
    }
  } catch (error: any) {
    console.error("Error triggering emergency stop:", error)
    return {
      success: false,
      message: error.message || "Failed to activate emergency stop",
    }
  }
}