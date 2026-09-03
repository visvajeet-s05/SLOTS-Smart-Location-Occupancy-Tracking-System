import { NextRequest, NextResponse } from "next/server"
import { getLevelOccupancySummary } from "@/lib/lot/level-map"

/**
 * GET /api/lots/[lotId]/levels
 * Returns hierarchical structure: Lot -> Levels -> Zones -> Slots with real-time aggregated counts
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> }
) {
  const startTime = Date.now()

  try {
    const { lotId } = await params

    // Get level occupancy summary
    const levels = await getLevelOccupancySummary(lotId)

    const processingTime = Date.now() - startTime

    // Check if processing time meets 40ms target
    if (processingTime > 40) {
      console.warn(`Multi-level API latency exceeded 40ms: ${processingTime}ms`)
    }

    return NextResponse.json({
      success: true,
      lotId,
      levels,
      summary: {
        totalLevels: levels.length,
        totalSlots: levels.reduce((sum, l) => sum + l.totalSlots, 0),
        totalOccupied: levels.reduce((sum, l) => sum + l.occupiedSlots, 0),
        totalAvailable: levels.reduce((sum, l) => sum + l.availableSlots, 0),
        overallOccupancyRate: levels.length > 0
          ? levels.reduce((sum, l) => sum + l.occupiedSlots, 0) / levels.reduce((sum, l) => sum + l.totalSlots, 0)
          : 0,
      },
      processingTime,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        "X-Processing-Time": processingTime.toString(),
      },
    })
  } catch (error: any) {
    console.error("Multi-level API error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}