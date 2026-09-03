import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { evaluateSlotCompliance, getActiveViolations, type ComplianceCheckResult } from "@/lib/compliance/reserved-slots"
import { dispatchComplianceAlert, type ComplianceAlert } from "@/lib/notifications/compliance-alerts"
import { dispatchMQTTAlert } from "@/lib/notifications/mqtt-alerts"

const complianceCheckSchema = z.object({
  slotId: z.string(),
  vehiclePlateNumber: z.string(),
  sensorState: z.number().int().min(0).max(1),
  lotId: z.string().optional(),
})

/**
 * POST /api/compliance/check
 * Compliance check endpoint for ALPR or camera occupancy transitions
 * Returns structured alerts for staff dashboards
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await req.json()
    const validated = complianceCheckSchema.parse(body)

    const { slotId, vehiclePlateNumber, sensorState, lotId } = validated

    // Evaluate slot compliance
    const result = await evaluateSlotCompliance(
      slotId,
      vehiclePlateNumber,
      sensorState
    )

    const processingTime = Date.now() - startTime

    // Check if processing time meets 500ms target
    if (processingTime > 500) {
      console.warn(`Compliance check latency exceeded 500ms: ${processingTime}ms`)
    }

    // Dispatch WebSocket/MQTT alerts for violations
    if (!result.compliant && result.violation) {
      try {
        console.log(`Compliance violation detected: ${result.violation.type} on slot ${slotId}`)
        
        // Dispatch WebSocket alert to operator dashboards
        if (lotId) {
          const alert: ComplianceAlert = {
            type: result.violation.type as any,
            lotId,
            slotId,
            vehiclePlateNumber,
            expectedPlateNumber: result.violation.expectedPlate,
            severity: result.violation.severity || "MEDIUM",
            timestamp: new Date(),
            metadata: result.violation,
          }
          
          dispatchComplianceAlert(alert)
          
          // Dispatch MQTT alert to lot attendant devices
          await dispatchMQTTAlert(lotId, alert)
        }
      } catch (alertError) {
        console.warn("Alert dispatch failed, continuing:", alertError)
      }
    }

    return NextResponse.json({
      success: true,
      compliant: result.compliant,
      violationType: result.violationType,
      actionRequired: result.actionRequired,
      violation: result.violation,
      processingTime,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        "X-Processing-Time": processingTime.toString(),
      },
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request payload", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Compliance check error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}