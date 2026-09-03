import { NextRequest, NextResponse } from "next/server"
import { requireRole, getAuthSession } from "@/lib/auth"
import { releaseExpiredLocks } from "@/lib/booking-engine"
import { logAuditEvent } from "@/lib/audit"

export async function POST(req: NextRequest) {
  try {
    // Require SUPER_ADMIN role (or can be called by system cron)
    await requireRole(["SUPER_ADMIN"])
    
    const session = await getAuthSession()
    const userId = session?.user?.id
    
    // Release expired locks
    const releasedCount = await releaseExpiredLocks()
    
    // Log audit event
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
    const userAgent = req.headers.get("user-agent") || "unknown"
    await logAuditEvent({
      userId,
      action: "LOCK_CLEANUP",
      resource: "/api/bookings/cleanup-locks",
      ipAddress: ip,
      userAgent,
      details: {
        releasedCount,
      },
    })
    
    return NextResponse.json({
      success: true,
      message: `Released ${releasedCount} expired slot locks`,
      releasedCount,
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
    
    console.error("Cleanup locks error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}