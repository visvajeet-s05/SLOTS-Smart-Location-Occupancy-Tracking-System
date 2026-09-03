import { NextRequest, NextResponse } from "next/server"
import { calculateDynamicPrice } from "@/lib/ml/pricing-engine"
import { z } from "zod"

const pricingSchema = z.object({
  siteId: z.string(),
  parkingBayId: z.string().optional(),
  bayType: z.enum(["STANDARD", "ACCESSIBLE", "EV_CHARGING", "VIP", "TWO_WHEELER"]).optional(),
  startTime: z.string(),
  endTime: z.string(),
})

export async function POST(req: NextRequest) {
  try {
    // Validate request body
    const body = await req.json()
    const validated = pricingSchema.parse(body)

    const { siteId, parkingBayId, bayType, startTime, endTime } = validated

    // Calculate duration
    const start = new Date(startTime)
    const end = new Date(endTime)
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)

    if (durationHours <= 0) {
      return NextResponse.json(
        { error: "End time must be after start time" },
        { status: 400 }
      )
    }

    // Calculate dynamic price
    const pricing = await calculateDynamicPrice({
      siteId,
      parkingBayId,
      bayType: bayType as any,
      durationHours,
      startTime: start,
    })

    return NextResponse.json({
      success: true,
      pricing: {
        basePrice: pricing.basePrice,
        hourlyRate: pricing.finalPrice,
        totalPrice: pricing.totalPrice,
        durationHours,
        breakdown: {
          occupancyFactor: pricing.occupancyFactor,
          demandFactor: pricing.demandFactor,
          bayTypePremium: pricing.bayTypePremium,
          timeOfDayFactor: pricing.timeOfDayFactor,
          multiplier: pricing.multiplier,
        },
        metrics: {
          demandScore: pricing.demandScore,
          occupancyRate: pricing.occupancyRate,
        },
        explanation: pricing.explanation,
      },
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Calculate pricing error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}