import { NextRequest, NextResponse } from "next/server"
import { getAuthSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { extendBooking, getLotConfig } from "@/lib/booking-engine"
import { logAuditEvent } from "@/lib/audit"
import { z } from "zod"

const extendSchema = z.object({
  bookingId: z.string(),
  newEndTime: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: "Invalid date format"
  })
})

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession()
    const userId = session?.user?.id

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validated = extendSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validated.error.errors },
        { status: 400 }
      )
    }

    const { bookingId, newEndTime } = validated.data

    const newEndTimeDate = new Date(newEndTime)

    // B45: Validate extension
    try {
      const updatedBooking = await extendBooking(bookingId, userId, newEndTimeDate)

      await logAuditEvent({
        userId,
        action: "BOOKING_EXTENDED",
        resource: `Booking:${bookingId}`,
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
        details: {
          previousEndTime: updatedBooking.endTime.toISOString(),
          newEndTime: newEndTimeDate.toISOString()
        }
      })

      return NextResponse.json({
        success: true,
        booking: updatedBooking,
        message: "Booking extended successfully"
      })
    } catch (error: any) {
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      if (error.message === "Booking not found") {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 })
      }
      if (error.message === "Cannot extend booking" || error.message.includes("Cannot extend")) {
        return NextResponse.json(
          { error: error.message, message: error.message },
          { status: 400 }
        )
      }
      throw error
    }
  } catch (error: any) {
    console.error("[EXTEND_BOOKING_ERROR]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}