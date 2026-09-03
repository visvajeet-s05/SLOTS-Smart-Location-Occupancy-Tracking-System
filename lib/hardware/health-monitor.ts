import { PrismaClient, DeviceStatus } from "@prisma/client"

const prisma = new PrismaClient()

const HEARTBEAT_TIMEOUT = 60 * 1000 // 60 seconds in milliseconds

/**
 * Ping all hardware devices
 * Updates lastHeartbeat and flags devices as OFFLINE if no packet received
 */
export async function pingHardwareDevices(): Promise<{
  totalDevices: number
  onlineDevices: number
  offlineDevices: number
  offlineDeviceIds: string[]
}> {
  try {
    const now = new Date()
    const threshold = new Date(now.getTime() - HEARTBEAT_TIMEOUT)

    // Get all devices
    const allDevices = await prisma.hardwareDevice.findMany()

    // Find devices that haven't sent heartbeat recently
    const offlineDevices = await prisma.hardwareDevice.findMany({
      where: {
        lastHeartbeat: {
          lt: threshold,
        },
        status: DeviceStatus.ONLINE,
      },
    })

    // Update offline devices
    for (const device of offlineDevices) {
      await prisma.hardwareDevice.update({
        where: { id: device.id },
        data: {
          status: DeviceStatus.OFFLINE,
        },
      })

      console.log(`[HEALTH_MONITOR] Device ${device.name} (${device.id}) marked as OFFLINE`)
    }

    // Count online devices
    const onlineDevices = await prisma.hardwareDevice.count({
      where: {
        status: DeviceStatus.ONLINE,
      },
    })

    const offlineCount = await prisma.hardwareDevice.count({
      where: {
        status: DeviceStatus.OFFLINE,
      },
    })

    console.log(`[HEALTH_MONITOR] Health check complete: ${onlineDevices} online, ${offlineCount} offline`)

    return {
      totalDevices: allDevices.length,
      onlineDevices,
      offlineDevices: offlineCount,
      offlineDeviceIds: offlineDevices.map((d) => d.id),
    }
  } catch (error) {
    console.error("Error pinging hardware devices:", error)
    return {
      totalDevices: 0,
      onlineDevices: 0,
      offlineDevices: 0,
      offlineDeviceIds: [],
    }
  }
}

/**
 * Update device heartbeat
 * Called by hardware devices when they send periodic heartbeats
 */
export async function updateDeviceHeartbeat(
  deviceId: string,
  ipAddress?: string
): Promise<{
  success: boolean
  message: string
}> {
  try {
    const device = await prisma.hardwareDevice.findUnique({
      where: { id: deviceId },
    })

    if (!device) {
      return {
        success: false,
        message: "Device not found",
      }
    }

    // If device was offline, bring it back online
    const status = device.status === DeviceStatus.OFFLINE ? DeviceStatus.ONLINE : device.status

    await prisma.hardwareDevice.update({
      where: { id: deviceId },
      data: {
        lastHeartbeat: new Date(),
        ipAddress: ipAddress || device.ipAddress,
        status,
      },
    })

    return {
      success: true,
      message: "Heartbeat updated",
    }
  } catch (error: any) {
    console.error("Error updating device heartbeat:", error)
    return {
      success: false,
      message: error.message || "Failed to update heartbeat",
    }
  }
}

/**
 * Get all devices for a site
 */
export async function getSiteDevices(siteId: string) {
  try {
    const devices = await prisma.hardwareDevice.findMany({
      where: { siteId },
      orderBy: {
        deviceType: "asc",
      },
    })

    return devices
  } catch (error) {
    console.error("Error getting site devices:", error)
    return []
  }
}

/**
 * Get device by type for a site
 */
export async function getDevicesByType(siteId: string, deviceType: string) {
  try {
    const devices = await prisma.hardwareDevice.findMany({
      where: {
        siteId,
        deviceType: deviceType as any,
      },
    })

    return devices
  } catch (error) {
    console.error("Error getting devices by type:", error)
    return []
  }
}

/**
 * Set device to maintenance mode
 */
export async function setDeviceMaintenanceMode(
  deviceId: string,
  inMaintenance: boolean,
  userId: string
): Promise<{
  success: boolean
  message: string
}> {
  try {
    await prisma.hardwareDevice.update({
      where: { id: deviceId },
      data: {
        status: inMaintenance ? DeviceStatus.MAINTENANCE : DeviceStatus.ONLINE,
      },
    })

    // Log audit event
    const { logAuditEvent } = await import("@/lib/audit")
    await logAuditEvent({
      userId,
      action: inMaintenance ? "DEVICE_MAINTENANCE_ON" : "DEVICE_MAINTENANCE_OFF",
      resource: `Device:${deviceId}`,
      ipAddress: "web",
      userAgent: "hardware-admin",
      details: {
        inMaintenance,
      },
    })

    return {
      success: true,
      message: inMaintenance ? "Device set to maintenance mode" : "Device taken out of maintenance",
    }
  } catch (error: any) {
    console.error("Error setting device maintenance mode:", error)
    return {
      success: false,
      message: error.message || "Failed to set maintenance mode",
    }
  }
}

/**
 * Start health monitor daemon
 * Runs periodic health checks every 30 seconds
 */
export function startHealthMonitorDaemon(): NodeJS.Timeout {
  console.log("[HEALTH_MONITOR] Starting health monitor daemon...")

  // Run immediately
  pingHardwareDevices()

  // Schedule periodic checks
  const interval = setInterval(() => {
    pingHardwareDevices()
  }, 30000) // 30 seconds

  return interval
}

/**
 * Stop health monitor daemon
 */
export function stopHealthMonitorDaemon(interval: NodeJS.Timeout): void {
  console.log("[HEALTH_MONITOR] Stopping health monitor daemon...")
  clearInterval(interval)
}