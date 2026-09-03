import { PrismaClient, booking_status } from "@prisma/client"
import { z } from "zod"

const prisma = new PrismaClient()

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

// Define BayType enum to match Prisma
enum BayType {
  STANDARD = "STANDARD",
  ACCESSIBLE = "ACCESSIBLE", 
  EV_CHARGING = "EV_CHARGING",
  VIP = "VIP",
  TWO_WHEELER = "TWO_WHEELER"
}

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
      status: "AVAILABLE",
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
 * B2: Advance window validation
 * B29a: Minimum lead time validation
 */
export async function validateBookingTime(
  siteId: string,
  startTime: Date,
  endTime: Date
): Promise<void> {
  const now = new Date()
  
  // Fetch lot configuration - try parkinglot first, then parkingsite
  let lotConfig = await prisma.lotconfig.findUnique({
    where: { lotId: siteId }
  })
  
  // If not found, try to find the parkinglot/site and get config
  if (!lotConfig) {
    // Try to find a parkinglot with this ID
    const parkingLot = await prisma.parkinglot.findUnique({
      where: { id: siteId }
    })
    if (parkingLot) {
      lotConfig = await prisma.lotconfig.findUnique({
        where: { lotId: parkingLot.id }
      })
    }
  }
  
  // Use defaults if config not found
  const advanceBookingHours = lotConfig?.advanceBookingHours ?? 12
  const minBookingLeadMinutes = lotConfig?.minBookingLeadMinutes ?? 15
  const minBookingDurationMinutes = lotConfig?.minBookingDurationMinutes ?? 30
  const maxBookingDurationMinutes = lotConfig?.maxBookingDurationMinutes ?? 720
  
  // B2: Advance window validation - booking cannot be too far in advance
  const maxAdvanceTime = new Date(now.getTime() + advanceBookingHours * 60 * 60 * 1000)
  if (startTime > maxAdvanceTime) {
    throw new Error(`Booking cannot be made more than ${advanceBookingHours} hours in advance`)
  }
  
  // B29a: Minimum lead time validation - booking cannot be too soon
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
  const lotConfig = await prisma.lotconfig.findUnique({
    where: { lotId: siteId }
  })
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
  
  // Use transaction to prevent race conditions
  const result = await prisma.$transaction(async (tx) => {
    // B27a: Idempotency check - must be INSIDE the same transaction as the booking write
    // This prevents the race condition where two concurrent requests with the same key
    // both pass the check before either writes the result
    if (idempotencyKey) {
      const existingKey = await tx.idempotencykeys.findUnique({
        where: {
          actionType_idempotencyKey: {
            actionType: "HOLD_SLOT",
            idempotencyKey
          }
        }
      })
      
      if (existingKey) {
        // Return the cached result instead of creating a duplicate
        const cachedResult = JSON.parse(existingKey.result)
        return cachedResult.booking
      }
    }
    
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
    
    // Double-check availability within transaction
    const isAvailable = await checkSlotAvailability(
      parkingBayId,
      startDateTime,
      endDateTime
    )
    
    if (!isAvailable) {
      throw new Error("Selected slot is no longer available")
    }
    
    // Create the booking with lock
    const booking = await tx.booking.create({
      data: {
        customerId: userId,
        ownerId: userId, // Assuming customer is also owner for now
        parkingLotId: siteId, // Using siteId as parkingLotId for compatibility
        parkingBayId,
        status: booking_status.HELD, // B6: Use HELD status for holds, not PENDING_PAYMENT
        startTime: startDateTime,
        endTime: endDateTime,
        vehicleNumber,
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
                floor: {
                  include: {
                    site: true,
                  },
                },
              },
            },
          },
        },
      },
    })
    
    // B27a: Store idempotency result - must be in the same transaction
    if (idempotencyKey) {
      try {
        await tx.idempotencykeys.create({
          data: {
            id: `idemp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            actionType: "HOLD_SLOT",
            idempotencyKey,
            userId,
            result: JSON.stringify({ booking }),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hour expiry
          }
        })
      } catch (error: any) {
        // If unique constraint violation occurs, another request won the race
        // Query for the existing record and return its cached result
        if (error.code === 'P2002') {
          const existingKey = await tx.idempotencykeys.findUnique({
            where: {
              actionType_idempotencyKey: {
                actionType: "HOLD_SLOT",
                idempotencyKey
              }
            }
          })
          if (existingKey) {
            const cachedResult = JSON.parse(existingKey.result)
            return cachedResult.booking
          }
        }
        throw error
      }
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
 */
export async function releaseExpiredLocks(): Promise<number> {
  const now = new Date()
  
  const expiredBookings = await prisma.booking.updateMany({
    where: {
      status: booking_status.HELD, // B6: Use HELD status for holds
      lockExpiresAt: {
        lt: now,
      },
    },
    data: {
      status: booking_status.EXPIRED,
    },
  })
  
  return expiredBookings.count
}

/**
 * Cancel a booking and release the slot
 */
export async function cancelBooking(bookingId: string, userId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  })
  
  if (!booking) {
    throw new Error("Booking not found")
  }
  
  // Check if user owns the booking
  if (booking.customerId !== userId) {
    throw new Error("You can only cancel your own bookings")
  }
  
  // Update status to CANCELLED
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: booking_status.CANCELLED,
      lockExpiresAt: null, // Release lock immediately
    },
  })
}

/**
 * Confirm a booking (after successful payment)
 */
export async function confirmBooking(bookingId: string): Promise<void> {
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: booking_status.CONFIRMED,
      lockExpiresAt: null,
    },
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
                  site: true,
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
      floors: {
        include: {
          zones: {
            include: {
              parkingBays: true,
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
  
  for (const floor of site.floors) {
    let floorTotal = 0
    let floorOccupied = 0
    let floorReserved = 0
    
    for (const zone of floor.zones) {
      for (const bay of zone.parkingBays) {
        floorTotal++
        totalBays++
        
        if (bay.status === BayStatus.OCCUPIED) {
          floorOccupied++
          occupiedBays++
        } else if (bay.status === BayStatus.RESERVED) {
          floorReserved++
          reservedBays++
        }
        
        if (bay.isAccessible && bay.status === BayStatus.AVAILABLE) {
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