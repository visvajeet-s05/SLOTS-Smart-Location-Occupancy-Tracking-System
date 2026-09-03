import { NextRequest, NextResponse } from "next/server"
import { stopEVChargingSession } from "@/lib/hardware/ev-charger"
import { getAuthSession } from "@/lib/auth"
import { z } from "zod"

const evStopSchema = z.object({
  sessionId: z.string(),
})

export async function POST(req: NextRequest) {
  try {
    // Validate request body
    const body = await req.json()
    const validated = evStopSchema.parse(body)

    const { sessionId } = validated

    // Stop EV charging session
    const result = await stopEVChargingSession(sessionId)

    return NextResponse.json({
      success: result.success,
      totalEnergyKwh: result.totalEnergyKwh,
      totalCost: result.totalCost,
      durationMinutes: result.durationMinutes,
      message: result.message,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      )
    }

    console.error("EV stop error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}