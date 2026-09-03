import { NextRequest, NextResponse } from "next/server"
import { getAuthSession, requireRole } from "@/lib/auth"
import { getSiteOccupancy } from "@/lib/booking-engine"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const siteId = (await params).siteId
  
  try {
    // Require OWNER or SUPER_ADMIN role
    await requireRole(["OWNER", "SUPER_ADMIN"])
    
    // Get site occupancy
    const occupancy = await getSiteOccupancy(siteId)
    
    return NextResponse.json({
      success: true,
      occupancy,
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
    
    console.error("Get site occupancy error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}