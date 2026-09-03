import { NextRequest, NextResponse } from "next/server"
import { processFASTagScan } from "@/lib/hardware/fastag"
import { z } from "zod"

const fastagScanSchema = z.object({
  siteId: z.string(),
  tagId: z.string(),
  readerId: z.string(),
  timestamp: z.string().optional(),
})

const FASTAG_WEBHOOK_SECRET = process.env.FASTAG_WEBHOOK_SECRET || "default-secret"

export async function POST(req: NextRequest) {
  try {
    // Validate webhook secret for security
    const secret = req.headers.get("x-fastag-secret")
    if (secret !== FASTAG_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid webhook secret" },
        { status: 401 }
      )
    }

    // Validate request body
    const body = await req.json()
    const validated = fastagScanSchema.parse(body)

    const { siteId, tagId, readerId, timestamp } = validated

    // Process FASTag scan
    const result = await processFASTagScan({
      siteId,
      tagId,
      readerId,
      timestamp: timestamp ? new Date(timestamp) : undefined,
    })

    return NextResponse.json({
      success: result.success,
      actuateGate: result.actuateGate,
      vehicleNumber: result.vehicleNumber,
      balanceRemaining: result.balanceRemaining,
      amountDebited: result.amountDebited,
      message: result.message,
      transactionId: result.transactionId,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      )
    }

    console.error("FASTag scan error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}