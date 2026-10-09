import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { 
  releaseExpiredHolds, 
  processNoShows, 
  handleConsecutiveBookingConflict 
} from "@/lib/booking-engine"

export async function POST(req: NextRequest) {
  try {
    // This endpoint should be called by a cron job or background task
    // In production, this should be protected with an API key or admin auth
    const authHeader = req.headers.get("authorization")
    const expectedKey = process.env.CRON_SECRET_KEY
    
    if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()
    const results: {
      expiredHolds: number
      noShows: number
      consecutiveConflicts: number
      errors: string[]
    } = {
      expiredHolds: 0,
      noShows: 0,
      consecutiveConflicts: 0,
      errors: []
    }

    // 1. Release expired payment holds (B6: HELD -> EXPIRED)
    try {
      results.expiredHolds = await releaseExpiredHolds(now)
    } catch (error: any) {
      results.errors.push(`releaseExpiredHolds: ${error.message}`)
    }

    // 2. Process no-shows (B14)
    try {
      results.noShows = await processNoShows(now)
    } catch (error: any) {
      results.errors.push(`processNoShows: ${error.message}`)
    }

    // 3. Handle consecutive booking conflicts (B19)
    // Find active bookings that have started but whose scheduled end has passed
    // and check if there's a next booking that needs the slot
    try {
      const bookingsNeedingCheck = await prisma.booking.findMany({
        where: {
          status: "ACTIVE",
          actualCheckOut: null,
          endTime: { lt: now }
        },
        select: { id: true }
      })

      for (const booking of bookingsNeedingCheck) {
        try {
          const conflictResult = await handleConsecutiveBookingConflict(booking.id, now)
          if (conflictResult?.reassigned) {
            results.consecutiveConflicts++
          }
        } catch (error: any) {
          results.errors.push(`conflict for booking ${booking.id}: ${error.message}`)
        }
      }
    } catch (error: any) {
      results.errors.push(`handleConsecutiveBookingConflict: ${error.message}`)
    }

    // 4. Clean up expired idempotency keys
    try {
      await prisma.idempotencykeys.deleteMany({
        where: {
          expiresAt: { lt: now }
        }
      })
    } catch (error: any) {
      results.errors.push(`cleanupIdempotencyKeys: ${error.message}`)
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results
    })

  } catch (error: any) {
    console.error("[CLEANUP_JOB_ERROR]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}