import { NextRequest, NextResponse } from "next/server"
import { getAuthSession, isAuthenticated } from "@/lib/auth"
import { createStripeSubscription } from "@/lib/payments/subscriptions"
import { z } from "zod"

const subscribeSchema = z.object({
  tier: z.enum(["MONTHLY_PASS", "ANNUAL_PASS", "VIP_UNLIMITED"]),
  siteId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    const isAuth = await isAuthenticated()
    if (!isAuth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const session = await getAuthSession()
    const userId = session?.user?.id
    const userEmail = session?.user?.email

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Validate request body
    const body = await req.json()
    const validated = subscribeSchema.parse(body)

    // Create Stripe subscription checkout
    const result = await createStripeSubscription({
      userId,
      tier: validated.tier as any,
      siteId: validated.siteId,
      customerEmail: userEmail,
    })

    return NextResponse.json({
      success: true,
      checkoutUrl: result.url,
      sessionId: result.sessionId,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Create subscription error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}