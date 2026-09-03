import { NextRequest, NextResponse } from "next/server"
import { getAuthSession, requireRole } from "@/lib/auth"
import { holdSlotForCheckout } from "@/lib/booking-engine"
import { logAuditEvent } from "@/lib/audit"
import { generateOccupancyProof, verifyOccupancyProof } from "@/lib/zk/snark-prover"
import { z } from "zod"

const holdSlotSchema = z.object({
  siteId: z.string(),
  floorId: z.string().optional(),
  zoneId: z.string().optional(),
  bayType: z.enum(["STANDARD", "ACCESSIBLE", "EV_CHARGING", "VIP", "TWO_WHEELER"]).optional(),
  isAccessible: z.boolean().optional(),
  startTime: z.string(),
  endTime: z.string(),
  vehicleNumber: z.string().min(1),
  vehicleType: z.string().optional(),
  idempotencyKey: z.string().optional(),
  // Optional ZK proof fields
  userLat: z.number().optional(),
  userLng: z.number().optional(),
  occupancyProof: z.string().optional(),
  slotSecretKey: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    await requireRole(["CUSTOMER", "OWNER", "SUPER_ADMIN"])
    
    const session = await getAuthSession()
    const userId = session?.user?.id
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    // Validate request body
    const body = await req.json()
    const validatedData = holdSlotSchema.parse(body)
    
    // Verify ZK occupancy proof if provided
    if (validatedData.occupancyProof && validatedData.userLat && validatedData.userLng) {
      const proofValid = await verifyOccupancyProof(
        validatedData.occupancyProof,
        [validatedData.siteId, Math.floor(Date.now() / 1000).toString()],
        validatedData.siteId
      )
      
      if (!proofValid) {
        return NextResponse.json(
          { error: "Invalid occupancy proof" },
          { status: 403 }
        )
      }
    }
    
    // Hold the slot
    const booking = await holdSlotForCheckout({
      userId,
      ...validatedData,
    })
    
    // Log audit event
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
    const userAgent = req.headers.get("user-agent") || "unknown"
    await logAuditEvent({
      userId,
      action: "SLOT_HELD",
      resource: `Booking:${booking.id}`,
      ipAddress: ip,
      userAgent,
      details: {
        parkingBayId: booking.parkingBayId,
        startTime: booking.startTime,
        endTime: booking.endTime,
        lockExpiresAt: booking.lockExpiresAt,
      },
    })
    
    // Calculate lock expiry countdown
    const lockExpiresAt = booking.lockExpiresAt
    const now = new Date()
    const lockCountdown = lockExpiresAt 
      ? Math.max(0, Math.floor((lockExpiresAt.getTime() - now.getTime()) / 1000))
      : 0
    
    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        status: booking.status,
        startTime: booking.startTime,
        endTime: booking.endTime,
        vehicleNumber: booking.vehicleNumber,
        vehicleType: booking.vehicleType,
        amount: booking.amount,
        lockExpiresAt: booking.lockExpiresAt,
        lockCountdown,
      },
      slot: {
        id: booking.parkingBay?.id,
        bayNumber: booking.parkingBay?.bayNumber,
        bayType: booking.parkingBay?.bayType,
        isAccessible: booking.parkingBay?.isAccessible,
        zone: booking.parkingBay?.zone?.zoneName,
        floor: booking.parkingBay?.zone?.floor?.levelName,
        site: booking.parkingBay?.zone?.floor?.site?.name,
      },
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      )
    }
    
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
    
    console.error("Hold slot error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}