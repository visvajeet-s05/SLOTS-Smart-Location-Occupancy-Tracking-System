import { NextRequest, NextResponse } from "next/server"
import { getAuthSession, isAuthenticated } from "@/lib/auth"
import { getSubscriptionPlans } from "@/lib/payments/subscriptions"

export async function GET(req: NextRequest) {
  try {
    // Require authentication
    const isAuth = await isAuthenticated()
    if (!isAuth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const plans = getSubscriptionPlans()

    return NextResponse.json({
      success: true,
      plans,
    })
  } catch (error: any) {
    console.error("Get subscription plans error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}