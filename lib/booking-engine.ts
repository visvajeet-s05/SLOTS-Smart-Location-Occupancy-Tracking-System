import { booking_status, slot_status } from "@prisma/client"
import { z } from "zod"
import prisma from "../lib/prisma"

// Define BayType enum to match Prisma (also used in parkingbay.bayType)
enum BayType {
  STANDARD = "STANDARD",
  ACCESSIBLE = "ACCESSIBLE",
  EV_CHARGING = "EV_CHARGING",
  VIP = "VIP",
  TWO_WHEELER = "TWO_WHEELER"
}

// Validation schemas
const holdSlotSchema = z.object({
  userId: z.string(),
  siteId: z.string(),
  floorId: z.string().optional(),
  zoneId: z.string().optional(),
  bayType: z.nativeEnum(BayType).optional(),
  isAccessible: z.boolean().optional(),
  startTime: z.string().or(z.date()),
  endTime: z.string().or(z.date()),
  vehicleNumber: z.string().min(1),
  vehicleType: z.string().optional(),
  idempotencyKey: z.string().optional(),
})

const availabilityCheckSchema = z.object({
  parkingBayId: z.string(),
  startTime: z.string().or(z.date()),
  endTime: z.string().or(z.date()),
})

type HoldSlotInput = z.infer<typeof holdSlotSchema>
type AvailabilityCheckInput = z.infer<typeof availabilityCheckSchema>

/**
 * Check if a parking bay is available for the given time range
 * B3-B5: Overlap and consecutive booking rules
 * Considers CONFIRMED, ACTIVE bookings and PENDING_PAYMENT with valid locks
 */
export async function checkSlotAvailability(
  parkingBayId: string,
  startTime: Date,
  endTime: Date
): Promise<boolean> {
  // Validate input
  const now = new Date()
  
  // Start time must be in the future
  if (startTime <= now) {
    throw new Error("Start time must be in the future")
  }
  
  // End time must be after start time
  if (endTime <= startTime) {
    throw new Error("End time must be after start time")
  }
  
  // B3: Check for overlapping bookings (trigger also enforces this at DB level)
  const overlappingBookings = await prisma.booking.count({
    where: {
      parkingBayId,
      status: {
        in: [booking_status.CONFIRMED, booking_status.ACTIVE, booking_status.HELD],
      },
      OR: [
        {
          AND: [
            { startTime: { lte: startTime } },
            { endTime: { gt: startTime } },
          ],
        },
        {
          AND: [
            { startTime: { lt: endTime } },
            { endTime: { gte: endTime } },
          ],
        },
        {
          AND: [
            { startTime: { gte: startTime } },
            { endTime: { lte: endTime } },
          ],
        },
      ],
    },
  })
  
  if (overlappingBookings > 0) {
    return false
  }
  
  // Check for active holds (HELD with valid lock)
  const activeHolds = await prisma.booking.count({
    where: {
      parkingBayId,
      status: booking_status.HELD,
      lockExpiresAt: {
        gt: now,
      },
      OR: [
        {
          AND: [
            { startTime: { lte: startTime } },
            { endTime: { gt: startTime } },
          ],
        },
        {
          AND: [
            { startTime: { lt: endTime } },
            { endTime: { gte: endTime } },
          ],
        },
        {
          AND: [
            { startTime: { gte: startTime } },
            { endTime: { lte: endTime } },
          ],
        },
      ],
    },
  })
  
  if (activeHolds > 0) {
    return false
  }
  
  // B4-B5: Consecutive booking rules with turnover buffer
  // Get lot config for turnover buffer
  const siteId = await prisma.parkingbay.findUnique({
    where: { id: parkingBayId },
    select: { zone: { select: { floor: { select: { siteId: true } } } } }
  })
  
  if (siteId?.zone?.floor?.siteId) {
    const lotConfig = await prisma.lotconfig.findUnique({
      where: { lotId: siteId.zone.floor.siteId }
    })
    const turnoverBufferMinutes = lotConfig?.turnoverBufferMinutes ?? 5
    
    // Check for bookings ending too close to start time (before)
    const bookingsEndingBefore = await prisma.booking.count({
      where: {
        parkingBayId,
        status: { in: [booking_status.CONFIRMED, booking_status.ACTIVE, booking_status.HELD] },
        endTime: {
          gte: new Date(startTime.getTime() - turnoverBufferMinutes * 60 * 1000),
          lte: startTime,
        },
      },
    })
    
    // Check for bookings starting too close to end time (after)
    const bookingsStartingAfter = await prisma.booking.count({
      where: {
        parkingBayId,
        status: { in: [booking_status.CONFIRMED, booking_status.ACTIVE, booking_status.HELD] },
        startTime: {
          gte: endTime,
          lte: new Date(endTime.getTime() + turnoverBufferMinutes * 60 * 1000),
        },
      },
    })
    
    if (bookingsEndingBefore > 0 || bookingsStartingAfter > 0) {
      return false
    }
  }
  
  return true
}

/**
 * Find an available parking bay matching the given criteria
 * Implements time-aware availability checking
 */
async function findAvailableBay(criteria: {
  siteId: string
  floorId?: string
  zoneId?: string
  bayType?: any
  isAccessible?: boolean
  vehicleType?: string
  startTime?: Date
  endTime?: Date
}): Promise<string | null> {
  const { siteId, floorId, zoneId, bayType, isAccessible, vehicleType, startTime, endTime } = criteria
  
  // Build the query to find available bays
  const availableBays = await prisma.parkingbay.findMany({
    where: {
      status: slot_status.AVAILABLE,
      isReserved: false,
      // Zone hierarchy
      zone: {
        floor: {
          siteId,
          ...(floorId && { id: floorId }),
          ...(zoneId && { id: zoneId }),
        },
      },
      // Type filters
      ...(bayType && { bayType }),
      ...(isAccessible !== undefined && { isAccessible }),
      ...(vehicleType && { vehicleType: vehicleType as any }),
    },
    include: {
      zone: {
        include: {
          floor: true,
        },
      },
    },
    orderBy: [
      { zone: { floor: { levelNumber: "asc" } } }, // Prefer lower floors
      { bayNumber: "asc" }, // Prefer lower bay numbers
    ],
    take: 20, // Get top candidates
  })
  
  if (availableBays.length === 0) {
    return null
  }
  
  // Check each bay for actual availability (no overlapping bookings)
  // If time range is provided, check for conflicts
  if (startTime && endTime) {
    for (const bay of availableBays) {
      const isAvailable = await checkSlotAvailability(bay.id, startTime, endTime)
      if (isAvailable) {
        return bay.id
      }
    }
  } else {
    // If no time range, return first available bay
    return availableBays[0].id
  }
  
  return null
}

/**
 * Validate booking time against lot configuration
 * B2: 12-hour advance booking window validation
 * B29a: Minimum lead time validation
 * 
 * IMPORTANT: The 12-hour window means booking OPENS 12 hours before start time,
 * not that you can't book more than 12 hours in advance.
 * If it's currently 10:00 AM and booking opens at 7:00 PM for a 7:00 PM start,
 * the customer CAN book at 7:00 AM (12h before 7:00 PM start).
 * If the requested start is 7:00 PM and current time is 8:00 AM,
 * the booking window is open (12h before 7:00 PM = 7:00 AM, which has passed).
 */
export async function validateBookingTime(
  siteId: string,
  startTime: Date,
  endTime: Date
): Promise<void> {
  const now = new Date()
  
  // Start time must be in the future
  if (startTime <= now) {
    throw new Error("Start time must be in the future")
  }
  
  // End time must be after start time
  if (endTime <= startTime) {
    throw new Error("End time must be after start time")
  }
  
  // Fetch lot configuration
  const lotConfig = await getLotConfig(siteId)
  
  // Use defaults if config not found
  const advanceBookingHours = lotConfig?.advanceBookingHours ?? 12
  const minBookingLeadMinutes = lotConfig?.minBookingLeadMinutes ?? 15
  const minBookingDurationMinutes = lotConfig?.minBookingDurationMinutes ?? 30
  const maxBookingDurationMinutes = lotConfig?.maxBookingDurationMinutes ?? 720
  
  // B2: The 12-hour advance booking window means:
  // - A customer can book up to 12 hours before the scheduled start time
  // - If the requested start is more than 12 hours away, that's allowed (it opens 12h before)
  // Wait - re-reading the requirement:
  // "A customer can book a parking slot starting exactly 12 hours before the requested parking start time."
  // This means booking opens 12h before start. So if start is 7PM and it's 6AM, booking opens at 7AM.
  // At 6AM, booking hasn't opened yet (still 1 hour until window opens).
  // 
  // "The customer cannot book the slot before the 12-hour booking window opens."
  // So booking is only allowed once we're within 12 hours of start time? No wait...
  // Actually re-reading: "booking opens at 7:00 AM" for 7:00 PM start.
  // So you CANNOT book before the window opens. The window opens 12h before start.
  // After the window opens, you can book up to the start time.
  //
  // But the example says "At 8:00 AM another customer may book" for 10PM start.
  // 10PM - 12h = 10AM. So at 8AM, window hasn't opened yet.
  // 
  // Hmm, re-reading more carefully: The formula is bookingOpenTime = requestedStartTime - 12h
  // For 7PM start: booking opens at 7AM. At 8AM, you CAN book (7AM has passed).
  // For 10PM start: booking opens at 10AM. At 9AM, you CANNOT book (10AM hasn't passed).
  // The example says "At 9:00 AM another customer may try to book 8PM to 9PM" - but this would be rejected since booking window for 8PM opens at 8AM.
  // 
  // Actually, looking at the example more carefully:
  // At 7:00 AM, customer books 7PM-10PM (window opens at 7AM, so 7AM is the exact open time)
  // At 8:00 AM, customer books 10PM-11PM (window for 10PM opens at 10AM... but they're booking at 8AM)
  // This seems contradictory. Let me interpret it as:
  // - You can book up to 12 hours in advance (not more)
  // - The window opens 12 hours before start, and stays open until start time
  // - Example: 7AM booking for 7PM means you can book exactly at the 12h mark
  
  // Validation: startTime cannot be more than 12 hours away
  // Wait no - re-reading: "customer can book starting exactly 12 hours before start time"
  // The window opens at startTime - 12h and closes at startTime
  
  // Actually the most sensible interpretation:
  // - Advance booking window = 12 hours
  // - You CAN book up to 12h before start
  // - You CANNOT book if start is more than 12h away
  // No wait... Let me re-read one more time.
  
  // "A customer can book a parking slot starting exactly 12 hours before the requested parking start time."
  // "The customer cannot book the slot before the 12-hour booking window opens."
  // 
  // This clearly states the window opens 12h before. You CANNOT book before it opens.
  // But after it opens, you can book anytime until start time.
  //
  // B29a: Minimum lead time - booking must be made at least minBookingLeadMinutes before start
  
  // Check if we're within the booking window (12h before start to start time)
  const bookingWindowOpenTime = new Date(startTime.getTime() - advanceBookingHours * 60 * 60 * 1000)
  
  // The booking window closes at the start time
  // The booking window opens 12h before start time
  // We are checking: can the customer book NOW for this time slot?
  // The window is: [startTime - 12h, startTime]
  // If now < startTime - 12h, the window hasn't opened yet - CANNOT book
  // If now >= startTime - 12h and now < startTime, the window is open - CAN book
  // But we also need minimum lead time
  
  if (now < bookingWindowOpenTime) {
    const minutesUntilWindow = Math.ceil((bookingWindowOpenTime.getTime() - now.getTime()) / (1000 * 60))
    throw new Error(
      `Booking opens ${advanceBookingHours} hours before the scheduled start time. ` +
      `You can book this slot starting at ${bookingWindowOpenTime.toLocaleString()} ` +
      `(${minutesUntilWindow} minutes from now)`
    )
  }
  
  // B29a: Minimum lead time validation - must book at least minBookingLeadMinutes before start
  const minLeadTime = new Date(now.getTime() + minBookingLeadMinutes * 60 * 1000)
  if (startTime < minLeadTime) {
    throw new Error(`Booking must be made at least ${minBookingLeadMinutes} minutes in advance`)
  }
  
  // Validate booking duration
  const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60)
  if (durationMinutes < minBookingDurationMinutes) {
    throw new Error(`Booking duration must be at least ${minBookingDurationMinutes} minutes`)
  }
  if (durationMinutes > maxBookingDurationMinutes) {
    throw new Error(`Booking duration cannot exceed ${maxBookingDurationMinutes} minutes`)
  }
}

/**
 * Hold a slot for checkout with a temporary lock
 * Uses Prisma transaction to prevent race conditions
 * B6: Implements temporary payment hold
 */
export async function holdSlotForCheckout(input: HoldSlotInput) {
  // Validate input
  const validated = holdSlotSchema.parse(input)
  
  const {
    userId,
    siteId,
    floorId,
    zoneId,
    bayType,
    isAccessible,
    startTime,
    endTime,
    vehicleNumber,
    vehicleType,
    idempotencyKey,
  } = validated
  
  const startDateTime = typeof startTime === "string" ? new Date(startTime) : startTime
  const endDateTime = typeof endTime === "string" ? new Date(endTime) : endTime
  
  // B2 & B29a: Validate booking time against lot configuration
  await validateBookingTime(siteId, startDateTime, endDateTime)
  
  // B6: Use lot config for hold timer duration
  const lotConfig = await getLotConfig(siteId)
  const paymentHoldMinutes = lotConfig?.paymentHoldMinutes ?? 5
  const lockExpiresAt = new Date(Date.now() + paymentHoldMinutes * 60 * 1000)
  
  // Calculate duration in hours for pricing
  const durationHours = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60)
  
  // Calculate dynamic price using pricing engine
  const { calculateDynamicPrice } = await import("@/lib/ml/pricing-engine")
  const pricing = await calculateDynamicPrice({
    siteId,
    bayType: bayType as any,
    durationHours,
    startTime: startDateTime,
  })
  
  const totalAmount = Math.round(pricing.totalPrice)
  
  // B27a: Check idempotency before proceeding
  if (idempotencyKey) {
    const existingResult = await checkIdempotency("HOLD_SLOT", idempotencyKey)
    if (existingResult) {
      return existingResult.booking
    }
  }
  
  // Use transaction to prevent race conditions
  const result = await prisma.$transaction(async (tx) => {
    // Find an available bay
    const parkingBayId = await findAvailableBay({
      siteId,
      floorId,
      zoneId,
      bayType,
      isAccessible,
      vehicleType,
      startTime: startDateTime,
      endTime: endDateTime,
    })
    
    if (!parkingBayId) {
      throw new Error("No available parking bays matching your criteria")
    }
    
    // Double-check availability within transaction using overlap logic
    const hasConflict = await checkTimeOverlap(parkingBayId, startDateTime, endDateTime)
    
    if (hasConflict) {
      throw new Error("Selected slot is no longer available")
    }
    
    // Create the booking with lock
    const booking = await tx.booking.create({
      data: {
        customerId: userId,
        ownerId: userId,
        parkingLotId: siteId,
        slotId: parkingBayId,
        status: booking_status.HELD,
        startTime: startDateTime,
        endTime: endDateTime,
        vehicleNumber: vehicleNumber || "UNREGISTERED",
        vehicleType: vehicleType || "CAR",
        amount: totalAmount,
        lockExpiresAt,
        idempotencyKey,
      },
      include: {
        parkingBay: {
          include: {
            zone: {
              include: {
                floor: true,
              },
            },
          },
        },
      },
    })
    
    // B27a: Store idempotency result
    if (idempotencyKey) {
      await storeIdempotency("HOLD_SLOT", userId, idempotencyKey, { booking }, paymentHoldMinutes / 60)
    }
    
    return booking
  })
  
  return result
}

/**
 * Allocate the optimal slot based on requirements
 * Implements intelligent slot selection algorithm
 */
export async function allocateOptimalSlot(
  siteId: string,
  requirements: {
    vehicleType?: string
    bayType?: BayType
    isAccessible?: boolean
    preferredFloor?: number
    preferredZone?: string
    startTime?: Date
    endTime?: Date
  }
) {
  const { vehicleType, bayType, isAccessible, preferredFloor, preferredZone, startTime, endTime } = requirements
  
  // Try to find bay in preferred zone first
  if (preferredZone) {
    const zone = await prisma.zone.findFirst({
      where: {
        zoneName: preferredZone,
        floor: {
          siteId,
        },
      },
    })
    
    if (zone) {
      const bayId = await findAvailableBay({
        siteId,
        zoneId: zone.id,
        bayType,
        isAccessible,
        vehicleType,
        startTime,
        endTime,
      })
      
      if (bayId) {
        return { bayId, zoneId: zone.id, algorithm: "preferred_zone" }
      }
    }
  }
  
  // Try preferred floor
  if (preferredFloor) {
    const floor = await prisma.floor.findFirst({
      where: {
        levelNumber: preferredFloor,
        siteId,
      },
    })
    
    if (floor) {
      const bayId = await findAvailableBay({
        siteId,
        floorId: floor.id,
        bayType,
        isAccessible,
        vehicleType,
        startTime,
        endTime,
      })
      
      if (bayId) {
        return { bayId, floorId: floor.id, algorithm: "preferred_floor" }
      }
    }
  }
  
  // Fall back to any available bay on the site
  const bayId = await findAvailableBay({
    siteId,
    bayType,
    isAccessible,
    vehicleType,
    startTime,
    endTime,
  })
  
  if (bayId) {
    return { bayId, algorithm: "site_wide" }
  }
  
  throw new Error("No available slots found matching your requirements")
}

/**
 * Release expired locks - cleanup function
 * Should be called periodically (e.g., every minute)
 * B6: HELD -> EXPIRED, releases slot back to AVAILABLE
 */
export async function releaseExpiredLocks(now: Date = new Date()): Promise<number> {
  const expiredBookings = await prisma.booking.findMany({
    where: {
      status: booking_status.HELD,
      lockExpiresAt: {
        lt: now,
      },
    },
    select: { id: true, parkingBayId: true }
  })

  if (expiredBookings.length === 0) {
    return 0
  }

  await prisma.$transaction(async (tx) => {
    for (const booking of expiredBookings) {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: booking_status.EXPIRED,
          lockExpiresAt: null,
        }
      })

      // Release the slot back to AVAILABLE
      if (booking.parkingBayId) {
        await tx.slot.update({
          where: { id: booking.parkingBayId },
          data: { status: slot_status.AVAILABLE, updatedAt: new Date() }
        })

        // Log allocation history release
        await tx.slotallocationhistory.updateMany({
          where: {
            bookingId: booking.id,
            slotId: booking.parkingBayId,
            releasedAt: null
          },
          data: { releasedAt: now }
        })
      }
    }
  })
  
  return expiredBookings.length
}

/**
 * Cancel a booking and release the slot
 * B34: Configurable cancellation policy with refund calculation
 */
export async function cancelBooking(bookingId: string, userId: string): Promise<void> {
  const now = new Date()
  
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      parkingBay: true,
    }
  })

  if (!booking) {
    throw new Error("Booking not found")
  }

  // Check if user owns the booking
  if (booking.customerId !== userId) {
    throw new Error("You can only cancel your own bookings")
  }

  // Get lot config for cancellation policy
  const lotConfig = await getLotConfig(booking.parkingLotId)
  
  // Calculate refund eligibility
  const startTime = new Date(booking.startTime)
  const timeUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60)
  
  let refundAmount = 0
  let cancellationStatus = "CANCELLED"
  
  if (timeUntilStart > 0) {
    // Booking is in the future - check cancellation policy
    const cancellationPolicy = lotConfig?.cancellationPolicy
    if (cancellationPolicy) {
      try {
        const policy = JSON.parse(cancellationPolicy)
        const thresholdMinutes = policy.earlyCancellationThresholdMinutes || 60
        
        if (timeUntilStart > thresholdMinutes) {
          // Early cancellation - full or partial refund
          refundAmount = booking.amount * ((policy.earlyRefundPercentage || 90) / 100)
        } else if (timeUntilStart > 0) {
          // Late cancellation - partial or no refund
          refundAmount = booking.amount * ((policy.lateRefundPercentage || 10) / 100)
        }
      } catch (e) {
        // If policy parsing fails, default to no refund
        console.warn("Failed to parse cancellation policy", e)
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    // Update status to CANCELLED
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: booking_status.CANCELLED,
        lockExpiresAt: null,
        refundAmount: refundAmount > 0 ? refundAmount : undefined,
      }
    })

    // Release the slot back to AVAILABLE
    if (booking.parkingBayId) {
      await tx.slot.update({
        where: { id: booking.parkingBayId },
        data: { status: slot_status.AVAILABLE, updatedAt: new Date() }
      })
    }

    // Log allocation history release
    if (booking.parkingBayId) {
      await tx.slotallocationhistory.updateMany({
        where: {
          bookingId,
          slotId: booking.parkingBayId,
          releasedAt: null
        },
        data: { releasedAt: now }
      })
    }

    // Process refund if applicable
    if (refundAmount > 0) {
      const payment = await tx.payment.findFirst({
        where: { bookingId }
      })
      
      if (payment && payment.status === "COMPLETED") {
        await tx.refund.create({
          data: {
            id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            paymentId: payment.id,
            amount: refundAmount,
            reason: "CANCELLATION"
          }
        })
        
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "REFUNDED" }
        })
      }
    }
  })
}

/**
 * Confirm a booking (after successful payment)
 * B7-B8: HELD -> CONFIRMED
 */
export async function confirmBooking(bookingId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { parkingBay: true }
    })

    if (!booking) {
      throw new Error("Booking not found")
    }

    // Update booking status to CONFIRMED
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: booking_status.CONFIRMED,
        lockExpiresAt: null,
      }
    })

    // Update slot status to RESERVED
    if (booking.parkingBayId) {
      await tx.slot.update({
        where: { id: booking.parkingBayId },
        data: {
          status: slot_status.RESERVED,
          updatedAt: new Date()
        }
      })
    }

    // Log allocation history
    if (booking.parkingBayId) {
      await tx.slotallocationhistory.create({
        data: {
          id: `sah_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          bookingId,
          slotId: booking.parkingBayId,
          allocationType: "CONFIRMED"
        }
      })
    }
  })
}

/**
 * Get user's bookings
 */
export async function getUserBookings(userId: string) {
  const bookings = await prisma.booking.findMany({
    where: {
      customerId: userId,
    },
    include: {
      parkingBay: {
        include: {
          zone: {
            include: {
              floor: {
                include: {
                  parkingsite: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      startTime: "desc",
    },
  })
  
  return bookings
}

/**
 * Get site occupancy breakdown
 */
export async function getSiteOccupancy(siteId: string) {
  const site = await prisma.parkingsite.findUnique({
    where: { id: siteId },
    include: {
      floor: {
        include: {
          zone: {
            include: {
              parkingbay: true,
            },
          },
        },
      },
    },
  })
  
  if (!site) {
    throw new Error("Site not found")
  }
  
  // Calculate occupancy
  let totalBays = 0
  let occupiedBays = 0
  let reservedBays = 0
  let availableAccessibleBays = 0
  
  const floorBreakdown: any[] = []
  
  for (const floor of site.floor) {
    let floorTotal = 0
    let floorOccupied = 0
    let floorReserved = 0
    
    for (const zone of floor.zone) {
      for (const bay of zone.parkingbay) {
        floorTotal++
        totalBays++
        
        if (bay.status === "OCCUPIED") {
          floorOccupied++
          occupiedBays++
        } else if (bay.status === "RESERVED") {
          floorReserved++
          reservedBays++
        }
        
        if (bay.isAccessible && bay.status === "AVAILABLE") {
          availableAccessibleBays++
        }
      }
    }
    
    floorBreakdown.push({
      floorId: floor.id,
      floorName: floor.levelName,
      levelNumber: floor.levelNumber,
      totalBays: floorTotal,
      occupiedBays: floorOccupied,
      reservedBays: floorReserved,
      availableBays: floorTotal - floorOccupied - floorReserved,
    })
  }
  
  const availabilityPercentage = totalBays > 0 
    ? ((totalBays - occupiedBays - reservedBays) / totalBays) * 100 
    : 0
  
  return {
    siteId: site.id,
    siteName: site.name,
    totalBays,
    occupiedBays,
    reservedBays,
    availableBays: totalBays - occupiedBays - reservedBays,
    availableAccessibleBays,
    availabilityPercentage: Math.round(availabilityPercentage * 100) / 100,
    floorBreakdown,
  }
}

// ============== ENHANCED BOOKING ENGINE FUNCTIONS ==============

/**
 * Check for overlapping bookings on a slot (time-range based)
 * B3-B5: Overlap and consecutive booking rules
 * Uses the standard overlap formula: startA < endB AND endA > startB
 */
export async function checkTimeOverlap(
  slotId: string,
  startTime: Date,
  endTime: Date,
  excludeBookingId?: string
): Promise<boolean> {
  const where: any = {
    slotId,
    status: { in: [booking_status.CONFIRMED, booking_status.ACTIVE, booking_status.HELD] },
    AND: [
      { startTime: { lt: endTime } },
      { endTime: { gt: startTime } },
    ]
  }

  if (excludeBookingId) {
    where.NOT = { id: excludeBookingId }
  }

  const count = await prisma.booking.count(where)
  return count > 0
}

/**
 * Get the lot configuration for a parking site
 */
export async function getLotConfig(siteId: string) {
  let lotConfig = await prisma.lotconfig.findUnique({
    where: { lotId: siteId }
  })

  if (!lotConfig) {
    const parkingLot = await prisma.parkinglot.findUnique({
      where: { id: siteId }
    })
    if (parkingLot) {
      lotConfig = await prisma.lotconfig.findUnique({
        where: { lotId: parkingLot.id }
      })
    }
  }

  return lotConfig
}

/**
 * B2: Validate 12-hour advance booking window
 * The booking window opens exactly 12 hours before the requested start time
 */
export async function validateAdvanceBookingWindow(
  siteId: string,
  startTime: Date,
  endTime: Date
): Promise<void> {
  const now = new Date()
  
  // Validate start time is in the future
  if (startTime <= now) {
    throw new Error("Booking start time must be in the future")
  }

  // Validate end time is after start time
  if (endTime <= startTime) {
    throw new Error("End time must be after start time")
  }

  const lotConfig = await getLotConfig(siteId)
  const advanceBookingHours = lotConfig?.advanceBookingHours ?? 12

  // B2: The booking window opens 12 hours before the requested start time
  // So the earliest you can book for a future time slot is 12 hours before
  const bookingWindowOpenTime = new Date(now.getTime() + advanceBookingHours * 60 * 60 * 1000)
  
  if (startTime > bookingWindowOpenTime) {
    const hoursUntilWindow = Math.ceil((startTime.getTime() - bookingWindowOpenTime.getTime()) / (1000 * 60 * 60))
    throw new Error(
      `Booking opens ${advanceBookingHours} hours before scheduled start. ` +
      `You can book this slot starting at ${bookingWindowOpenTime.toLocaleString()}`
    )
  }

  // B29a: Minimum lead time validation
  const minBookingLeadMinutes = lotConfig?.minBookingLeadMinutes ?? 15
  const minLeadTime = new Date(now.getTime() + minBookingLeadMinutes * 60 * 1000)
  if (startTime < minLeadTime) {
    throw new Error(`Booking must be made at least ${minBookingLeadMinutes} minutes in advance`)
  }

  // Validate booking duration
  const minBookingDurationMinutes = lotConfig?.minBookingDurationMinutes ?? 30
  const maxBookingDurationMinutes = lotConfig?.maxBookingDurationMinutes ?? 720
  
  const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60)
  if (durationMinutes < minBookingDurationMinutes) {
    throw new Error(`Booking duration must be at least ${minBookingDurationMinutes} minutes`)
  }
  if (durationMinutes > maxBookingDurationMinutes) {
    throw new Error(`Booking duration cannot exceed ${maxBookingDurationMinutes} minutes`)
  }
}

/**
 * Calculate check-in grace period based on booking duration
 * gracePeriod = bookingDuration / 6, capped at min 5min max 30min
 */
export function calculateCheckInGrace(bookingStart: Date, bookingEnd: Date, lotConfig?: any): {
  gracePeriodMinutes: number
  gracePeriodEnd: Date
} {
  const checkinGraceDivisor = lotConfig?.checkinGraceDivisor ?? 6
  const minCheckinGraceMinutes = lotConfig?.minCheckinGraceMinutes ?? 5
  const maxCheckinGraceMinutes = lotConfig?.maxCheckinGraceMinutes ?? 30

  const bookingDurationMinutes = (bookingEnd.getTime() - bookingStart.getTime()) / (1000 * 60)
  let gracePeriodMinutes = Math.floor(bookingDurationMinutes / checkinGraceDivisor)
  gracePeriodMinutes = Math.max(minCheckinGraceMinutes, Math.min(maxCheckinGraceMinutes, gracePeriodMinutes))
  
  const gracePeriodEnd = new Date(bookingStart.getTime() + gracePeriodMinutes * 60 * 1000)

  return { gracePeriodMinutes, gracePeriodEnd }
}

/**
 * Calculate checkout/late checkout grace period
 * Uses same formula as check-in grace
 */
export function calculateLateCheckoutGrace(bookingStart: Date, bookingEnd: Date, lotConfig?: any): number {
  const { gracePeriodMinutes } = calculateCheckInGrace(bookingStart, bookingEnd, lotConfig)
  return gracePeriodMinutes
}

/**
 * B20-B21: Temporary Slot Reassignment
 * Finds a compatible slot when the original slot is unavailable due to overstay
 */
export async function findTemporarySlot(
  originalSlotId: string,
  bookingId: string,
  scheduledStart: Date,
  scheduledEnd: Date,
  siteId: string
): Promise<{ slot: any, reason: string } | null> {
  // Get the original slot to match type/compatibility
  const originalSlot = await prisma.slot.findUnique({
    where: { id: originalSlotId }
  })

  if (!originalSlot) return null

  // Find compatible slots in the same lot
  const compatibleSlots = await prisma.slot.findMany({
    where: {
      lotId: siteId,
      status: slot_status.AVAILABLE,
      slotType: originalSlot.slotType, // Match slot type (EV, regular, etc.)
    },
    include: {
      bookings: {
        where: {
          status: { in: [booking_status.CONFIRMED, booking_status.ACTIVE, booking_status.HELD] },
          OR: [
            { startTime: { lt: scheduledEnd }, endTime: { gt: scheduledStart } }
          ]
        }
      }
    },
    orderBy: [
      // Prefer nearby slots (same zone if possible)
      { zoneCode: "asc" },
      { slotNumber: "asc" }
    ],
    take: 50
  })

  // Find first slot with no overlapping bookings
  for (const candidateSlot of compatibleSlots) {
    if (candidateSlot.bookings.length === 0) {
      return { slot: candidateSlot, reason: "PREVIOUS_SLOT_UNAVAILABLE" }
    }
  }

  return null
}

/**
 * B17-B19: Handle consecutive booking conflict when previous customer overstays
 * This implements the temporary slot reassignment workflow
 */
export async function handleConsecutiveBookingConflict(
  incomingBookingId: string,
  now: Date
): Promise<{ reassigned: boolean; newSlotId?: string } | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: incomingBookingId },
    include: { slot: true, parkinglot: true }
  })

  if (!booking || booking.status !== booking_status.ACTIVE || booking.allocatedSlotId) {
    return null
  }

  const originalSlotId = booking.slotId
  if (!originalSlotId) return null

  // Check if previous booking is still occupying this slot
  const previousBooking = await prisma.booking.findFirst({
    where: {
      id: { not: incomingBookingId },
      slotId: originalSlotId,
      status: booking_status.ACTIVE,
      endTime: { lte: now }, // Previous booking's end time has passed
      actualCheckOut: null
    }
  })

  if (previousBooking) {
    // Previous customer is overstaying
    // Mark them as OVERSTAY
    await prisma.booking.update({
      where: { id: previousBooking.id },
      data: {
        status: booking_status.OVERSTAY,
        overstayAmount: 0 // Will be calculated on actual checkout
      }
    })

    // Find a temporary compatible slot for the incoming booking
    const tempSlot = await findTemporarySlot(
      originalSlotId,
      incomingBookingId,
      new Date(booking.startTime),
      new Date(booking.endTime),
      booking.parkingLotId
    )

    if (tempSlot) {
      // Assign the temporary slot
      await prisma.booking.update({
        where: { id: incomingBookingId },
        data: {
          allocatedSlotId: tempSlot.slot.id,
          temporaryReassignmentReason: "PREVIOUS_SLOT_UNAVAILABLE"
        }
      })

      // Log the allocation
      await prisma.slotallocationhistory.create({
        data: {
          id: `sah_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          bookingId: incomingBookingId,
          slotId: tempSlot.slot.id,
          allocationType: "TEMPORARY_REASSIGNMENT",
          reason: "PREVIOUS_SLOT_UNAVAILABLE"
        }
      })

      return { reassigned: true, newSlotId: tempSlot.slot.id }
    }
  }

  return null
}

/**
 * B46: Process no-shows for bookings where grace period has expired
 * Should be called as a cron job / background task
 */
export async function processNoShows(now: Date = new Date()): Promise<number> {
  const lotConfigs = await prisma.lotconfig.findMany()
  
  let noShowCount = 0
  
  for (const lotConfig of lotConfigs) {
    // Find confirmed bookings that should have started but no check-in happened
    const bookings = await prisma.booking.findMany({
      where: {
        status: booking_status.CONFIRMED,
        startTime: { lt: now },
        actualCheckIn: null
      },
      include: { parkingBay: true }
    })

    for (const booking of bookings) {
      const { gracePeriodEnd } = calculateCheckInGrace(
        new Date(booking.startTime),
        new Date(booking.endTime),
        lotConfig
      )

      if (now > gracePeriodEnd) {
        await prisma.$transaction(async (tx) => {
          // Mark as NO_SHOW
          await tx.booking.update({
            where: { id: booking.id },
            data: {
              status: booking_status.NO_SHOW,
              fineAmount: lotConfig.noShowFine
            }
          })

          // Release the slot
          if (booking.parkingBayId) {
            await tx.slot.update({
              where: { id: booking.parkingBayId },
              data: { status: slot_status.AVAILABLE, updatedAt: new Date() }
            })

            // Log allocation history release
            await tx.slotallocationhistory.updateMany({
              where: {
                bookingId: booking.id,
                slotId: booking.parkingBayId,
                releasedAt: null
              },
              data: { releasedAt: now }
            })
          }
        })

        noShowCount++
      }
    }
  }

  return noShowCount
}

/**
 * B46: Release expired payment holds and process them
 */
export async function releaseExpiredHolds(now: Date = new Date()): Promise<number> {
  const expiredBookings = await prisma.booking.updateMany({
    where: {
      status: booking_status.HELD,
      lockExpiresAt: { lt: now }
    },
    data: {
      status: booking_status.EXPIRED,
      lockExpiresAt: null
    }
  })

  return expiredBookings.count
}

/**
 * B45: Booking Extension
 * Extends a booking only if the additional time is available
 */
export async function extendBooking(
  bookingId: string,
  userId: string,
  newEndTime: Date
): Promise<any> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { slot: true }
  })

  if (!booking) {
    throw new Error("Booking not found")
  }

  if (booking.customerId !== userId) {
    throw new Error("FORBIDDEN")
  }

  if (booking.status !== "ACTIVE") {
    throw new Error("Cannot extend booking - not in ACTIVE status")
  }

  if (newEndTime <= booking.endTime) {
    throw new Error("New end time must be after current end time")
  }

  const slotId = booking.allocatedSlotId || booking.slotId

  // Check if the extension period is available
  const hasConflict = await checkTimeOverlap(
    slotId!,
    new Date(booking.endTime),
    newEndTime,
    bookingId
  )

  if (hasConflict) {
    throw new Error("Extension conflicts with another booking")
  }

  // Get lot config
  const lotConfig = await getLotConfig(booking.parkingLotId)
  const maxBookingDurationMinutes = lotConfig?.maxBookingDurationMinutes ?? 720
  const minBookingDurationMinutes = lotConfig?.minBookingDurationMinutes ?? 30

  // Validate extended duration
  const extendedDurationMinutes = (newEndTime.getTime() - booking.startTime.getTime()) / (1000 * 60)
  if (extendedDurationMinutes > maxBookingDurationMinutes) {
    throw new Error(`Extended booking cannot exceed ${maxBookingDurationMinutes} minutes`)
  }

  // Calculate additional cost
  const additionalHours = (newEndTime.getTime() - booking.endTime.getTime()) / (1000 * 60 * 60)
  const { calculateDynamicPrice } = await import("@/lib/ml/pricing-engine")
  const pricing = await calculateDynamicPrice({
    siteId: booking.parkingLotId,
    bayType: (booking.slot?.slotType as any) || undefined,
    durationHours: additionalHours,
    startTime: new Date(booking.endTime)
  })

  const additionalAmount = Math.round(pricing.totalPrice)

  // Update booking
  const updatedBooking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      endTime: newEndTime,
      amount: booking.amount + additionalAmount
    }
  })

  return updatedBooking
}

/**
 * B30-B31: Calculate overstay charges with hard cutoff protection
 */
export function calculateOverstayCharges(
  bookingEnd: Date,
  actualCheckOut: Date,
  nextBookingStart: Date | null,
  lotConfig?: any
): {
  isOverstay: boolean
  overstayMinutes: number
  overstayAmount: number
  hardCutoff: boolean
} {
  const now = actualCheckOut
  const overstayBlockMinutes = lotConfig?.overstayBlockMinutes ?? 30
  const overstayRatePerBlock = lotConfig?.overstayRatePerBlock ?? 30
  const overstayMaxChargeMultiple = lotConfig?.overstayMaxChargeMultiple ?? 4
  const overstayMinMaxCharge = lotConfig?.overstayMinMaxCharge ?? 200

  // Determine hard cutoff
  let hardCutoff = false
  let cutoffTime = bookingEnd

  if (nextBookingStart) {
    // If there's a next booking, the end time is a hard cutoff
    hardCutoff = true
    cutoffTime = bookingEnd
  } else {
    // Otherwise use late checkout grace period
    const lateCheckoutGrace = calculateLateCheckoutGrace(bookingEnd, bookingEnd, lotConfig)
    cutoffTime = new Date(bookingEnd.getTime() + lateCheckoutGrace * 60 * 1000)
  }

  if (now <= cutoffTime) {
    return { isOverstay: false, overstayMinutes: 0, overstayAmount: 0, hardCutoff: false }
  }

  const overstayMinutes = Math.floor((now.getTime() - cutoffTime.getTime()) / (1000 * 60))
  const overstayBlocks = Math.ceil(overstayMinutes / overstayBlockMinutes)
  let overstayAmount = overstayBlocks * overstayRatePerBlock

  // Cap at max multiple of booking amount or min charge, whichever is lower
  const maxCharge = Math.min(
    overstayMaxChargeMultiple * 0, // Will be set by caller
    overstayMinMaxCharge
  )
  
  return {
    isOverstay: true,
    overstayMinutes,
    overstayAmount: Math.min(overstayAmount, maxCharge),
    hardCutoff
  }
}

/**
 * B26-B28: Calculate early checkout refund
 */
export function calculateEarlyCheckoutRefund(
  scheduledStart: Date,
  scheduledEnd: Date,
  actualCheckIn: Date | null,
  actualCheckOut: Date,
  bookingAmount: number,
  lotConfig?: any
): {
  usagePercentage: number
  isRefundEligible: boolean
  unusedAmount: number
  refundAmount: number
} {
  const refundUsageThreshold = lotConfig?.refundUsageThreshold ?? 80
  const minRefundAmount = lotConfig?.minRefundAmount ?? 10

  const bookedDurationMinutes = (scheduledEnd.getTime() - scheduledStart.getTime()) / (1000 * 60)
  const checkInTime = actualCheckIn || scheduledStart
  const actualUsedMinutes = Math.max(0, (actualCheckOut.getTime() - checkInTime.getTime()) / (1000 * 60))

  const usagePercentage = bookedDurationMinutes > 0 
    ? (actualUsedMinutes / bookedDurationMinutes) * 100 
    : 0

  const isRefundEligible = usagePercentage < refundUsageThreshold
  const unusedPercentage = Math.max(0, 100 - usagePercentage)
  const unusedAmount = bookingAmount * (unusedPercentage / 100)
  const refundAmount = unusedAmount >= minRefundAmount ? unusedAmount : 0

  return {
    usagePercentage,
    isRefundEligible,
    unusedAmount,
    refundAmount
  }
}

/**
 * B30: Get next available time for a slot
 */
export async function getNextAvailableTime(
  slotId: string,
  fromTime: Date = new Date()
): Promise<{ nextAvailable: Date | null, reason: string } | null> {
  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
    include: {
      bookings: {
        where: {
          status: { in: [booking_status.CONFIRMED, booking_status.ACTIVE] },
          endTime: { gt: fromTime }
        },
        orderBy: { endTime: "asc" }
      }
    }
  })

  if (!slot) return null

  if (slot.bookings.length === 0) {
    return { nextAvailable: fromTime, reason: "SLOT_AVAILABLE" }
  }

  // Find the first gap where the slot is free
  const lotConfig = await getLotConfig(slot.lotId)
  const turnoverBuffer = lotConfig?.turnoverBufferMinutes ?? 5

  let lastEndTime = fromTime
  for (const booking of slot.bookings) {
    const bookingStart = new Date(booking.startTime)
    if (bookingStart > lastEndTime) {
      // There's a gap
      return { 
        nextAvailable: new Date(lastEndTime.getTime() + turnoverBuffer * 60 * 1000),
        reason: "GAP_BEFORE_NEXT_BOOKING" 
      }
    }
    lastEndTime = new Date(booking.endTime)
  }

  return { nextAvailable: lastEndTime, reason: "AFTER_ALL_BOOKINGS" }
}

/**
 * B30: Get compatible available slots for a time range
 */
export async function getAvailableSlots(
  siteId: string,
  startTime: Date,
  endTime: Date,
  vehicleType?: string,
  bayType?: string
): Promise<any[]> {
  const lotConfig = await getLotConfig(siteId)
  const turnoverBuffer = lotConfig?.turnoverBufferMinutes ?? 5

  const where: any = {
    lotId: siteId,
    status: "AVAILABLE",
  }

  if (bayType) {
    where.slotType = bayType
  }

  const slots = await prisma.slot.findMany({
    where,
    include: {
      bookings: {
        where: {
          status: { in: [booking_status.CONFIRMED, booking_status.ACTIVE, booking_status.HELD] },
          OR: [
            { AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }] }
          ]
        }
      },
      _count: {
        select: { bookings: true }
      }
    }
  })

  // Filter to only slots with no conflicting bookings
  return slots.filter(slot => slot.bookings.length === 0)
}

/**
 * B15: Apply no-show fine
 */
export async function applyNoShowFine(bookingId: string, fineAmount: number): Promise<void> {
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "NO_SHOW",
      fineAmount
    }
  })
}

/**
 * B29: Process payment success and confirm booking
 * This handles the payment -> booking confirmation lifecycle
 */
export async function confirmBookingFromPayment(
  bookingId: string,
  paymentId: string,
  paymentStatus: "COMPLETED" | "FAILED"
): Promise<any> {
  return await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId }
    })

    if (!booking) {
      throw new Error("Booking not found")
    }

    if (paymentStatus === "COMPLETED") {
      // Confirm the booking
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: booking_status.CONFIRMED,
          lockExpiresAt: null,
          paymentStatus: "COMPLETED"
        }
      })

      // Update payment record
      await tx.payment.updateMany({
        where: { bookingId },
        data: {
          status: "COMPLETED",
          confirmedAt: new Date()
        }
      })

      // Set slot status to RESERVED
      if (booking.slotId) {
        await tx.slot.update({
          where: { id: booking.slotId },
          data: {
            status: slot_status.RESERVED,
            updatedAt: new Date()
          }
        })
      }

      // Log allocation history
      if (booking.slotId) {
        await tx.slotallocationhistory.create({
          data: {
            id: `sah_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            bookingId,
            slotId: booking.slotId,
            allocationType: "CONFIRMED"
          }
        })
      }

      return updatedBooking
    } else {
      // Payment failed - release the hold
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: booking_status.PAYMENT_FAILED,
          lockExpiresAt: null,
          paymentStatus: "FAILED"
        }
      })

      // Release the slot
      if (booking.slotId) {
        await tx.slot.update({
          where: { id: booking.slotId },
          data: { status: slot_status.AVAILABLE, updatedAt: new Date() }
        })
      }

      return updatedBooking
    }
  })
}

/**
 * B35: Handle slot maintenance
 * Blocks a slot and reassigns affected future bookings
 */
export async function handleSlotMaintenance(
  slotId: string,
  maintenanceStart: Date,
  maintenanceEnd: Date
): Promise<{ affectedBookings: string[], reassignedBookings: string[] }> {
  return await prisma.$transaction(async (tx) => {
    // Mark slot as under maintenance (but blocked to prevent new bookings)
    await tx.slot.update({
      where: { id: slotId },
      data: { status: slot_status.MAINTENANCE, updatedAt: new Date() }
    })

    // Find affected bookings in the maintenance window
    const affectedBookings = await tx.booking.findMany({
      where: {
        slotId,
        status: booking_status.CONFIRMED,
        startTime: { lt: maintenanceEnd },
        endTime: { gt: maintenanceStart }
      },
      include: { slot: true }
    })

    const reassignedBookings: string[] = []

    for (const booking of affectedBookings) {
      // Try to find a compatible alternative slot
      const tempSlot = await findTemporarySlot(
        slotId,
        booking.id,
        new Date(booking.startTime),
        new Date(booking.endTime),
        booking.parkingLotId
      )

      if (tempSlot) {
        // Reassign to temporary slot
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            allocatedSlotId: tempSlot.slot.id,
            temporaryReassignmentReason: "SLOT_MAINTENANCE"
          }
        })

        // Log the allocation
        await tx.slotallocationhistory.create({
          data: {
            id: `sah_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            bookingId: booking.id,
            slotId: tempSlot.slot.id,
            allocationType: "MAINTENANCE_REASSIGNMENT",
            reason: "SLOT_MAINTENANCE"
          }
        })

        reassignedBookings.push(booking.id)
      }
    }

    return {
      affectedBookings: affectedBookings.map(b => b.id),
      reassignedBookings
    }
  })
}

/**
 * B30: Calculate real-time availability for a parking lot
 */
export async function calculateAvailability(
  siteId: string,
  startTime: Date,
  endTime: Date
): Promise<{
  totalSlots: number
  availableSlots: number
  reservedSlots: number
  occupiedSlots: number
  maintenanceSlots: number
  blockedSlots: number
  availableSlotList: string[]
}> {
  const slots = await prisma.slot.findMany({
    where: { lotId: siteId },
    include: {
      bookings: {
        where: {
          status: { in: [booking_status.CONFIRMED, booking_status.ACTIVE, booking_status.HELD] },
          OR: [
            { AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }] }
          ]
        }
      }
    }
  })

  const totalSlots = slots.length
  const availableSlotList: string[] = []
  let availableSlots = 0
  let reservedSlots = 0
  let occupiedSlots = 0
  let maintenanceSlots = 0
  let blockedSlots = 0

  for (const slot of slots) {
    const hasConflictingBooking = slot.bookings.length > 0

    switch (slot.status) {
      case slot_status.AVAILABLE:
        if (!hasConflictingBooking) {
          availableSlots++
          availableSlotList.push(slot.id)
        } else {
          reservedSlots++
        }
        break
      case slot_status.RESERVED:
        reservedSlots++
        break
      case slot_status.OCCUPIED:
        occupiedSlots++
        break
      case slot_status.MAINTENANCE:
        maintenanceSlots++
        break
      case slot_status.BLOCKED:
        blockedSlots++
        break
    }
  }

  return {
    totalSlots,
    availableSlots,
    reservedSlots,
    occupiedSlots,
    maintenanceSlots,
    blockedSlots,
    availableSlotList
  }
}

/**
 * B27a: Idempotency helper for booking operations
 */
export async function checkIdempotency(
  actionType: string,
  idempotencyKey: string
): Promise<any | null> {
  const key = await prisma.idempotencykeys.findUnique({
    where: {
      actionType_idempotencyKey: {
        actionType,
        idempotencyKey
      }
    }
  })

  if (key && new Date(key.expiresAt) > new Date()) {
    return JSON.parse(key.result)
  }

  return null
}

/**
 * B27a: Store idempotency result
 */
export async function storeIdempotency(
  actionType: string,
  userId: string,
  idempotencyKey: string,
  result: any,
  expiryHours: number = 24
): Promise<void> {
  await prisma.idempotencykeys.create({
    data: {
      id: `idemp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      actionType,
      idempotencyKey,
      userId,
      result: JSON.stringify(result),
      expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000)
    }
  })
}