import { NextRequest, NextResponse } from "next/server"
import { getAuthSession, requireRole } from "@/lib/auth"
import { confirmBooking } from "@/lib/booking-engine"
import { logAuditEvent } from "@/lib/audit"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const bookingId = (await params).id
  
  try {
    // Require authentication
    const session = await getAuthSession()
    const userId = session?.user?.id
    const userRole = session?.user?.role
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    // Only OWNER or SUPER_ADMIN can confirm bookings
    await requireRole(["OWNER", "SUPER_ADMIN"])
    
    // Confirm the booking
    await confirmBooking(bookingId)
    
    // Log audit event
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
    const userAgent = req.headers.get("user-agent") || "unknown"
    await logAuditEvent({
      userId,
      action: "BOOKING_CONFIRMED",
      resource: `Booking:${bookingId}`,
      ipAddress: ip,
      userAgent,
      details: {
        confirmedBy: userRole,
      },
    })
    
    return NextResponse.json({
      success: true,
      message: "Booking confirmed successfully",
    })
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    if (error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }
    
    console.error("Confirm booking error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}