import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuditLogs } from "@/lib/security/audit-logger"

const auditLogsQuerySchema = z.object({
  actorId: z.string().optional(),
  action: z.string().optional(),
  targetResource: z.string().optional(),
  actorRole: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
})

/**
 * GET /api/admin/audit-logs
 * Admin-authenticated REST route for audit log retrieval
 * Supports filtering and pagination
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now()

  try {
    const { searchParams } = new URL(req.url)
    const validated = auditLogsQuerySchema.parse(Object.fromEntries(searchParams))

    const {
      actorId,
      action,
      targetResource,
      actorRole,
      fromDate,
      toDate,
      page,
      limit,
    } = validated

    // Build filters
    const filters: any = {
      actorId,
      action,
      targetResource,
      actorRole,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    }

    if (fromDate) {
      filters.fromDate = new Date(fromDate)
    }

    if (toDate) {
      filters.toDate = new Date(toDate)
    }

    // Get audit logs
    const result = await getAuditLogs(filters)

    const processingTime = Date.now() - startTime

    // Check if processing time meets 100ms target
    if (processingTime > 100) {
      console.warn(`Audit logs API latency exceeded 100ms: ${processingTime}ms`)
    }

    return NextResponse.json({
      success: true,
      data: result.logs,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
      processingTime,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        "X-Processing-Time": processingTime.toString(),
      },
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Audit logs API error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}