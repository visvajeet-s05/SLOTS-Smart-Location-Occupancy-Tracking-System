import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { processALPR } from "@/lib/vision/alpr-engine"
import { verifyVehicleALPR } from "@/lib/verification/dual-channel"

const alprVerifySchema = z.object({
  lotId: z.string(),
  vehicleImageBase64: z.string(),
  timestamp: z.string().optional(),
})

/**
 * POST /api/verify/alpr
 * REST endpoint for ALPR-based vehicle verification
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await req.json()
    const validated = alprVerifySchema.parse(body)

    const { lotId, vehicleImageBase64, timestamp } = validated

    // Decode base64 image
    let imageBuffer: Buffer
    try {
      // Remove data URL prefix if present
      const base64Data = vehicleImageBase64.replace(/^data:image\/\w+;base64,/, "")
      imageBuffer = Buffer.from(base64Data, "base64")
    } catch (error) {
      return NextResponse.json(
        { error: "Invalid base64 image data" },
        { status: 400 }
      )
    }

    // Process image with ALPR
    const alprResult = await processALPR(imageBuffer)

    // Verify vehicle using dual-channel engine
    const verificationTimestamp = timestamp ? new Date(timestamp) : new Date()
    const verificationResult = await verifyVehicleALPR(
      lotId,
      alprResult,
      verificationTimestamp
    )

    const processingTime = Date.now() - startTime

    // Check if response time meets 250ms target
    if (processingTime > 250) {
      console.warn(`ALPR verification latency exceeded 250ms: ${processingTime}ms`)
    }

    return NextResponse.json({
      success: verificationResult.success,
      verified: verificationResult.verified,
      plateNumber: verificationResult.plateNumber,
      action: verificationResult.action,
      bookingId: verificationResult.bookingId,
      vehicleNumber: verificationResult.vehicleNumber,
      message: verificationResult.message,
      alprConfidence: alprResult.confidence,
      processingTime,
      timestamp: verificationResult.timestamp.toISOString(),
    }, {
      headers: {
        "X-Processing-Time": processingTime.toString(),
      },
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request payload", details: error.errors },
        { status: 400 }
      )
    }

    console.error("ALPR verification error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}