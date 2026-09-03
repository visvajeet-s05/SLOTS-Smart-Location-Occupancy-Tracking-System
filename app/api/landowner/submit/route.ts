import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const landownerSubmissionSchema = z.object({
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerPhone: z.string().min(10),
  ownershipProofDocument: z.string().optional(),
  lengthMeters: z.number().min(10),
  widthMeters: z.number().min(10),
  entryLanes: z.number().min(1).max(5),
  exitLanes: z.number().min(1).max(5),
  isMultiStorey: z.boolean(),
  floors: z.number().min(1).max(10),
  surfaceType: z.enum(["ASPHALT", "PAVED", "UNPAVED"]),
  gpsLat: z.number(),
  gpsLng: z.number(),
  plotAddress: z.string().optional(),
  avgHourlyRateINR: z.number().min(10).max(100),
  surveyResult: z.object({
    capacity: z.object({
      totalSlots: z.number(),
      accessibleSlots: z.number(),
      evChargingSlots: z.number(),
      regularSlots: z.number(),
      slotLayout: z.object({
        rows: z.number(),
        columns: z.number(),
        spacingMeters: z.number(),
      }),
    }),
    hardwareBOM: z.object({
      cameras: z.array(z.object({
        item: z.string(),
        quantity: z.number(),
        unitCostINR: z.number(),
        totalCostINR: z.number(),
      })),
      barrierGates: z.array(z.object({
        item: z.string(),
        quantity: z.number(),
        unitCostINR: z.number(),
        totalCostINR: z.number(),
      })),
      edgeNodes: z.array(z.object({
        item: z.string(),
        quantity: z.number(),
        unitCostINR: z.number(),
        totalCostINR: z.number(),
      })),
      evChargers: z.array(z.object({
        item: z.string(),
        quantity: z.number(),
        unitCostINR: z.number(),
        totalCostINR: z.number(),
      })),
      sensors: z.array(z.object({
        item: z.string(),
        quantity: z.number(),
        unitCostINR: z.number(),
        totalCostINR: z.number(),
      })),
      networking: z.array(z.object({
        item: z.string(),
        quantity: z.number(),
        unitCostINR: z.number(),
        totalCostINR: z.number(),
      })),
      totalEstimatedCostINR: z.number(),
    }),
    revenueProjection: z.object({
      estimatedMonthlyGrossRevenueINR: z.number(),
      estimatedMonthlyNetRevenueINR: z.number(),
      landownerShareINR: z.number(),
      platformShareINR: z.number(),
      occupancyRate: z.number(),
      avgHourlyRateINR: z.number(),
    }),
    recommendations: z.array(z.string()),
  }),
})

/**
 * POST /api/landowner/submit
 * Saves site submission to database and emails/logs onboarding survey report
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = landownerSubmissionSchema.parse(body)

    const {
      ownerName,
      ownerEmail,
      ownerPhone,
      ownershipProofDocument,
      lengthMeters,
      widthMeters,
      entryLanes,
      exitLanes,
      isMultiStorey,
      floors,
      surfaceType,
      gpsLat,
      gpsLng,
      plotAddress,
      avgHourlyRateINR,
      surveyResult,
    } = validated

    // Save landowner submission to database
    const submission = await prisma.landownerSubmission.create({
      data: {
        ownerName,
        ownerEmail,
        ownerPhone,
        ownershipProofDocument,
        lengthMeters,
        widthMeters,
        areaSqMeters: lengthMeters * widthMeters,
        entryLanes,
        exitLanes,
        isMultiStorey,
        floors,
        surfaceType,
        gpsLat,
        gpsLng,
        plotAddress,
        avgHourlyRateINR,
        surveyResult: surveyResult as any,
        status: "PENDING_REVIEW",
        submittedAt: new Date(),
      },
    })

    // Log onboarding survey report summary
    console.log("=== LANDOWNER SUBMISSION SUMMARY ===")
    console.log(`Submission ID: ${submission.id}`)
    console.log(`Owner: ${ownerName} (${ownerEmail})`)
    console.log(`Phone: ${ownerPhone}`)
    console.log(`Plot Dimensions: ${lengthMeters}m × ${widthMeters}m (${lengthMeters * widthMeters} sq m)`)
    console.log(`Surface: ${surfaceType}`)
    console.log(`Multi-Storey: ${isMultiStorey ? `Yes (${floors} floors)` : "No"}`)
    console.log(`Entry/Exit Lanes: ${entryLanes}/${exitLanes}`)
    console.log(`GPS: ${gpsLat}, ${gpsLng}`)
    console.log(``)
    console.log(`CAPACITY:`)
    console.log(`  Total Slots: ${surveyResult.capacity.totalSlots}`)
    console.log(`  Regular: ${surveyResult.capacity.regularSlots}`)
    console.log(`  Accessible: ${surveyResult.capacity.accessibleSlots}`)
    console.log(`  EV Charging: ${surveyResult.capacity.evChargingSlots}`)
    console.log(``)
    console.log(`HARDWARE BOM:`)
    console.log(`  Cameras: ${surveyResult.hardwareBOM.cameras.length} units`)
    console.log(`  Barrier Gates: ${surveyResult.hardwareBOM.barrierGates.length} units`)
    console.log(`  Edge Nodes: ${surveyResult.hardwareBOM.edgeNodes.length} units`)
    console.log(`  EV Chargers: ${surveyResult.hardwareBOM.evChargers.length} units`)
    console.log(`  Total Estimated Cost: ₹${surveyResult.hardwareBOM.totalEstimatedCostINR.toLocaleString()}`)
    console.log(``)
    console.log(`REVENUE PROJECTION:`)
    console.log(`  Monthly Gross: ₹${surveyResult.revenueProjection.estimatedMonthlyGrossRevenueINR.toLocaleString()}`)
    console.log(`  Landowner Share (70%): ₹${surveyResult.revenueProjection.landownerShareINR.toLocaleString()}`)
    console.log(`  Platform Share (30%): ₹${surveyResult.revenueProjection.platformShareINR.toLocaleString()}`)
    console.log(`  Occupancy Rate: ${(surveyResult.revenueProjection.occupancyRate * 100).toFixed(0)}%`)
    console.log(``)

    if (surveyResult.recommendations.length > 0) {
      console.log(`RECOMMENDATIONS:`)
      surveyResult.recommendations.forEach((rec, idx) => {
        console.log(`  ${idx + 1}. ${rec}`)
      })
    }

    console.log(`=== END SUBMISSION SUMMARY ===`)

    // Send email notification to landowner
    try {
      const { sendLandownerConfirmationEmail } = await import("@/lib/notifications/email-service")
      
      const landownerEmailResult = await sendLandownerConfirmationEmail({
        landownerName: submission.ownerName,
        landownerEmail: submission.ownerEmail,
        submissionId: submission.id,
        propertyName: `${submission.lengthMeters}m x ${submission.widthMeters}m Property`,
        propertyAddress: submission.plotAddress || "Address not provided",
        estimatedMonthlyRevenue: surveyResult.revenueProjection.estimatedMonthlyGrossRevenueINR,
        landownerShare: surveyResult.revenueProjection.landownerShareINR,
        recommendations: surveyResult.recommendations,
      })
      
      if (landownerEmailResult.success) {
        console.log(`✅ Landowner confirmation email sent to ${submission.ownerEmail}`)
      } else {
        console.warn(`⚠️ Failed to send landowner confirmation email: ${landownerEmailResult.error}`)
      }
    } catch (emailError) {
      console.warn("Landowner email notification failed, continuing:", emailError)
    }

    // Send email notification to SLOTS team
    try {
      const { sendInternalTeamNotificationEmail } = await import("@/lib/notifications/email-service")
      
      const teamEmailResult = await sendInternalTeamNotificationEmail({
        submissionId: submission.id,
        landownerName: submission.ownerName,
        landownerEmail: submission.ownerEmail,
        propertyName: `${submission.lengthMeters}m x ${submission.widthMeters}m Property`,
        propertyAddress: submission.plotAddress || "Address not provided",
        estimatedCapacity: Math.floor((submission.lengthMeters * submission.widthMeters) / 12), // Rough estimate
        estimatedMonthlyRevenue: surveyResult.revenueProjection.estimatedMonthlyGrossRevenueINR,
        urgency: "MEDIUM", // Could be calculated based on revenue potential
      })
      
      if (teamEmailResult.success) {
        console.log(`✅ Internal team notification email sent`)
      } else {
        console.warn(`⚠️ Failed to send internal team notification email: ${teamEmailResult.error}`)
      }
    } catch (emailError) {
      console.warn("Internal team email notification failed, continuing:", emailError)
    }

    // Create lead in CRM system (placeholder for future CRM integration)
    try {
      console.log(`📝 Creating lead in CRM system for submission ${submission.id}`)
      // TODO: Implement actual CRM integration when CRM system is available
      // For now, we log the action for tracking
      console.log(`📝 CRM lead creation logged (actual integration pending)`)
    } catch (crmError) {
      console.warn("CRM lead creation failed, continuing:", crmError)
    }

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
      message: "Site submission received successfully",
      revenueProjection: {
        estimatedMonthlyGrossRevenueINR: surveyResult.revenueProjection.estimatedMonthlyGrossRevenueINR,
        landownerShareINR: surveyResult.revenueProjection.landownerShareINR,
        platformShareINR: surveyResult.revenueProjection.platformShareINR,
      },
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid submission data", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Landowner submission error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}