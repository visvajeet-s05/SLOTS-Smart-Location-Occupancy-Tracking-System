import { NextRequest, NextResponse } from "next/server"
import { getAuthSession, isAuthenticated } from "@/lib/auth"
import { verifyPolygonUSDCTransaction } from "@/lib/payments/web3"
import { prisma } from "@/lib/prisma"
import { confirmBooking } from "@/lib/booking-engine"
import { logAuditEvent } from "@/lib/audit"
import { z } from "zod"

const web3PaymentSchema = z.object({
  bookingId: z.string(),
  txHash: z.string(),
  walletAddress: z.string(),
  isTestnet: z.boolean().optional().default(false),
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

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Validate request body
    const body = await req.json()
    const validated = web3PaymentSchema.parse(body)

    // Get booking details
    const booking = await prisma.booking.findUnique({
      where: { id: validated.bookingId },
    })

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      )
    }

    // Verify user owns the booking
    if (booking.customerId !== userId) {
      return NextResponse.json(
        { error: "You can only pay for your own bookings" },
        { status: 403 }
      )
    }

    // Verify Polygon USDC transaction
    const verification = await verifyPolygonUSDCTransaction({
      txHash: validated.txHash,
      expectedAmount: booking.amount,
      userWalletAddress: validated.walletAddress,
      isTestnet: validated.isTestnet,
    })

    if (!verification.valid) {
      return NextResponse.json(
        { error: "Transaction verification failed" },
        { status: 400 }
      )
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        bookingId: validated.bookingId,
        userId,
        amount: verification.amount,
        currency: "USDC",
        paymentMethod: "POLYGON_USDC",
        status: "COMPLETED",
        txHash: validated.txHash,
        fromAddress: validated.walletAddress,
        cryptoToken: "USDC",
        cryptoChain: validated.isTestnet ? "POLYGON_AMOY" : "POLYGON",
        confirmedAt: new Date(),
      },
    })

    // Confirm booking
    await confirmBooking(validated.bookingId)

    // Log audit event
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
    const userAgent = req.headers.get("user-agent") || "unknown"
    await logAuditEvent({
      userId,
      action: "WEB3_PAYMENT_SUCCESS",
      resource: `Payment:${payment.id}`,
      ipAddress: ip,
      userAgent,
      details: {
        bookingId: validated.bookingId,
        txHash: validated.txHash,
        amount: verification.amount,
        chain: validated.isTestnet ? "POLYGON_AMOY" : "POLYGON",
      },
    })

    return NextResponse.json({
      success: true,
      payment: {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        txHash: payment.txHash,
      },
      verification,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Web3 payment verification error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}