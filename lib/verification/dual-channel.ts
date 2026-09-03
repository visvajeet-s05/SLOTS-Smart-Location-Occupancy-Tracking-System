/**
 * Dual-Verification Matching Engine
 * Matches ALPR results against booking reservations and handles gate control
 */

import { PrismaClient } from "@prisma/client"
import { ALPRResult } from "@/lib/vision/alpr-engine"

const prisma = new PrismaClient()

export interface VerificationResult {
  success: boolean
  verified: boolean
  plateNumber: string
  action: "OPEN_GATE" | "DENY" | "WALKIN_CREATED"
  bookingId?: string
  vehicleNumber?: string
  message: string
  timestamp: Date
}

export interface WalkInBooking {
  bookingId: string
  vehicleNumber: string
  slotId: string
  rate: number
  duration: number
  expiresAt: Date
}

export interface BarrierGateCommand {
  lotId: string
  gateId: string
  action: "OPEN" | "CLOSE"
  reason: "BOOKING" | "FASTAG" | "ALPR" | "WALKIN" | "MANUAL"
  vehicleNumber?: string
  bookingId?: string
}

/**
 * Dual-Verification Engine
 * Matches ALPR results against bookings and controls barrier gates
 */
class DualVerificationEngine {
  /**
   * Verify vehicle using ALPR result
   */
  async verifyVehicle(
    lotId: string,
    alprResult: ALPRResult,
    timestamp: Date = new Date()
  ): Promise<VerificationResult> {
    const plateNumber = alprResult.normalizedPlate

    // Check if ALPR result is valid
    if (!alprResult.isValid || alprResult.confidence < 0.7) {
      return {
        success: false,
        verified: false,
        plateNumber,
        action: "DENY",
        message: "Invalid or low-confidence license plate recognition",
        timestamp,
      }
    }

    // Step 1: Match against active bookings
    const bookingMatch = await this.matchActiveBooking(lotId, plateNumber)

    if (bookingMatch) {
      // Match Found + Ticket Valid -> Open Barrier Gate
      await this.openBarrierGate(lotId, bookingMatch.bookingId, plateNumber)

      return {
        success: true,
        verified: true,
        plateNumber,
        action: "OPEN_GATE",
        bookingId: bookingMatch.bookingId,
        vehicleNumber: bookingMatch.vehicleNumber,
        message: "Valid booking found - barrier opened",
        timestamp,
      }
    }

    // Step 2: No Match Found -> Check for walk-in
    const existingWalkIn = await this.findExistingWalkIn(lotId, plateNumber)

    if (existingWalkIn) {
      // Walk-in already exists - open gate
      await this.openBarrierGate(lotId, existingWalkIn.bookingId, plateNumber)

      return {
        success: true,
        verified: true,
        plateNumber,
        action: "OPEN_GATE",
        bookingId: existingWalkIn.bookingId,
        vehicleNumber: existingWalkIn.vehicleNumber,
        message: "Existing walk-in booking found - barrier opened",
        timestamp,
      }
    }

    // Step 3: No Match Found + Walk-in -> Auto-generate on-demand booking
    const walkInBooking = await this.createWalkInBooking(lotId, plateNumber, timestamp)

    if (walkInBooking) {
      await this.openBarrierGate(lotId, walkInBooking.bookingId, plateNumber)

      return {
        success: true,
        verified: true,
        plateNumber,
        action: "WALKIN_CREATED",
        bookingId: walkInBooking.bookingId,
        vehicleNumber: walkInBooking.vehicleNumber,
        message: "Walk-in booking created - barrier opened",
        timestamp,
      }
    }

    // Step 4: Failed to create walk-in booking
    return {
      success: false,
      verified: false,
      plateNumber,
      action: "DENY",
      message: "Failed to create walk-in booking - no available slots",
      timestamp,
    }
  }

  /**
   * Match license plate against active bookings
   */
  private async matchActiveBooking(
    lotId: string,
    plateNumber: string
  ): Promise<{ bookingId: string; vehicleNumber: string } | null> {
    // Query active bookings for this lot with matching vehicle number
    const booking = await prisma.booking.findFirst({
      where: {
        parkingLotId: lotId,
        vehicleNumber: plateNumber,
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
      select: {
        id: true,
        vehicleNumber: true,
      },
    })

    if (booking && booking.vehicleNumber) {
      return {
        bookingId: booking.id,
        vehicleNumber: booking.vehicleNumber,
      }
    }

    return null
  }

  /**
   * Find existing walk-in booking for plate
   */
  private async findExistingWalkIn(
    lotId: string,
    plateNumber: string
  ): Promise<{ bookingId: string; vehicleNumber: string } | null> {
    // Query for walk-in bookings created today
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const booking = await prisma.booking.findFirst({
      where: {
        parkingLotId: lotId,
        vehicleNumber: plateNumber,
        status: "ACTIVE",
        createdAt: {
          gte: today,
        },
        // Note: isWalkIn field may not exist in schema, we'll use customer ID as indicator
        customerId: "WALKIN_USER",
      },
      select: {
        id: true,
        vehicleNumber: true,
      },
    })

    if (booking && booking.vehicleNumber) {
      return {
        bookingId: booking.id,
        vehicleNumber: booking.vehicleNumber,
      }
    }

    return null
  }

  /**
   * Create walk-in booking for unregistered vehicle
   */
  private async createWalkInBooking(
    lotId: string,
    plateNumber: string,
    timestamp: Date
  ): Promise<WalkInBooking | null> {
    try {
      // Get current hourly rate for the lot
      const pricingRule = await prisma.pricingrule.findFirst({
        where: { parkingLotId: lotId },
        orderBy: { createdAt: "desc" },
      })

      const baseRate = pricingRule?.basePrice || pricingRule?.hourlyRate || 50

      // Find available slot
      const availableSlot = await prisma.slot.findFirst({
        where: {
          lotId,
          status: "AVAILABLE",
        },
      })

      if (!availableSlot) {
        return null
      }

      // Create walk-in booking (1 hour duration)
      const booking = await prisma.booking.create({
        data: {
          parkingLotId: lotId,
          customerId: "WALKIN_USER", // Special customer ID for walk-ins
          ownerId: "SYSTEM", // System owner for walk-ins
          vehicleNumber: plateNumber,
          startTime: timestamp,
          endTime: new Date(timestamp.getTime() + 60 * 60 * 1000), // 1 hour
          amount: baseRate,
          status: "ACTIVE",
          slotId: availableSlot.id,
          vehicleType: "CAR", // Default vehicle type
        },
      })

      // Update slot status
      await prisma.slot.update({
        where: { id: availableSlot.id },
        data: { status: "OCCUPIED" },
      })

      if (!booking.vehicleNumber) {
        return null
      }

      return {
        bookingId: booking.id,
        vehicleNumber: booking.vehicleNumber,
        slotId: availableSlot.id,
        rate: baseRate,
        duration: 1,
        expiresAt: booking.endTime,
      }
    } catch (error) {
      console.error("Error creating walk-in booking:", error)
      return null
    }
  }

  /**
   * Open barrier gate via MQTT
   */
  private async openBarrierGate(
    lotId: string,
    bookingId: string,
    vehicleNumber: string
  ): Promise<void> {
    // In production, this would publish MQTT message to gate controller
    const command: BarrierGateCommand = {
      lotId,
      gateId: "ENTRY_GATE_1", // Would be determined by context
      action: "OPEN",
      reason: "ALPR",
      vehicleNumber,
      bookingId,
    }

    console.log("Opening barrier gate:", command)

    // Simulate MQTT publish
    // await mqttClient.publish(`slots/${lotId}/gate`, JSON.stringify(command))
  }

  /**
   * Flag plate mismatch alert
   */
  async flagPlateMismatch(
    lotId: string,
    detectedPlate: string,
    expectedPlate: string,
    bookingId: string
  ): Promise<void> {
    // Log plate mismatch for operational dashboard
    console.error(`Plate mismatch flagged for lot ${lotId}: Expected ${expectedPlate}, found ${detectedPlate}`)
    
    // Create alert record in database
    try {
      const { PrismaClient } = await import("@prisma/client")
      const prisma = new PrismaClient()
      
      await prisma.complianceAlert.create({
        data: {
          type: "PLATE_MISMATCH",
          lotId,
          slotId: bookingId, // Using bookingId as slotId reference
          vehiclePlateNumber: detectedPlate,
          expectedPlateNumber: expectedPlate,
          severity: "HIGH",
          status: "ACTIVE",
          metadata: {
            detectedPlate,
            expectedPlate,
            bookingId,
          },
        },
      })
      
      console.log(`✅ Plate mismatch alert created in database for lot ${lotId}`)
    } catch (error) {
      console.error("Failed to create plate mismatch alert:", error)
    }
  }

  /**
   * Verify vehicle with expected plate (for mismatch detection)
   */
  async verifyWithExpectedPlate(
    lotId: string,
    alprResult: ALPRResult,
    expectedPlate: string,
    bookingId: string,
    timestamp: Date = new Date()
  ): Promise<VerificationResult> {
    const detectedPlate = alprResult.normalizedPlate

    // Normalize expected plate for comparison
    const normalizedExpected = this.normalizePlate(expectedPlate)

    if (detectedPlate === normalizedExpected) {
      // Plate matches - open gate
      await this.openBarrierGate(lotId, bookingId, detectedPlate)

      return {
        success: true,
        verified: true,
        plateNumber: detectedPlate,
        action: "OPEN_GATE",
        bookingId,
        vehicleNumber: detectedPlate,
        message: "Plate matches expected - barrier opened",
        timestamp,
      }
    }

    // Plate mismatch - flag alert
    await this.flagPlateMismatch(lotId, detectedPlate, normalizedExpected, bookingId)

    return {
      success: false,
      verified: false,
      plateNumber: detectedPlate,
      action: "DENY",
      message: "Plate mismatch detected - alert flagged",
      timestamp,
    }
  }

  /**
   * Normalize license plate for comparison
   */
  private normalizePlate(plate: string): string {
    return plate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  }

  /**
   * Get verification statistics for a lot
   */
  async getVerificationStats(lotId: string, fromDate: Date, toDate: Date) {
    const stats = await prisma.booking.groupBy({
      by: ["status"],
      where: {
        parkingLotId: lotId,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      _count: true,
    })

    return stats
  }
}

// Singleton instance
const dualVerificationEngine = new DualVerificationEngine()

/**
 * Verify vehicle using ALPR
 */
export async function verifyVehicleALPR(
  lotId: string,
  alprResult: ALPRResult,
  timestamp?: Date
): Promise<VerificationResult> {
  return await dualVerificationEngine.verifyVehicle(lotId, alprResult, timestamp)
}

/**
 * Verify vehicle with expected plate
 */
export async function verifyWithExpectedPlate(
  lotId: string,
  alprResult: ALPRResult,
  expectedPlate: string,
  bookingId: string,
  timestamp?: Date
): Promise<VerificationResult> {
  return await dualVerificationEngine.verifyWithExpectedPlate(
    lotId,
    alprResult,
    expectedPlate,
    bookingId,
    timestamp
  )
}

/**
 * Get verification statistics
 */
export async function getVerificationStats(lotId: string, fromDate: Date, toDate: Date) {
  return await dualVerificationEngine.getVerificationStats(lotId, fromDate, toDate)
}

export { dualVerificationEngine }