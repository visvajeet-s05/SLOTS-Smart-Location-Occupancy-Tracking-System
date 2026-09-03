import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getParkingBookingClient, type ContractConfig } from "@/lib/web3/contract-client"

const settleBookingSchema = z.object({
  bookingId: z.number(),
  verificationHash: z.string(),
  // Optional: if not provided, uses default config from environment
  contractAddress: z.string().optional(),
  privateKey: z.string().optional(),
})

/**
 * POST /api/web3/settle
 * Trigger on-chain settlement when ALPR or QR scan occurs at entrance barrier
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = settleBookingSchema.parse(body)

    const { bookingId, verificationHash, contractAddress, privateKey } = validated

    // Build contract config
    const config: ContractConfig = {
      contractAddress: contractAddress || process.env.PARKING_CONTRACT_ADDRESS || "",
      rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      privateKey: privateKey || process.env.PRIVATE_KEY,
      polygonScanApiKey: process.env.POLYGONSCAN_API_KEY,
    }

    if (!config.contractAddress) {
      return NextResponse.json(
        { error: "Contract address not configured" },
        { status: 500 }
      )
    }

    // Initialize Web3 client
    const client = getParkingBookingClient(config)

    // Get booking details first (read-only)
    const booking = await client.getBooking(bookingId)
    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found on-chain" },
        { status: 404 }
      )
    }

    // Confirm check-in on-chain
    const checkInResult = await client.confirmCheckIn(bookingId, verificationHash)

    if (!checkInResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: checkInResult.error,
        },
        { status: 400 }
      )
    }

    // Get PolygonScan URL
    const polygonScanUrl = client.getPolygonScanUrl(checkInResult.txHash || "")

    return NextResponse.json({
      success: true,
      txHash: checkInResult.txHash,
      blockNumber: checkInResult.blockNumber?.toString(),
      polygonScanUrl,
      bookingId,
      verified: true,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request payload", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Web3 settlement error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}