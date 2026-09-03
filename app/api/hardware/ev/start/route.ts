import { NextRequest, NextResponse } from "next/server"
import { startEVChargingSession } from "@/lib/hardware/ev-charger"
import { getAuthSession } from "@/lib/auth"
import { z } from "zod"

const evStartSchema = z.object({
  slotId: z.string(),
  targetKwh: z.number().optional(),
  costPerKwh: z.number().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = evStartSchema.parse(body)

    const { slotId, targetKwh, costPerKwh } = validated

    const result = await startEVChargingSession({
      slotId,
      targetKwh,
      costPerKwh,
    })

    return NextResponse.json({
      success: result.success,
      sessionId: result.sessionId,
      message: result.message,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      )
    }

    console.error("EV start error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}