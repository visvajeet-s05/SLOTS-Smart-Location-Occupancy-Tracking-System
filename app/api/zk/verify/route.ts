import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  generateOccupancyProofWithSalt,
  verifyOccupancyProof,
  persistZKProof,
  getZKProofStats,
  type ZKProof,
} from "@/lib/crypto/zk-proof"

const occupancyUpdateSchema = z.object({
  slotId: z.string(),
  rawOccupancyState: z.number().int().min(0).max(1),
  sensorConfidence: z.number().int().min(0).max(100),
  minConfidenceThreshold: z.number().int().min(0).max(100).default(50),
})

const proofVerificationSchema = z.object({
  proof: z.string(),
  publicSignals: z.array(z.string()),
  inputs: z.object({
    sensorConfidence: z.number(),
    rawOccupancyState: z.number(),
    salt: z.string(),
  }),
  outputs: z.object({
    occupancyCommitment: z.string(),
    isValidState: z.boolean(),
  }),
  timestamp: z.string(),
})

/**
 * POST /api/zk/verify
 * Receive telemetry/occupancy updates and generate ZK proof
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = occupancyUpdateSchema.parse(body)

    const { slotId, rawOccupancyState, sensorConfidence, minConfidenceThreshold } = validated

    // Generate ZK proof with automatic salt generation
    const proof = await generateOccupancyProofWithSalt(
      rawOccupancyState,
      sensorConfidence,
      slotId,
      minConfidenceThreshold
    )

    // Verify the generated proof
    const verification = await verifyOccupancyProof(proof)

    if (!verification.valid) {
      return NextResponse.json(
        {
          success: false,
          error: "Proof verification failed",
          details: verification.error,
        },
        { status: 400 }
      )
    }

    // Persist valid proof to database
    await persistZKProof(slotId, proof)

    return NextResponse.json({
      success: true,
      proof: {
        occupancyCommitment: proof.outputs.occupancyCommitment,
        isValidState: proof.outputs.isValidState,
        timestamp: proof.timestamp,
      },
      verification: {
        valid: verification.valid,
      },
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request payload", details: error.errors },
        { status: 400 }
      )
    }

    console.error("ZK verification API error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/zk/verify
 * Get ZK proof statistics
 */
export async function GET(req: NextRequest) {
  try {
    const stats = await getZKProofStats()

    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (error: any) {
    console.error("ZK stats API error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/zk/verify
 * Verify an existing ZK proof
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = proofVerificationSchema.parse(body)

    const proof: ZKProof = {
      ...validated,
      timestamp: new Date(validated.timestamp),
    }

    const verification = await verifyOccupancyProof(proof)

    return NextResponse.json({
      success: true,
      verification,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid proof payload", details: error.errors },
        { status: 400 }
      )
    }

    console.error("ZK proof verification API error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}