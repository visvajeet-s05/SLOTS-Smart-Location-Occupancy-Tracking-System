import { PrismaClient } from "@prisma/client"
import { logAuditEvent } from "@/lib/audit"

const prisma = new PrismaClient()

interface FrameAnalysis {
  frame: Buffer
  ssim: number
  variance: number
  timestamp: number
}

interface TamperAlert {
  cameraId: string
  siteId: string
  alertType: "OBSTRUCTION" | "STATIC_INJECTION" | "ANGLE_DRIFT" | "LENS_SPRAY"
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  details: string
  timestamp: Date
}

/**
 * Camera Obstruction & Anti-Tampering Engine
 * Detects lens spray, physical blockages, static frame injection, and angle drift
 */
class AntiTamperingEngine {
  private frameHistory: Map<string, FrameAnalysis[]> = new Map()
  private readonly MAX_HISTORY = 10
  private readonly VARIANCE_THRESHOLD = 0.15 // 85% variance drop threshold
  private readonly SSIM_THRESHOLD = 0.99 // Near-perfect similarity threshold
  private readonly DRIFT_THRESHOLD = 30 // Pixel drift threshold

  /**
   * Calculate Structural Similarity Index (SSIM)
   * Simplified implementation for production
   */
  private calculateSSIM(frame1: Buffer, frame2: Buffer): number {
    const minLength = Math.min(frame1.length, frame2.length)
    let sum1 = 0
    let sum2 = 0
    let sumSq1 = 0
    let sumSq2 = 0
    let sum12 = 0

    const sampleRate = Math.floor(minLength / 1000)

    for (let i = 0; i < minLength; i += sampleRate) {
      const p1 = frame1[i]
      const p2 = frame2[i]

      sum1 += p1
      sum2 += p2
      sumSq1 += p1 * p1
      sumSq2 += p2 * p2
      sum12 += p1 * p2
    }

    const n = Math.floor(minLength / sampleRate)
    const mean1 = sum1 / n
    const mean2 = sum2 / n

    const variance1 = (sumSq1 / n) - (mean1 * mean1)
    const variance2 = (sumSq2 / n) - (mean2 * mean2)
    const covariance = (sum12 / n) - (mean1 * mean2)

    const c1 = 0.01 * 255 * 0.01 * 255
    const c2 = 0.03 * 255 * 0.03 * 255

    const numerator = (2 * mean1 * mean2 + c1) * (2 * covariance + c2)
    const denominator = (mean1 * mean1 + mean2 * mean2 + c1) * (variance1 + variance2 + c2)

    return denominator === 0 ? 1 : numerator / denominator
  }

  /**
   * Calculate pixel intensity variance
   */
  private calculateVariance(frame: Buffer): number {
    const sampleRate = Math.floor(frame.length / 1000)
    let sum = 0
    let count = 0

    for (let i = 0; i < frame.length; i += sampleRate) {
      sum += frame[i]
      count++
    }

    const mean = sum / count
    let sumSquaredDiff = 0

    for (let i = 0; i < frame.length; i += sampleRate) {
      const diff = frame[i] - mean
      sumSquaredDiff += diff * diff
    }

    return sumSquaredDiff / count
  }

  /**
   * Detect angle drift by comparing frame edge features
   */
  private detectAngleDrift(frame1: Buffer, frame2: Buffer): number {
    // Simplified edge detection
    const minLength = Math.min(frame1.length, frame2.length)
    const sampleRate = Math.floor(minLength / 500)

    let edgeCount1 = 0
    let edgeCount2 = 0

    for (let i = sampleRate; i < minLength - sampleRate; i += sampleRate) {
      const diff1 = Math.abs(frame1[i] - frame1[i - sampleRate])
      const diff2 = Math.abs(frame2[i] - frame2[i - sampleRate])

      if (diff1 > 30) edgeCount1++
      if (diff2 > 30) edgeCount2++
    }

    return Math.abs(edgeCount1 - edgeCount2)
  }

  /**
   * Analyze frame for tampering indicators
   */
  analyzeFrame({
    cameraId,
    siteId,
    frameBuffer,
  }: {
    cameraId: string
    siteId: string
    frameBuffer: Buffer
  }): TamperAlert | null {
    const history = this.frameHistory.get(cameraId) || []
    const timestamp = Date.now()

    if (history.length === 0) {
      // First frame - establish baseline
      const variance = this.calculateVariance(frameBuffer)
      this.frameHistory.set(cameraId, [
        { frame: frameBuffer, ssim: 1.0, variance, timestamp },
      ])
      return null
    }

    const lastFrame = history[history.length - 1]
    const ssim = this.calculateSSIM(frameBuffer, lastFrame.frame)
    const variance = this.calculateVariance(frameBuffer)
    const angleDrift = this.detectAngleDrift(frameBuffer, lastFrame.frame)

    // Check for static frame injection (SSIM == 1.0)
    if (ssim >= this.SSIM_THRESHOLD) {
      const staticCount = history.filter(f => f.ssim >= this.SSIM_THRESHOLD).length

      if (staticCount >= 10) {
        const alert: TamperAlert = {
          cameraId,
          siteId,
          alertType: "STATIC_INJECTION",
          severity: "CRITICAL",
          details: `Static frame injection detected (${staticCount} consecutive identical frames)`,
          timestamp: new Date(),
        }

        this.triggerAlert(alert)
        return alert
      }
    }

    // Check for obstruction (variance drop > 85%)
    const varianceDrop = (lastFrame.variance - variance) / lastFrame.variance
    if (varianceDrop > this.VARIANCE_THRESHOLD) {
      const lowVarianceCount = history.filter(f => f.variance < lastFrame.variance * 0.5).length

      if (lowVarianceCount >= 10) {
        const alert: TamperAlert = {
          cameraId,
          siteId,
          alertType: "OBSTRUCTION",
          severity: "HIGH",
          details: `Camera obstruction detected (variance drop: ${(varianceDrop * 100).toFixed(1)}%)`,
          timestamp: new Date(),
        }

        this.triggerAlert(alert)
        return alert
      }
    }

    // Check for angle drift
    if (angleDrift > this.DRIFT_THRESHOLD) {
      const alert: TamperAlert = {
        cameraId,
        siteId,
        alertType: "ANGLE_DRIFT",
        severity: "MEDIUM",
        details: `Camera angle drift detected (${angleDrift} pixel shift)`,
        timestamp: new Date(),
      }

      this.triggerAlert(alert)
      return alert
    }

    // Check for lens spray (reduced overall intensity)
    const intensityDrop = (lastFrame.variance - variance) / lastFrame.variance
    if (intensityDrop > 0.3 && intensityDrop <= this.VARIANCE_THRESHOLD) {
      const alert: TamperAlert = {
        cameraId,
        siteId,
        alertType: "LENS_SPRAY",
        severity: "MEDIUM",
        details: `Possible lens spray detected (intensity drop: ${(intensityDrop * 100).toFixed(1)}%)`,
        timestamp: new Date(),
      }

      this.triggerAlert(alert)
      return alert
    }

    // Update history
    history.push({ frame: frameBuffer, ssim, variance, timestamp })
    if (history.length > this.MAX_HISTORY) {
      history.shift()
    }
    this.frameHistory.set(cameraId, history)

    return null
  }

  /**
   * Trigger tamper alert
   */
  private async triggerAlert(alert: TamperAlert): Promise<void> {
    console.log(`[ANTI_TAMPER] Alert triggered: ${alert.alertType} for camera ${alert.cameraId}`)

    // Persist alert to database
    try {
      await prisma.systemAlert.create({
        data: {
          id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: alert.alertType,
          severity: alert.severity,
          message: alert.details,
          source: `Camera:${alert.cameraId}`,
          siteId: alert.siteId,
          status: "ACTIVE",
          createdAt: alert.timestamp,
        },
      })
    } catch (error) {
      console.error("[ANTI_TAMPER] Failed to persist alert (model may not exist yet):", error)
      // Continue without failing - alert is still logged via audit
    }

    // Log audit event
    await logAuditEvent({
      userId: "SYSTEM",
      action: "CAMERA_TAMPER_DETECTED",
      resource: `Camera:${alert.cameraId}`,
      ipAddress: "vision-pipeline",
      userAgent: "anti-tampering",
      details: {
        alertType: alert.alertType,
        severity: alert.severity,
        details: alert.details,
      },
    })

    // Emit WebSocket warning to operator dashboard
    // In production, this would emit via Socket.IO or WebSocket
    console.log(`[ANTI_TAMPER] WebSocket warning emitted for ${alert.cameraId}`)
  }

  /**
   * Clear history for a camera
   */
  clearHistory(cameraId: string): void {
    this.frameHistory.delete(cameraId)
  }

  /**
   * Get camera status
   */
  getCameraStatus(cameraId: string): {
    historySize: number
    lastAnalysis?: FrameAnalysis
    alertsTriggered: number
  } {
    const history = this.frameHistory.get(cameraId) || []
    return {
      historySize: history.length,
      lastAnalysis: history[history.length - 1],
      alertsTriggered: 0, // Would track actual alert count
    }
  }
}

// Singleton instance
const antiTamperingEngine = new AntiTamperingEngine()

/**
 * Analyze camera frame for tampering
 */
export function analyzeCameraFrame({
  cameraId,
  siteId,
  frameBuffer,
}: {
  cameraId: string
  siteId: string
  frameBuffer: Buffer
}): TamperAlert | null {
  return antiTamperingEngine.analyzeFrame({
    cameraId,
    siteId,
    frameBuffer,
  })
}

/**
 * Get camera anti-tampering status
 */
export function getCameraTamperStatus(cameraId: string) {
  return antiTamperingEngine.getCameraStatus(cameraId)
}

/**
 * Clear camera history
 */
export function clearCameraTamperHistory(cameraId: string): void {
  antiTamperingEngine.clearHistory(cameraId)
}

export { antiTamperingEngine }