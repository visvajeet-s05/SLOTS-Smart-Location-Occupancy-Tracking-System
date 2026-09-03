import { PrismaClient } from "@prisma/client"
import { triggerBarrierOpen } from "@/lib/hardware/gate-controller"
import { logAuditEvent } from "@/lib/audit"
import { triggerVlmFallback } from "@/lib/vision/vlm-fallback"

const prisma = new PrismaClient()

interface FrameBuffer {
  frame: Buffer
  timestamp: number
  hash: string
}

interface ANPRResult {
  plateNumber: string
  confidence: number
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }
}

interface ProcessFrameResult {
  success: boolean
  plateNumber?: string
  confidence?: number
  actuateGate?: boolean
  message: string
}

/**
 * Vision & ANPR Optimization Layer
 * Implements motion detection, frame deduplication, and automatic gate actuation
 */
class ANPROptimizer {
  private frameBuffers: Map<string, FrameBuffer[]> = new Map()
  private readonly MAX_BUFFER_SIZE = 3
  private readonly MOTION_THRESHOLD = 30 // Pixel difference threshold
  private readonly CONFIDENCE_THRESHOLD = 0.85 // 85% confidence threshold

  /**
   * Generate simple hash of frame for deduplication
   */
  private generateFrameHash(frameBuffer: Buffer): string {
    // Sample pixels at regular intervals for hash generation
    const sampleRate = Math.floor(frameBuffer.length / 100)
    let hash = 0
    
    for (let i = 0; i < frameBuffer.length; i += sampleRate) {
      hash = ((hash << 5) - hash) + frameBuffer[i]
      hash = hash & hash // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16)
  }

  /**
   * Calculate motion score between two frames
   */
  private calculateMotionScore(frame1: Buffer, frame2: Buffer): number {
    const minLength = Math.min(frame1.length, frame2.length)
    let differences = 0
    const sampleRate = Math.floor(minLength / 1000) // Sample every 1000th byte
    
    for (let i = 0; i < minLength; i += sampleRate) {
      if (Math.abs(frame1[i] - frame2[i]) > this.MOTION_THRESHOLD) {
        differences++
      }
    }
    
    return differences / (minLength / sampleRate)
  }

  /**
   * Check if frame contains significant motion
   */
  private hasSignificantMotion(cameraId: string, newFrame: Buffer): boolean {
    const buffer = this.frameBuffers.get(cameraId)
    
    if (!buffer || buffer.length === 0) {
      return true // First frame always processed
    }
    
    const lastFrame = buffer[buffer.length - 1]
    const motionScore = this.calculateMotionScore(lastFrame.frame, newFrame)
    
    // Motion threshold: 5% of sampled pixels must differ
    return motionScore > 0.05
  }

  /**
   * Check if frame is duplicate of recent frames
   */
  private isDuplicateFrame(cameraId: string, newFrameHash: string): boolean {
    const buffer = this.frameBuffers.get(cameraId)
    
    if (!buffer || buffer.length === 0) {
      return false
    }
    
    // Check if hash matches any recent frame
    return buffer.some(entry => entry.hash === newFrameHash)
  }

  /**
   * Update frame buffer
   */
  private updateFrameBuffer(cameraId: string, frame: Buffer, timestamp: number): void {
    const hash = this.generateFrameHash(frame)
    const buffer = this.frameBuffers.get(cameraId) || []
    
    buffer.push({ frame, timestamp, hash })
    
    // Keep only recent frames
    if (buffer.length > this.MAX_BUFFER_SIZE) {
      buffer.shift()
    }
    
    this.frameBuffers.set(cameraId, buffer)
  }

  /**
   * Simulate ANPR inference (in production, this would call YOLO/OCR model)
   */
  private async simulateANPRInference(
    frame: Buffer
  ): Promise<ANPRResult | null> {
    // In production, this would:
    // 1. Send frame to YOLO model for vehicle detection
    // 2. Extract license plate region
    // 3. Run OCR on plate region
    // 4. Return plate number and confidence score
    
    // For simulation, return null (no plate detected)
    // In real implementation, this would be:
    // const result = await fetch('http://anpr-service/infer', {
    //   method: 'POST',
    //   body: frame,
    //   headers: { 'Content-Type': 'application/octet-stream' }
    // })
    // return await result.json()
    
    return null
  }

  /**
   * Normalize bounding box coordinates
   */
  private normalizeBoundingBox(
    bbox: { x: number; y: number; width: number; height: number },
    frameWidth: number,
    frameHeight: number
  ): { x: number; y: number; width: number; height: number } {
    return {
      x: bbox.x / frameWidth,
      y: bbox.y / frameHeight,
      width: bbox.width / frameWidth,
      height: bbox.height / frameHeight,
    }
  }

  /**
   * Check if vehicle has active booking
   */
  private async hasActiveBooking(plateNumber: string, siteId: string): Promise<boolean> {
    try {
      // Simplified: just check if vehicle has any active booking
      // In production, this would include site filtering
      const activeBooking = await prisma.booking.findFirst({
        where: {
          vehicleNumber: plateNumber,
          status: {
            in: ["CONFIRMED", "ACTIVE"],
          },
          startTime: {
            lte: new Date(),
          },
          endTime: {
            gte: new Date(),
          },
        },
      })

      return !!activeBooking
    } catch (error) {
      console.error("Error checking active booking:", error)
      return false
    }
  }

  /**
   * Process camera frame with motion detection and ANPR
   */
  async processCameraFrame({
    siteId,
    cameraId,
    frameBase64,
    timestamp,
  }: {
    siteId: string
    cameraId: string
    frameBase64: string
    timestamp?: Date
  }): Promise<ProcessFrameResult> {
    try {
      // Convert base64 to buffer
      const frameBuffer = Buffer.from(frameBase64, "base64")
      const frameTimestamp = timestamp?.getTime() || Date.now()

      // Generate frame hash
      const frameHash = this.generateFrameHash(frameBuffer)

      // Check for duplicate frame
      if (this.isDuplicateFrame(cameraId, frameHash)) {
        return {
          success: false,
          message: "Duplicate frame - skipping",
        }
      }

      // Check for motion
      if (!this.hasSignificantMotion(cameraId, frameBuffer)) {
        return {
          success: false,
          message: "No significant motion detected - skipping",
        }
      }

      // Update frame buffer
      this.updateFrameBuffer(cameraId, frameBuffer, frameTimestamp)

      // Run ANPR inference
      const anprResult = await this.simulateANPRInference(frameBuffer)

      if (!anprResult) {
        return {
          success: false,
          message: "No license plate detected",
        }
      }

      // Check confidence threshold
      if (anprResult.confidence < this.CONFIDENCE_THRESHOLD) {
        // If confidence is in fallback range (0.15 - 0.40), trigger VLM
        if (anprResult.confidence >= 0.15 && anprResult.confidence <= 0.40) {
          await triggerVlmFallback({
            frameBuffer,
            bbox: anprResult.boundingBox,
            currentConfidence: anprResult.confidence,
            cameraId,
            siteId,
          })

          return {
            success: false,
            message: `Low confidence (${(anprResult.confidence * 100).toFixed(1)}%) - VLM fallback triggered`,
          }
        }

        return {
          success: false,
          message: `Low confidence (${(anprResult.confidence * 100).toFixed(1)}%) - plate rejected`,
        }
      }

      // Check for active booking
      const hasBooking = await this.hasActiveBooking(anprResult.plateNumber, siteId)

      let actuateGate = false
      if (hasBooking) {
        // Trigger barrier open
        const gateResult = await triggerBarrierOpen({
          siteId,
          gateId: cameraId, // Use camera ID as gate ID for simplicity
          triggerReason: "ALPR",
          vehicleNumber: anprResult.plateNumber,
        })

        actuateGate = gateResult.success

        // Log audit event
        await logAuditEvent({
          userId: "SYSTEM",
          action: "ANPR_GATE_TRIGGERED",
          resource: `Camera:${cameraId}`,
          ipAddress: "vision-pipeline",
          userAgent: "anpr-optimizer",
          details: {
            plateNumber: anprResult.plateNumber,
            confidence: anprResult.confidence,
            gateActuated: actuateGate,
          },
        })
      }

      return {
        success: true,
        plateNumber: anprResult.plateNumber,
        confidence: anprResult.confidence,
        actuateGate,
        message: hasBooking
          ? actuateGate
            ? "Plate recognized and gate triggered"
            : "Plate recognized but gate failed to trigger"
          : "Plate recognized but no active booking",
      }
    } catch (error: any) {
      console.error("Error processing camera frame:", error)
      return {
        success: false,
        message: error.message || "Failed to process frame",
      }
    }
  }

  /**
   * Clear frame buffer for a camera
   */
  clearBuffer(cameraId: string): void {
    this.frameBuffers.delete(cameraId)
  }

  /**
   * Get buffer status
   */
  getBufferStatus(cameraId: string): { size: number; lastTimestamp?: number } {
    const buffer = this.frameBuffers.get(cameraId)
    return {
      size: buffer?.length || 0,
      lastTimestamp: buffer?.[buffer.length - 1]?.timestamp,
    }
  }
}

// Singleton instance
const anprOptimizer = new ANPROptimizer()

export { anprOptimizer }
export type { ProcessFrameResult, ANPRResult }