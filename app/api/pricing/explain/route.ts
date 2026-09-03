import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { 
  decomposePricingFromRL, 
  decomposePricingFromFactors,
  checkSurgeCapCompliance 
} from "@/lib/pricing/explainability"
import { runFairnessAudit, recordPricingEvent } from "@/lib/pricing/fairness-audit"

const pricingExplainSchema = z.object({
  lotId: z.string(),
  baseRate: z.number().positive(),
  currentOccupancy: z.number().min(0).max(1),
  demandScore: z.number().min(0).max(1),
  hasEvent: z.boolean(),
  eventIntensity: z.number().min(0).max(1).optional(),
  timeOfDay: z.enum(["morning", "day", "evening", "night"]),
  bookingDuration: z.number().positive(),
  // Either provide RL action or direct factors
  rlAction: z.number().min(0).max(1).optional(),
  occupancyMultiplier: z.number().positive().optional(),
  demandMultiplier: z.number().positive().optional(),
  eventMultiplier: z.number().positive().optional(),
})

const auditQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

/**
 * POST /api/pricing/explain
 * Returns real-time pricing decomposition for a given lot ID and booking duration
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = pricingExplainSchema.parse(body)

    const {
      lotId,
      baseRate,
      currentOccupancy,
      demandScore,
      hasEvent,
      eventIntensity,
      timeOfDay,
      bookingDuration,
      rlAction,
      occupancyMultiplier,
      demandMultiplier,
      eventMultiplier,
    } = validated

    const context = {
      lotId,
      baseRate,
      currentOccupancy,
      demandScore,
      hasEvent,
      eventIntensity,
      timeOfDay,
      bookingDuration,
    }

    let decomposition

    // Decompose pricing based on input type
    if (rlAction !== undefined) {
      // Use RL action
      decomposition = decomposePricingFromRL(context, {
        action: rlAction,
        confidence: 0.9,
      })
    } else if (
      occupancyMultiplier !== undefined &&
      demandMultiplier !== undefined &&
      eventMultiplier !== undefined
    ) {
      // Use direct factors
      decomposition = decomposePricingFromFactors(
        context,
        occupancyMultiplier,
        demandMultiplier,
        eventMultiplier
      )
    } else {
      return NextResponse.json(
        { error: "Either rlAction or all multipliers must be provided" },
        { status: 400 }
      )
    }

    // Check surge cap compliance
    const surgeCompliance = checkSurgeCapCompliance(decomposition)

    // Record pricing event for audit
    recordPricingEvent(decomposition)

    // ULB compliance flags
    const ulbCompliance = {
      surgeCapCompliant: surgeCompliance.compliant,
      surgeCapValue: surgeCompliance.cap,
      currentSurgeMultiplier: surgeCompliance.totalMultiplier,
      exceededBy: surgeCompliance.exceededBy,
      requiresAction: !surgeCompliance.compliant,
    }

    return NextResponse.json({
      success: true,
      decomposition,
      surgeCompliance,
      ulbCompliance,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Pricing explanation error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/pricing/explain
 * Returns fairness audit report for pricing across cohorts
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const validated = auditQuerySchema.parse({
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    })

    let auditPeriod
    if (validated.startDate && validated.endDate) {
      auditPeriod = {
        start: new Date(validated.startDate),
        end: new Date(validated.endDate),
      }
    }

    // Run fairness audit
    const auditReport = runFairnessAudit(auditPeriod)

    return NextResponse.json({
      success: true,
      auditReport,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Fairness audit error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}