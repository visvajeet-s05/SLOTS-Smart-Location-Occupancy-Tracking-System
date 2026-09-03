import { NextRequest, NextResponse } from "next/server"
import { getAuthSession, requireRole } from "@/lib/auth"
import { getPricingRules, updatePricingRules } from "@/lib/ml/pricing-engine"
import { logAuditEvent } from "@/lib/audit"
import { z } from "zod"

const updatePricingSchema = z.object({
  baseRatePerHour: z.number().positive().optional(),
  minRate: z.number().positive().optional(),
  maxRate: z.number().positive().optional(),
  occupancyMultiplier: z.number().positive().optional(),
  peakMultiplier: z.number().positive().optional(),
  eventMultiplier: z.number().positive().optional(),
  isDynamicEnabled: z.boolean().optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const siteId = (await params).siteId
  
  try {
    // Require OWNER or SUPER_ADMIN role
    await requireRole(["OWNER", "SUPER_ADMIN"])
    
    // Get pricing rules
    const pricingRules = await getPricingRules(siteId)
    
    return NextResponse.json({
      success: true,
      pricingRules,
    })
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    if (error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }
    
    console.error("Get pricing rules error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const siteId = (await params).siteId
  
  try {
    // Require OWNER or SUPER_ADMIN role
    await requireRole(["OWNER", "SUPER_ADMIN"])
    
    const session = await getAuthSession()
    const userId = session?.user?.id
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    // Validate request body
    const body = await req.json()
    const validated = updatePricingSchema.parse(body)
    
    // Update pricing rules
    const updatedRules = await updatePricingRules(siteId, validated)
    
    // Log audit event
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
    const userAgent = req.headers.get("user-agent") || "unknown"
    await logAuditEvent({
      userId,
      action: "PRICING_RULE_UPDATED",
      resource: `Site:${siteId}`,
      ipAddress: ip,
      userAgent,
      details: {
        updates: validated,
      },
    })
    
    return NextResponse.json({
      success: true,
      pricingRules: updatedRules,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      )
    }
    
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    if (error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }
    
    console.error("Update pricing rules error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}