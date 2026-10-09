import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { 
  checkTimeOverlap, 
  getLotConfig, 
  getNextAvailableTime, 
  calculateAvailability 
} from "@/lib/booking-engine"
import { z } from "zod"

const availabilityQuerySchema = z.object({
  siteId: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  slotId: z.string().optional(),
  vehicleType: z.string().optional(),
  bayType: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    
    const validated = availabilityQuerySchema.safeParse({
      siteId: searchParams.get("siteId") || undefined,
      startTime: searchParams.get("startTime") || undefined,
      endTime: searchParams.get("endTime") || undefined,
      slotId: searchParams.get("slotId") || undefined,
      vehicleType: searchParams.get("vehicleType") || undefined,
      bayType: searchParams.get("bayType") || undefined,
    })

    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validated.error.errors },
        { status: 400 }
      )
    }

    const { siteId, startTime, endTime, slotId, vehicleType, bayType } = validated.data

    // Single slot availability check
    if (slotId && startTime && endTime) {
      return await checkSingleSlotAvailability(slotId, new Date(startTime), new Date(endTime))
    }

    // Next available time for a slot
    if (slotId && !startTime) {
      return await getNextAvailable(slotId)
    }

    // Site-wide availability
    if (siteId && startTime && endTime) {
      return await getSiteAvailability(
        siteId, 
        new Date(startTime), 
        new Date(endTime), 
        vehicleType,
        bayType
      )
    }

    // Lot config for booking window info
    if (siteId && !startTime) {
      return await getSiteConfig(siteId)
    }

    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    )

  } catch (error: any) {
    console.error("[AVAILABILITY_ERROR]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function checkSingleSlotAvailability(slotId: string, startTime: Date, endTime: Date) {
  if (endTime <= startTime) {
    return NextResponse.json(
      { error: "End time must be after start time" },
      { status: 400 }
    )
  }

  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
    include: {
      bookings: {
        where: {
          status: { in: ["CONFIRMED", "ACTIVE", "HELD"] },
          OR: [
            { AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }] }
          ]
        },
        take: 50
      }
    }
  })

  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 })
  }

  const hasConflict = slot.bookings.length > 0
  const isAvailable = !hasConflict && slot.status === "AVAILABLE"

  return NextResponse.json({
    slotId: slot.id,
    slotNumber: slot.slotNumber,
    status: slot.status,
    isAvailable,
    hasConflicts: hasConflict,
    conflictingBookings: slot.bookings.map(b => ({
      id: b.id,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status
    })),
    canBook: isAvailable
  })
}

async function getNextAvailable(slotId: string) {
  const result = await getNextAvailableTime(slotId)
  
  return NextResponse.json({
    slotId,
    nextAvailable: result?.nextAvailable?.toISOString() || null,
    reason: result?.reason || "UNKNOWN"
  })
}

async function getSiteAvailability(
  siteId: string, 
  startTime: Date, 
  endTime: Date, 
  vehicleType?: string,
  bayType?: string
) {
  const availability = await calculateAvailability(siteId, startTime, endTime)

  // Also check booking window
  const lotConfig = await getLotConfig(siteId)
  const now = new Date()
  const bookingWindowOpenTime = new Date(startTime.getTime() - (lotConfig?.advanceBookingHours ?? 12) * 60 * 60 * 1000)
  
  const isBookingWindowOpen = now >= bookingWindowOpenTime
  const minutesUntilWindow = isBookingWindowOpen 
    ? 0 
    : Math.ceil((bookingWindowOpenTime.getTime() - now.getTime()) / (1000 * 60))

  // Find compatible available slots
  const availableSlots = await prisma.slot.findMany({
    where: {
      lotId: siteId,
      status: "AVAILABLE",
      ...(bayType && { slotType: bayType }),
    },
    include: {
      bookings: {
        where: {
          status: { in: ["CONFIRMED", "ACTIVE", "HELD"] },
          OR: [
            { AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }] }
          ]
        }
      }
    }
  })

  const trulyAvailableSlots = availableSlots.filter(s => s.bookings.length === 0)

  return NextResponse.json({
    siteId,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    ...availability,
    availableSlotIds: trulyAvailableSlots.map(s => s.id),
    bookingWindow: {
      isOpen: isBookingWindowOpen,
      opensAt: bookingWindowOpenTime.toISOString(),
      minutesUntilOpen: minutesUntilWindow,
      advanceBookingHours: lotConfig?.advanceBookingHours ?? 12
    },
    minBookingDurationMinutes: lotConfig?.minBookingDurationMinutes ?? 30,
    maxBookingDurationMinutes: lotConfig?.maxBookingDurationMinutes ?? 720
  })
}

async function getSiteConfig(siteId: string) {
  const lotConfig = await getLotConfig(siteId)
  const parkingLot = await prisma.parkinglot.findUnique({
    where: { id: siteId },
    select: { name: true, address: true, timezone: true }
  })

  return NextResponse.json({
    siteId,
    siteName: parkingLot?.name,
    address: parkingLot?.address,
    timezone: parkingLot?.timezone || "Asia/Kolkata",
    config: {
      advanceBookingHours: lotConfig?.advanceBookingHours ?? 12,
      minBookingLeadMinutes: lotConfig?.minBookingLeadMinutes ?? 15,
      checkinGraceDivisor: lotConfig?.checkinGraceDivisor ?? 6,
      minCheckinGraceMinutes: lotConfig?.minCheckinGraceMinutes ?? 5,
      maxCheckinGraceMinutes: lotConfig?.maxCheckinGraceMinutes ?? 30,
      refundUsageThreshold: lotConfig?.refundUsageThreshold ?? 80,
      paymentHoldMinutes: lotConfig?.paymentHoldMinutes ?? 5,
      minBookingDurationMinutes: lotConfig?.minBookingDurationMinutes ?? 30,
      maxBookingDurationMinutes: lotConfig?.maxBookingDurationMinutes ?? 720,
      noShowFine: lotConfig?.noShowFine ?? 50,
      overstayBlockMinutes: lotConfig?.overstayBlockMinutes ?? 30,
      overstayRatePerBlock: lotConfig?.overstayRatePerBlock ?? 30,
      turnoverBufferMinutes: lotConfig?.turnoverBufferMinutes ?? 5
    }
  })
}