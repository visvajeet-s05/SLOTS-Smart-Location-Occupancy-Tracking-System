import { NextRequest, NextResponse } from "next/server"
import { getEVSessionStatus } from "@/lib/hardware/ev-charger"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionId = (await params).id

  try {
    // Get EV session status
    const status = await getEVSessionStatus(sessionId)

    if (!status) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      session: status,
    })
  } catch (error: any) {
    console.error("EV session status error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}