import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getCombinedContextualFeatures, clearSignalCache } from "@/lib/pricing/demand-features"

const externalSignalsQuerySchema = z.object({
  lotId: z.string(),
  forceRefresh: z.string().optional(),
})

/**
 * GET /api/pricing/external-signals
 * Fetches cached weather and local event signals
 * Returns demand multiplier and contextual features
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const validated = externalSignalsQuerySchema.parse(Object.fromEntries(searchParams))

    const { lotId, forceRefresh } = validated

    // Force refresh if requested
    if (forceRefresh === "true") {
      clearSignalCache(lotId)
    }

    // Get combined contextual features
    const features = await getCombinedContextualFeatures(lotId)

    return NextResponse.json({
      success: true,
      lotId: features.lotId,
      weatherCondition: features.weatherCondition,
      eventActive: features.activeEvent,
      multipliers: {
        weather: features.weatherMultiplier,
        event: features.eventMultiplier,
        timeOfDay: features.timeOfDayMultiplier,
        total: features.totalDemandMultiplier,
      },
      cachedAt: features.cachedAt,
      cachedUntil: features.cachedUntil,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.errors },
        { status: 400 }
      )
    }

    console.error("External signals API error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}