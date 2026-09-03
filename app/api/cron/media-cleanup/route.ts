import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { batchEnforceStorageTTL, enforceStorageTTL, getRetentionStats } from "@/lib/security/media-retention"

const cleanupSchema = z.object({
  lotId: z.string().optional(),
  forceRefresh: z.string().optional(),
})

/**
 * POST /api/cron/media-cleanup
 * Cron-authenticated endpoint for batch retention cleanup
 * Triggers cleanup across all registered edge nodes and cloud buckets
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    // Validate CRON_SECRET header
    const cronSecret = req.headers.get("x-cron-secret")
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const body = await req.json()
    const validated = cleanupSchema.parse(body)

    const { lotId, forceRefresh } = validated

    let result
    let singleLotResult

    if (lotId) {
      // Cleanup specific lot
      singleLotResult = await enforceStorageTTL(lotId)
      result = { [lotId]: singleLotResult }
    } else {
      // Batch cleanup across all lots
      result = await batchEnforceStorageTTL()
    }

    // Aggregate results
    let totalDeleted = 0
    let totalFreed = 0
    let totalPreserved = 0
    let errorCount = 0

    for (const lotResult of Object.values(result)) {
      if (lotResult.success) {
        totalDeleted += lotResult.deletedFilesCount
        totalFreed += lotResult.freedBytes
        totalPreserved += lotResult.preservedFilesCount
      } else {
        errorCount++
      }
    }

    const executionTime = Date.now() - startTime

    return NextResponse.json({
      success: true,
      deletedFilesCount: totalDeleted,
      freedBytes: totalFreed,
      preservedFilesCount: totalPreserved,
      errorCount,
      executionTimeMs: executionTime,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request payload", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Media cleanup error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}