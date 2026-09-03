import crypto from "crypto"

interface HardwareTokenPayload {
  deviceId: string
  deviceType: string
  timestamp: number
  nonce: string
}

interface HardwareToken {
  token: string
  expiresAt: number
  deviceId: string
}

/**
 * Hardware JWT Key Rotation
 * Rotates API tokens for physical devices every 24 hours
 * Uses HMAC-SHA256 with rotating key secret
 */
class HardwareAuth {
  private readonly MASTER_SECRET = process.env.HARDWARE_MASTER_SECRET || "default-secret"
  private readonly KEY_ROTATION_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours
  private readonly GRACE_WINDOW = 60 * 60 * 1000 // 1 hour grace window
  private activeTokens: Map<string, HardwareToken> = new Map()
  private rotationInterval: NodeJS.Timeout | null = null

  /**
   * Generate daily key secret
   */
  private getDailySecret(date: Date = new Date()): string {
    const dateStr = date.toISOString().split("T")[0] // YYYY-MM-DD
    return crypto
      .createHmac("sha256", this.MASTER_SECRET)
      .update(dateStr)
      .digest("hex")
  }

  /**
   * Generate hardware token
   */
  generateToken(deviceId: string, deviceType: string): HardwareToken {
    const now = Date.now()
    const expiresAt = now + this.KEY_ROTATION_INTERVAL
    const nonce = crypto.randomBytes(16).toString("hex")

    const payload: HardwareTokenPayload = {
      deviceId,
      deviceType,
      timestamp: now,
      nonce,
    }

    const payloadStr = JSON.stringify(payload)
    const secret = this.getDailySecret()
    const signature = crypto
      .createHmac("sha256", secret)
      .update(payloadStr)
      .digest("hex")

    const token = Buffer.from(JSON.stringify({ payload, signature })).toString("base64")

    const hardwareToken: HardwareToken = {
      token,
      expiresAt,
      deviceId,
    }

    this.activeTokens.set(deviceId, hardwareToken)

    return hardwareToken
  }

  /**
   * Validate hardware token
   */
  validateToken(token: string): { valid: boolean; deviceId?: string; error?: string } {
    try {
      // Decode token
      const decoded = JSON.parse(Buffer.from(token, "base64").toString())
      const { payload, signature } = decoded

      // Check timestamp (within grace window)
      const now = Date.now()
      const age = now - payload.timestamp
      if (age > this.KEY_ROTATION_INTERVAL + this.GRACE_WINDOW) {
        return {
          valid: false,
          error: "Token expired",
        }
      }

      // Check nonce replay
      const existingToken = this.activeTokens.get(payload.deviceId)
      if (existingToken && existingToken.token !== token) {
        // Token changed, check if within grace window
        if (age > this.GRACE_WINDOW) {
          return {
            valid: false,
            error: "Token invalid (rotation grace window expired)",
          }
        }
      }

      // Verify signature with current day's secret
      const secret = this.getDailySecret()
      const payloadStr = JSON.stringify(payload)
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(payloadStr)
        .digest("hex")

      if (signature !== expectedSignature) {
        // Try previous day's secret (grace window)
        const yesterday = new Date(now - 24 * 60 * 60 * 1000)
        const previousSecret = this.getDailySecret(yesterday)
        const previousSignature = crypto
          .createHmac("sha256", previousSecret)
          .update(payloadStr)
          .digest("hex")

        if (signature !== previousSignature) {
          return {
            valid: false,
            error: "Invalid signature",
          }
        }
      }

      return {
        valid: true,
        deviceId: payload.deviceId,
      }
    } catch (error: any) {
      return {
        valid: false,
        error: error.message,
      }
    }
  }

  /**
   * Rotate all tokens
   */
  rotateTokens(): void {
    console.log("[HARDWARE_AUTH] Rotating hardware tokens")

    // Generate new tokens for all active devices
    for (const [deviceId, token] of this.activeTokens.entries()) {
      const newToken = this.generateToken(deviceId, "device")
      console.log(`[HARDWARE_AUTH] Rotated token for ${deviceId}`)
    }
  }

  /**
   * Start automatic rotation
   */
  startRotation(): void {
    if (this.rotationInterval) {
      console.log("[HARDWARE_AUTH] Rotation already running")
      return
    }

    console.log("[HARDWARE_AUTH] Starting token rotation (24h interval)")
    this.rotationInterval = setInterval(() => {
      this.rotateTokens()
    }, this.KEY_ROTATION_INTERVAL)
  }

  /**
   * Stop rotation
   */
  stopRotation(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval)
      this.rotationInterval = null
      console.log("[HARDWARE_AUTH] Stopped token rotation")
    }
  }

  /**
   * Revoke token for device
   */
  revokeToken(deviceId: string): void {
    this.activeTokens.delete(deviceId)
    console.log(`[HARDWARE_AUTH] Revoked token for ${deviceId}`)
  }

  /**
   * Get active token for device
   */
  getToken(deviceId: string): HardwareToken | undefined {
    return this.activeTokens.get(deviceId)
  }

  /**
   * Get all active tokens
   */
  getAllTokens(): HardwareToken[] {
    return Array.from(this.activeTokens.values())
  }
}

// Singleton instance
const hardwareAuth = new HardwareAuth()

/**
 * Generate hardware token
 */
export function generateHardwareToken(deviceId: string, deviceType: string): HardwareToken {
  return hardwareAuth.generateToken(deviceId, deviceType)
}

/**
 * Validate hardware token
 */
export function validateHardwareToken(token: string): { valid: boolean; deviceId?: string; error?: string } {
  return hardwareAuth.validateToken(token)
}

/**
 * Start token rotation
 */
export function startHardwareTokenRotation(): void {
  hardwareAuth.startRotation()
}

/**
 * Stop token rotation
 */
export function stopHardwareTokenRotation(): void {
  hardwareAuth.stopRotation()
}

/**
 * Revoke hardware token
 */
export function revokeHardwareToken(deviceId: string): void {
  hardwareAuth.revokeToken(deviceId)
}

export { hardwareAuth }