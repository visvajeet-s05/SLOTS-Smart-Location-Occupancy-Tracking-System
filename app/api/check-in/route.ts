import { NextRequest, NextResponse } from "next/server"
import { getAuthSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { booking_status } from "@prisma/client"
import { logAuditEvent } from "@/lib/audit"
import { v4 as uuidv4 } from "uuid"

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession()
    const userId = session?.user?.id

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { bookingId, slotId } = body

    if (!bookingId) {
      return NextResponse.json({ error: "Missing bookingId" }, { status: 400 })
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        parkinglot: { select: { id: true, timezone: true } },
        slot: { select: { id: true, slotType: true, slotNumber: true, row: true, displayName: true } }
      }
    })

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    if (booking.customerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const now = new Date()
    const bookingStart = new Date(booking.startTime)
    const bookingEnd = new Date(booking.endTime)

    // Check if booking is in a valid state for check-in
    if (!booking.status || !["CONFIRMED", "ACTIVE", "UPCOMING"].includes(booking.status)) {
      return NextResponse.json(
        { error: "Invalid booking status for check-in", status: booking.status },
        { status: 400 }
      )
    }

    // Prevent duplicate check-in
    if (booking.actualCheckIn) {
      return NextResponse.json({
        error: "Already checked in",
        message: "You have already checked in for this booking"
      }, { status: 400 })
    }

    // Get lot config for grace period calculation
    const lotConfig = await prisma.lotconfig.findUnique({
      where: { lotId: booking.parkingLotId }
    })

    const checkinGraceDivisor = lotConfig?.checkinGraceDivisor ?? 6
    const minCheckinGraceMinutes = lotConfig?.minCheckinGraceMinutes ?? 5
    const maxCheckinGraceMinutes = lotConfig?.maxCheckinGraceMinutes ?? 30

    // Calculate booking duration in minutes
    const bookingDurationMinutes = (bookingEnd.getTime() - bookingStart.getTime()) / (1000 * 60)
    
    // Calculate grace period: duration / 6, capped at min/max
    let gracePeriodMinutes = Math.floor(bookingDurationMinutes / checkinGraceDivisor)
    gracePeriodMinutes = Math.max(minCheckinGraceMinutes, Math.min(maxCheckinGraceMinutes, gracePeriodMinutes))

    const gracePeriodEnd = new Date(bookingStart.getTime() + gracePeriodMinutes * 60 * 1000)

    // B11: Check if too early (before scheduled start time)
    if (now < bookingStart) {
      const minutesUntilStart = Math.ceil((bookingStart.getTime() - now.getTime()) / (1000 * 60))
      return NextResponse.json({
        error: "Too early",
        message: `Your booking starts at ${bookingStart.toLocaleTimeString()}. Check-in available in ${minutesUntilStart} minutes.`,
        checkinOpensAt: bookingStart.toISOString(),
        minutesUntilStart
      }, { status: 400 })
    }

    // B14: Check if past grace period (no-show)
    if (now > gracePeriodEnd) {
      await prisma.$transaction(async (tx) => {
        // Mark as NO_SHOW
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: booking_status.NO_SHOW,
            fineAmount: lotConfig?.noShowFine ?? 50
          }
        })

        // Release the slot
        const slotIdToRelease = booking.slotId
        if (slotIdToRelease) {
          await tx.slot.update({
            where: { id: slotIdToRelease },
            data: { status: "AVAILABLE", updatedAt: new Date() }
          })

          // Log allocation history release
          await tx.slotallocationhistory.updateMany({
            where: {
              bookingId,
              slotId: slotIdToRelease,
              releasedAt: null
            },
            data: { releasedAt: now }
          })
        }
      })

      // Broadcast slot release
      if (booking.slotId) {
        await broadcastSlotUpdate(booking.slotId, booking.parkingLotId, "AVAILABLE", "SYSTEM")
      }

      await logAuditEvent({
        userId,
        action: "NO_SHOW",
        resource: `Booking:${bookingId}`,
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
        details: { fineAmount: lotConfig?.noShowFine ?? 50 }
      })

      return NextResponse.json({
        error: "No-show",
        message: `Grace period ended at ${gracePeriodEnd.toLocaleTimeString()}. Booking marked as no-show.`,
        fineAmount: lotConfig?.noShowFine ?? 50
      }, { status: 400 })
    }

    // Determine actual slot to use (handle temporary reassignment)
    let actualSlotId = booking.slotId ? booking.slotId : slotId
    let isTemporaryReassignment = false

    if (booking.allocatedSlotId) {
      // Already has a temporary slot assigned
      actualSlotId = booking.allocatedSlotId
      isTemporaryReassignment = true
    } else if (booking.slotId) {
      // Check if the original slot is occupied by previous booking
      const originalSlot = await prisma.slot.findUnique({ where: { id: booking.slotId } })
      
      if (originalSlot && (originalSlot.status === "OCCUPIED" || originalSlot.status === "RESERVED")) {
        // Check if there's an active booking on this slot that overlaps
        const conflictingBooking = await prisma.booking.findFirst({
          where: {
            slotId: booking.slotId,
            status: { in: [booking_status.ACTIVE, booking_status.CONFIRMED] },
            endTime: { gt: now },
            startTime: { lt: now },
            id: { not: bookingId }
          }
        })

        if (conflictingBooking) {
          // B20: Find a compatible temporary slot
          const tempSlot = await findCompatibleTemporarySlot(booking, now)
          
          if (tempSlot) {
            actualSlotId = tempSlot.id
            isTemporaryReassignment = true
            
            // Update booking with temporary slot
            await prisma.booking.update({
              where: { id: bookingId },
              data: {
                allocatedSlotId: tempSlot.id,
                temporaryReassignmentReason: "PREVIOUS_SLOT_UNAVAILABLE"
              }
            })

            // Log allocation history
            await prisma.slotallocationhistory.create({
              data: {
                id: uuidv4(),
                bookingId,
                slotId: tempSlot.id,
                allocationType: "TEMPORARY_REASSIGNMENT",
                reason: "PREVIOUS_SLOT_UNAVAILABLE"
              }
            })
          }
        }
      }
    }

    // Update booking to ACTIVE
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: booking_status.ACTIVE,
        actualCheckIn: now,
        allocatedSlotId: actualSlotId,
        occupancyState: "OCCUPIED"
      }
    })

    // Update slot status to OCCUPIED
    await prisma.slot.update({
      where: { id: actualSlotId },
      data: { status: "OCCUPIED", updatedAt: new Date() }
    })

    // Broadcast slot update
    await broadcastSlotUpdate(actualSlotId, booking.parkingLotId, "OCCUPIED", "CUSTOMER")

    await logAuditEvent({
      userId,
      action: "CHECK_IN",
      resource: `Booking:${bookingId}`,
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      userAgent: req.headers.get("user-agent") || "unknown",
      details: {
        actualSlotId,
        isTemporaryReassignment,
        gracePeriodMinutes,
        checkinTime: now.toISOString()
      }
    })

    return NextResponse.json({
      success: true,
      booking: {
        id: updatedBooking.id,
        status: updatedBooking.status,
        actualCheckIn: updatedBooking.actualCheckIn,
        allocatedSlotId: updatedBooking.allocatedSlotId,
        isTemporaryReassignment,
        originalSlotId: booking.slotId
      },
      message: isTemporaryReassignment 
        ? "Checked in successfully (assigned temporary slot due to previous customer overstay)"
        : "Checked in successfully"
    })

  } catch (error: any) {
    console.error("[CHECK_IN_ERROR]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function findCompatibleTemporarySlot(booking: any, now: Date) {
  // Find available slots in the same parking lot
  const availableSlots = await prisma.slot.findMany({
    where: {
      lotId: booking.parkingLotId,
      status: "AVAILABLE",
      slotType: booking.slot?.slotType || "REGULAR"
    },
    take: 10
  })

  for (const slot of availableSlots) {
    const conflicts = await prisma.booking.count({
      where: {
        slotId: slot.id,
        status: { in: [booking_status.CONFIRMED, booking_status.ACTIVE, booking_status.HELD] },
        OR: [
          { AND: [{ startTime: { lt: booking.endTime } }, { endTime: { gt: booking.startTime } }] }
        ]
      }
    })

    if (conflicts === 0) {
      return slot
    }
  }

  return null
}

async function broadcastSlotUpdate(slotId: string, lotId: string, status: string, source: string) {
  try {
    const slot = await prisma.slot.findUnique({ where: { id: slotId } })
    if (!slot) return

    let broadcastUrl = process.env.INTERNAL_WS_SERVER_URL || 
                       process.env.NEXT_PUBLIC_WEBSOCKET_URL?.replace("wss://", "https://").replace("ws://", "http://") || 
                       "http://localhost:4000"

    if (broadcastUrl.startsWith("ws://")) {
      broadcastUrl = broadcastUrl.replace("ws://", "http://")
    } else if (broadcastUrl.startsWith("wss://")) {
      broadcastUrl = broadcastUrl.replace("wss://", "https://")
    }

    await fetch(`${broadcastUrl}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "SLOT_UPDATE",
        lotSlug: lotId,
        slotNumber: slot.slotNumber,
        slotId: slot.id,
        status,
        source,
        timestamp: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(2000)
    })
  } catch (e) {
    console.error("Failed to broadcast slot update:", e)
  }
}