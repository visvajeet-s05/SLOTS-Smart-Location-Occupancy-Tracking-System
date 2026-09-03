import { NextRequest, NextResponse } from "next/server"
import { getAuthSession, requireRole } from "@/lib/auth"
import { cancelBooking } from "@/lib/booking-engine"
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
    
    // Check if user is authorized to cancel
    // Only booking owner, OWNER, or SUPER_ADMIN can cancel
    if (
      userRole !== "OWNER" &&
      userRole !== "SUPER_ADMIN"
    ) {
      await requireRole(["CUSTOMER", "OWNER", "SUPER_ADMIN"])
    }
    
    // Cancel the booking
    await cancelBooking(bookingId, userId)
    
    // Log audit event
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
    const userAgent = req.headers.get("user-agent") || "unknown"
    await logAuditEvent({
      userId,
      action: "BOOKING_CANCELLED",
      resource: `Booking:${bookingId}`,
      ipAddress: ip,
      userAgent,
      details: {
        cancelledBy: userRole,
      },
    })
    
    return NextResponse.json({
      success: true,
      message: "Booking cancelled successfully",
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
    
    console.error("Cancel booking error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}