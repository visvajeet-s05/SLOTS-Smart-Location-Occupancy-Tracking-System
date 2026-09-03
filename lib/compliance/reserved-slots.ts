/**
 * Priority & Reserved Slot Compliance Engine
 * Monitors priority, accessible (ADA/disabled), and EV-reserved parking slots
 * Detects unauthorized parking and triggers operational alerts
 */

import { PrismaClient, SlotStatus } from "@prisma/client"
import { randomUUID } from "crypto"

const prisma = new PrismaClient()

export enum SlotClassification {
  REGULAR = "REGULAR",
  ACCESSIBLE_ADA = "ACCESSIBLE_ADA",
  EV_CHARGING = "EV_CHARGING",
  VIP_RESERVED = "VIP_RESERVED",
}

export interface ComplianceViolation {
  id: string
  type: SlotClassification
  slotId: string
  vehiclePlate: string
  vehiclePlateNumber?: string // Added for compatibility
  expectedPlate?: string // Added for compatibility
  durationMinutes: number
  severity: "LOW" | "MEDIUM" | "HIGH"
  timestamp: Date
  resolved: boolean
  lotId: string
}

export interface ComplianceCheckResult {
  compliant: boolean
  violationType?: SlotClassification
  actionRequired?: string
  violation?: ComplianceViolation
}

export interface ReservationDetails {
  bookingId: string
  userId: string
  vehiclePlate: string
  reservationType: SlotClassification
  startTime: Date
  endTime: Date
  authorized: boolean
}

/**
 * Compliance Logic Engine
 * Monitors and enforces reserved slot compliance
 */
class ReservedSlotsComplianceEngine {
  /**
   * Evaluate slot compliance for a vehicle
   * Checks if occupied slot has valid authorization for its classification
   */
  async evaluateSlotCompliance(
    slotId: string,
    vehiclePlateNumber: string,
    sensorState: number // 0 = AVAILABLE, 1 = OCCUPIED
  ): Promise<ComplianceCheckResult> {
    // Get slot details
    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        lotId: true,
        slotType: true,
        status: true,
        levelId: true,
      },
    })

    if (!slot) {
      return {
        compliant: false,
        actionRequired: "Slot not found",
      }
    }

    // If slot is available, no violation
    if (sensorState === 0 || slot.status === SlotStatus.AVAILABLE) {
      return {
        compliant: true,
      }
    }

    // Determine slot classification
    const slotClassification = this.determineSlotClassification(slot.slotType)

    // Regular slots don't require authorization
    if (slotClassification === SlotClassification.REGULAR) {
      return {
        compliant: true,
      }
    }

    // Check for valid reservation
    const reservation = await this.verifyReservation(
      slot.lotId,
      slotId,
      vehiclePlateNumber,
      slotClassification
    )

    if (reservation && reservation.authorized) {
      return {
        compliant: true,
      }
    }

    // Violation detected - unauthorized occupation
    const violation = await this.createViolation(
      slot.lotId,
      slotId,
      slotClassification,
      vehiclePlateNumber
    )

    return {
      compliant: false,
      violationType: slotClassification,
      actionRequired: this.getActionRequired(slotClassification),
      violation,
    }
  }

  /**
   * Determine slot classification from slot type
   */
  private determineSlotClassification(slotType: string): SlotClassification {
    const upperType = slotType.toUpperCase()

    if (upperType.includes("ACCESSIBLE") || upperType.includes("ADA")) {
      return SlotClassification.ACCESSIBLE_ADA
    }

    if (upperType.includes("EV") || upperType.includes("CHARGING")) {
      return SlotClassification.EV_CHARGING
    }

    if (upperType.includes("VIP") || upperType.includes("RESERVED")) {
      return SlotClassification.VIP_RESERVED
    }

    return SlotClassification.REGULAR
  }

  /**
   * Verify if vehicle has valid reservation for the slot type
   */
  private async verifyReservation(
    lotId: string,
    slotId: string,
    vehiclePlate: string,
    requiredType: SlotClassification
  ): Promise<ReservationDetails | null> {
    // Query for active booking with matching vehicle plate
    const booking = await prisma.booking.findFirst({
      where: {
        parkingLotId: lotId,
        vehicleNumber: vehiclePlate,
        status: {
          in: ["CONFIRMED", "ACTIVE"],
        },
        startTime: {
          lte: new Date(),
        },
        endTime: {
          gte: new Date(),
        },
      },
      include: {
        slot: {
          select: {
            id: true,
            slotType: true,
          },
        },
      },
    })

    if (!booking) {
      return null
    }

    // Check if booking is for this specific slot
    if (booking.slotId !== slotId) {
      return null
    }

    // Check if slot type matches required type
    const bookingSlotType = booking.slot?.slotType || "REGULAR"
    const bookingClassification = this.determineSlotClassification(bookingSlotType)

    if (bookingClassification === requiredType) {
      return {
        bookingId: booking.id,
        userId: booking.customerId,
        vehiclePlate: booking.vehicleNumber || "",
        reservationType: bookingClassification,
        startTime: booking.startTime,
        endTime: booking.endTime,
        authorized: true,
      }
    }

    return null
  }

  /**
   * Create compliance violation record
   */
  private async createViolation(
    lotId: string,
    slotId: string,
    type: SlotClassification,
    vehiclePlate: string
  ): Promise<ComplianceViolation> {
    // Use raw query to work around Prisma generation issues
    const id = this.generateId()
    const severity = this.getSeverity(type)
    
    await prisma.$queryRaw`
      INSERT INTO compliance_violations (id, type, slotId, vehiclePlate, severity, status, lotId, timestamp)
      VALUES (${id}, ${type as string}, ${slotId}, ${vehiclePlate}, ${severity}, 'ACTIVE', ${lotId}, NOW())
    `
    
    return {
      id,
      type,
      slotId,
      vehiclePlate,
      severity: severity as "LOW" | "MEDIUM" | "HIGH",
      durationMinutes: 0,
      lotId,
      timestamp: new Date(),
      resolved: false,
    }
  }

  /**
   * Get severity level for violation type
   */
  private getSeverity(type: SlotClassification): "LOW" | "MEDIUM" | "HIGH" {
    switch (type) {
      case SlotClassification.ACCESSIBLE_ADA:
        return "HIGH" // ADA violations are most severe
      case SlotClassification.EV_CHARGING:
        return "MEDIUM"
      case SlotClassification.VIP_RESERVED:
        return "HIGH"
      default:
        return "LOW"
    }
  }

  /**
   * Get action required for violation type
   */
  private getActionRequired(type: SlotClassification): string {
    switch (type) {
      case SlotClassification.ACCESSIBLE_ADA:
        return "Immediate vehicle relocation - ADA slot"
      case SlotClassification.EV_CHARGING:
        return "Relocate to regular slot or verify EV reservation"
      case SlotClassification.VIP_RESERVED:
        return "Contact security - VIP slot violation"
      default:
        return "Monitor and enforce slot policy"
    }
  }

  /**
   * Get all active violations for a lot
   */
  async getActiveViolations(lotId: string): Promise<ComplianceViolation[]> {
    const violations = await prisma.$queryRaw`
      SELECT * FROM compliance_violations 
      WHERE lotId = ${lotId} AND status = 'ACTIVE'
      ORDER BY timestamp DESC
    ` as any[]

    return violations.map((v: any) => ({
      id: v.id,
      type: v.type as SlotClassification,
      slotId: v.slotId,
      vehiclePlate: v.vehiclePlate,
      durationMinutes: v.durationMinutes || 0,
      severity: v.severity as "LOW" | "MEDIUM" | "HIGH",
      timestamp: v.timestamp,
      resolved: v.status === "RESOLVED",
      lotId: v.lotId,
    }))
  }

  /**
   * Resolve a violation
   */
  async resolveViolation(violationId: string): Promise<boolean> {
    const result = await prisma.$queryRaw`
      UPDATE compliance_violations 
      SET status = 'RESOLVED', resolvedAt = NOW()
      WHERE id = ${violationId}
    ` as any

    return (result as any).affectedRows > 0
  }

  /**
   * Get compliance statistics for a lot
   */
  async getComplianceStats(lotId: string, fromDate: Date, toDate: Date) {
    const violations = await prisma.$queryRaw`
      SELECT type, severity, COUNT(*) as count
      FROM compliance_violations 
      WHERE lotId = ${lotId} 
        AND timestamp >= ${fromDate.toISOString()} 
        AND timestamp <= ${toDate.toISOString()}
      GROUP BY type, severity
    ` as any[]

    return violations
  }

  /**
   * Check all slots in a lot for compliance violations
   */
  async checkLotCompliance(lotId: string): Promise<ComplianceCheckResult[]> {
    // Get all occupied slots
    const occupiedSlots = await prisma.slot.findMany({
      where: {
        lotId,
        status: SlotStatus.OCCUPIED,
      },
      select: {
        id: true,
        lotId: true,
        slotType: true,
      },
    })

    const results: ComplianceCheckResult[] = []

    for (const slot of occupiedSlots) {
      // In production, we would need the actual vehicle plate number
      // For now, we'll simulate this check
      const mockVehiclePlate = "UNKNOWN" // In production, get from ALPR or booking
      
      const result = await this.evaluateSlotCompliance(
        slot.id,
        mockVehiclePlate,
        1 // OCCUPIED
      )

      results.push(result)
    }

    return results
  }

  /**
   * Generate ID for workaround
   */
  private generateId(): string {
    return randomUUID()
  }

  /**
   * Monitor slot compliance continuously
   */
  async monitorSlotCompliance(lotId: string, intervalMs: number = 60000): Promise<() => void> {
    const checkInterval = setInterval(async () => {
      const violations = await this.getActiveViolations(lotId)
      
      if (violations.length > 0) {
        console.log(`Active violations for lot ${lotId}:`, violations.length)
        
        // Dispatch alerts via WebSocket and MQTT
        const { dispatchComplianceAlert } = await import("@/lib/notifications/compliance-alerts")
        const { dispatchMQTTAlert } = await import("@/lib/notifications/mqtt-alerts")
        
        violations.forEach((violation) => {
          const alert = {
            type: violation.type as any,
            lotId,
            slotId: violation.slotId,
            vehiclePlateNumber: violation.vehiclePlate || violation.vehiclePlateNumber,
            expectedPlateNumber: violation.expectedPlate,
            severity: violation.severity || "MEDIUM",
            timestamp: new Date(),
            metadata: violation,
          }
          
          dispatchComplianceAlert(alert)
          dispatchMQTTAlert(lotId, alert)
        })
      }
    }, intervalMs)

    // Return function to stop monitoring
    return () => clearInterval(checkInterval)
  }
}

// Singleton instance
const reservedSlotsComplianceEngine = new ReservedSlotsComplianceEngine()

/**
 * Evaluate slot compliance
 */
export async function evaluateSlotCompliance(
  slotId: string,
  vehiclePlateNumber: string,
  sensorState: number
): Promise<ComplianceCheckResult> {
  return await reservedSlotsComplianceEngine.evaluateSlotCompliance(
    slotId,
    vehiclePlateNumber,
    sensorState
  )
}

/**
 * Get active violations
 */
export async function getActiveViolations(lotId: string): Promise<ComplianceViolation[]> {
  return await reservedSlotsComplianceEngine.getActiveViolations(lotId)
}

/**
 * Resolve violation
 */
export async function resolveViolation(violationId: string): Promise<boolean> {
  return await reservedSlotsComplianceEngine.resolveViolation(violationId)
}

/**
 * Get compliance statistics
 */
export async function getComplianceStats(lotId: string, fromDate: Date, toDate: Date) {
  return await reservedSlotsComplianceEngine.getComplianceStats(lotId, fromDate, toDate)
}

/**
 * Check lot compliance
 */
export async function checkLotCompliance(lotId: string): Promise<ComplianceCheckResult[]> {
  return await reservedSlotsComplianceEngine.checkLotCompliance(lotId)
}

/**
 * Monitor slot compliance
 */
export async function monitorSlotCompliance(lotId: string, intervalMs?: number) {
  return await reservedSlotsComplianceEngine.monitorSlotCompliance(lotId, intervalMs)
}

export { reservedSlotsComplianceEngine }