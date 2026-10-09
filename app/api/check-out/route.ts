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
    const { bookingId } = body

    if (!bookingId) {
      return NextResponse.json({ error: "Missing bookingId" }, { status: 400 })
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        parkinglot: { select: { id: true, timezone: true } },
        slot: { select: { id: true, slotType: true, slotNumber: true, row: true } }
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
    const actualCheckIn = booking.actualCheckIn ? new Date(booking.actualCheckIn) : bookingStart

    // Check if booking is in a valid state for check-out
    if (booking.status !== booking_status.ACTIVE) {
      return NextResponse.json(
        { error: "Invalid booking status for check-out", status: booking.status },
        { status: 400 }
      )
    }

    // Prevent duplicate check-out
    if (booking.actualCheckOut) {
      return NextResponse.json({
        error: "Already checked out",
        message: "You have already checked out for this booking"
      }, { status: 400 })
    }

    // Get lot config for calculations
    const lotConfig = await getLotConfig(booking.parkingLotId)

    const refundUsageThreshold = lotConfig?.refundUsageThreshold ?? 80
    const overstayBlockMinutes = lotConfig?.overstayBlockMinutes ?? 30
    const overstayRatePerBlock = lotConfig?.overstayRatePerBlock ?? 30
    const overstayMaxChargeMultiple = lotConfig?.overstayMaxChargeMultiple ?? 4
    const overstayMinMaxCharge = lotConfig?.overstayMinMaxCharge ?? 200
    const turnoverBufferMinutes = lotConfig?.turnoverBufferMinutes ?? 5

    // Calculate durations
    const bookedDurationMinutes = (bookingEnd.getTime() - bookingStart.getTime()) / (1000 * 60)
    const actualUsedMinutes = (now.getTime() - actualCheckIn.getTime()) / (1000 * 60)
    
    const actualUsed = Math.max(0, actualUsedMinutes)

    // Calculate usage percentage
    const usagePercentage = bookedDurationMinutes > 0 
      ? (actualUsed / bookedDurationMinutes) * 100 
      : 0

    // Determine if early checkout (before scheduled end)
    const isEarlyCheckout = now < bookingEnd
    const isLateCheckout = now > bookingEnd

    let refundAmount = 0
    let overstayAmount = 0
    let finalStatus: booking_status = booking_status.COMPLETED
    let isOverstay = false

    // Check if another booking starts immediately after (hard cutoff)
    const nextBooking = await prisma.booking.findFirst({
      where: {
        slotId: booking.allocatedSlotId || booking.slotId,
        status: { in: [booking_status.CONFIRMED, booking_status.ACTIVE] },
        startTime: { lte: bookingEnd },
        endTime: { gt: bookingEnd },
        id: { not: bookingId }
      },
      orderBy: { startTime: "asc" }
    })

    const hasNextBooking = !!nextBooking

    // Calculate late checkout grace period
    let lateCheckoutGraceMinutes = Math.floor(bookedDurationMinutes / 6)
    lateCheckoutGraceMinutes = Math.max(5, Math.min(30, lateCheckoutGraceMinutes))

    // B31: If there's a next booking, the cutoff is HARD at the scheduled end time
    const hardCutoff = hasNextBooking ? bookingEnd : new Date(bookingEnd.getTime() + lateCheckoutGraceMinutes * 60 * 1000)

    // Calculate overstay if past hard cutoff
    if (now > hardCutoff) {
      isOverstay = true
      finalStatus = booking_status.OVERSTAY

      const overstayMinutes = Math.max(0, (now.getTime() - hardCutoff.getTime()) / (1000 * 60))
      const overstayBlocks = Math.ceil(overstayMinutes / overstayBlockMinutes)
      
      overstayAmount = overstayBlocks * overstayRatePerBlock
      
      // Cap at max multiple of booking amount or min charge, whichever is lower
      const maxOverstay = Math.min(
        booking.amount * overstayMaxChargeMultiple,
        overstayMinMaxCharge
      )
      overstayAmount = Math.min(overstayAmount, maxOverstay)
    }

    // B26-B28: Calculate refund for early checkout
    if (isEarlyCheckout && usagePercentage < refundUsageThreshold) {
      const unusedPercentage = 100 - usagePercentage
      const unusedAmount = booking.amount * (unusedPercentage / 100)
      
      const minRefundAmount = lotConfig?.minRefundAmount ?? 10
      
      if (unusedAmount >= minRefundAmount) {
        refundAmount = unusedAmount
      }
    }

    // Determine which slot(s) to release
    const slotToRelease = booking.allocatedSlotId || booking.slotId

    await prisma.$transaction(async (tx) => {
      // Update booking
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: finalStatus,
          actualCheckOut: now,
          refundAmount,
          overstayAmount,
          occupancyState: "NOT_OCCUPIED"
        }
      })

      // Release the current slot(s)
      if (slotToRelease) {
        await tx.slot.update({
          where: { id: slotToRelease },
          data: { status: "AVAILABLE", updatedAt: new Date() }
        })

        // Log allocation history release
        await tx.slotallocationhistory.updateMany({
          where: {
            bookingId,
            slotId: slotToRelease,
            releasedAt: null
          },
          data: { releasedAt: now }
        })
      }

      // If this was a temporary reassignment, also free the original slot
      if (booking.allocatedSlotId && booking.allocatedSlotId !== booking.slotId && booking.slotId) {
        // Check if original slot has any other active bookings
        const originalSlotBookings = await prisma.booking.count({
          where: {
            slotId: booking.slotId,
            status: { in: [booking_status.CONFIRMED, booking_status.ACTIVE] },
            endTime: { gt: now },
            id: { not: bookingId }
          }
        })

        if (originalSlotBookings === 0) {
          await tx.slot.update({
            where: { id: booking.slotId },
            data: { status: "AVAILABLE", updatedAt: new Date() }
          })
        }
      }

      // Process refund if applicable
      if (refundAmount > 0) {
        const paymentRecord = await tx.payment.findFirst({
          where: { bookingId }
        })

        if (paymentRecord && paymentRecord.status === "COMPLETED") {
          await tx.refund.create({
            data: {
              id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              paymentId: paymentRecord.id,
              amount: refundAmount,
              reason: "EARLY_CHECKOUT"
            }
          })

          await tx.payment.update({
            where: { id: paymentRecord.id },
            data: { status: "REFUNDED" }
          })
        }
      }
    })

    // Broadcast slot updates
    if (slotToRelease) {
      await broadcastSlotUpdate(slotToRelease, booking.parkingLotId, "AVAILABLE", "CUSTOMER")
    }
    if (booking.allocatedSlotId && booking.allocatedSlotId !== booking.slotId && booking.slotId) {
      await broadcastSlotUpdate(booking.slotId, booking.parkingLotId, "AVAILABLE", "SYSTEM")
    }

    await logAuditEvent({
      userId,
      action: "CHECK_OUT",
      resource: `Booking:${bookingId}`,
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      userAgent: req.headers.get("user-agent") || "unknown",
      details: {
        actualCheckOut: now.toISOString(),
        actualUsedMinutes: Math.round(actualUsed),
        bookedDurationMinutes: Math.round(bookedDurationMinutes),
        usagePercentage: Math.round(usagePercentage * 100) / 100,
        refundAmount,
        overstayAmount,
        isOverstay,
        isEarlyCheckout,
        hasNextBooking,
        hardCutoff: hardCutoff.toISOString()
      }
    })

    return NextResponse.json({
      success: true,
      booking: {
        id: bookingId,
        status: finalStatus,
        actualCheckOut: now
      },
      details: {
        actualUsedMinutes: Math.round(actualUsed),
        bookedDurationMinutes: Math.round(bookedDurationMinutes),
        usagePercentage: Math.round(usagePercentage * 100) / 100,
        isEarlyCheckout,
        isOverstay,
        refundEligible: refundAmount > 0,
        refundAmount,
        overstayAmount
      },
      message: isOverstay 
        ? `Checked out with overstay charge of ₹${overstayAmount}`
        : refundAmount > 0
        ? `Checked out early. Refund of ₹${refundAmount} processed.`
        : "Checked out successfully"
    })

  } catch (error: any) {
    console.error("[CHECK_OUT_ERROR]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function getLotConfig(parkingLotId: string) {
  return await prisma.lotconfig.findUnique({
    where: { lotId: parkingLotId }
  })
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