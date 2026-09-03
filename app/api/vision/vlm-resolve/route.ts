import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const vlmResolveSchema = z.object({
  taskId: z.string(),
  frameBase64: z.string(),
  bbox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  currentConfidence: z.number(),
  cameraId: z.string(),
  siteId: z.string(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = vlmResolveSchema.parse(body)

    const { taskId, frameBase64, bbox, currentConfidence, cameraId, siteId } = validated

    // Convert base64 to buffer
    const frameBuffer = Buffer.from(frameBase64, "base64")

    // Trigger VLM fallback
    const { triggerVlmFallback } = await import("@/lib/vision/vlm-fallback")
    const result = await triggerVlmFallback({
      frameBuffer,
      bbox,
      currentConfidence,
      cameraId,
      siteId,
    })

    return NextResponse.json({
      success: true,
      taskId,
      enqueued: result.enqueued,
      queueTaskId: result.taskId,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      )
    }

    console.error("VLM resolve error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * Get VLM queue status
 */
export async function GET() {
  const { getVlmQueueStatus } = await import("@/lib/vision/vlm-fallback")
  const status = getVlmQueueStatus()

  return NextResponse.json({
    queueSize: status.queueSize,
    processing: status.processing,
  })
}