/**
 * Edge Credential & Key Rotation Engine
 * Automated JWT/TLS key rotation manager for edge devices
 * Secure edge-device-to-cloud communications without downtime
 */

import { PrismaClient } from "@prisma/client"
import { SignJWT, jwtVerify } from "jose"

const prisma = new PrismaClient()

export interface EdgeDeviceSecret {
  id: string
  deviceId: string
  secretKey: string
  previousSecretKey: string | null
  rotationTimestamp: Date
  gracePeriodEndsAt: Date
  isActive: boolean
}

export interface JWTTokenResult {
  token: string
  expiresAt: Date
  issuedAt: Date
}

export interface TokenVerificationResult {
  valid: boolean
  deviceId?: string
  payload?: any
  error?: string
}

/**
 * Edge Credential Rotation Engine
 * Manages JWT/TLS key rotation for edge devices
 */
class EdgeCredentialRotationEngine {
  private readonly GRACE_PERIOD_HOURS = 24 // 24 hours grace period
  private readonly TOKEN_EXPIRY_HOURS = 8 // 8 hours token expiry
  private readonly SECRET_LENGTH = 64 // 512 bits (64 hex characters for 256-bit)

  /**
   * Generate cryptographically secure random secret
   */
  private generateSecret(): string {
    const array = new Uint8Array(32) // 256 bits
    crypto.getRandomValues(array)
    return Array.from(array, byte => byte.toString(16).padStart(2, "0")).join("")
  }

  /**
   * Rotate edge device secret
   * Generates new 256-bit secret with dual-signed JWT window to prevent downtime
   */
  async rotateEdgeDeviceSecret(deviceId: string): Promise<JWTTokenResult> {
    // Get current device secret
    // @ts-ignore - edgeDeviceSecret model will be available after prisma generate
    const currentSecret = await prisma.edgeDeviceSecret.findUnique({
      where: { deviceId },
    })

    const newSecret = this.generateSecret()
    const now = new Date()
    const gracePeriodEndsAt = new Date(now.getTime() + this.GRACE_PERIOD_HOURS * 60 * 60 * 1000)

    if (currentSecret) {
      // Update existing secret
      // @ts-ignore - edgeDeviceSecret model will be available after prisma generate
      await prisma.edgeDeviceSecret.update({
        where: { deviceId },
        data: {
          previousSecretKey: currentSecret.secretKey,
          secretKey: newSecret,
          rotationTimestamp: now,
          gracePeriodEndsAt: gracePeriodEndsAt,
          isActive: true,
        },
      })
    } else {
      // Create new secret
      // @ts-ignore - edgeDeviceSecret model will be available after prisma generate
      await prisma.edgeDeviceSecret.create({
        data: {
          deviceId,
          secretKey: newSecret,
          previousSecretKey: null,
          rotationTimestamp: now,
          gracePeriodEndsAt: gracePeriodEndsAt,
          isActive: true,
        },
      })
    }

    // Generate JWT token with new secret
    const token = await this.generateJWTToken(deviceId, newSecret)

    return token
  }

  /**
   * Generate JWT token for device
   */
  private async generateJWTToken(deviceId: string, secret: string): Promise<JWTTokenResult> {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

    const secretKey = new TextEncoder().encode(secret)

    const token = await new SignJWT({
      deviceId,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(secretKey)

    return {
      token,
      issuedAt: now,
      expiresAt,
    }
  }

  /**
   * Verify edge device token
   * Validates JWT signature against current and previous keys during grace period
   */
  async verifyEdgeToken(token: string, deviceId: string): Promise<TokenVerificationResult> {
    try {
      // Get device secrets
      // @ts-ignore - edgeDeviceSecret model will be available after prisma generate
      const deviceSecret = await prisma.edgeDeviceSecret.findUnique({
        where: { deviceId },
      })

      if (!deviceSecret) {
        return {
          valid: false,
          error: "Device not found",
        }
      }

      if (!deviceSecret.isActive) {
        return {
          valid: false,
          error: "Device is inactive",
        }
      }

      // Try current secret first
      let verificationResult = await this.verifyTokenWithSecret(token, deviceSecret.secretKey)

      if (verificationResult.valid) {
        return verificationResult
      }

      // Try previous secret if within grace period
      if (deviceSecret.previousSecretKey && new Date() < deviceSecret.gracePeriodEndsAt) {
        verificationResult = await this.verifyTokenWithSecret(token, deviceSecret.previousSecretKey)

        if (verificationResult.valid) {
          return verificationResult
        }
      }

      return {
        valid: false,
        error: "Invalid token signature",
      }
    } catch (error: any) {
      return {
        valid: false,
        error: error.message,
      }
    }
  }

  /**
   * Verify token with specific secret
   */
  private async verifyTokenWithSecret(token: string, secret: string): Promise<TokenVerificationResult> {
    try {
      const secretKey = new TextEncoder().encode(secret)
      const { payload } = await jwtVerify(token, secretKey)

      return {
        valid: true,
        deviceId: payload.deviceId as string,
        payload,
      }
    } catch (error: any) {
      return {
        valid: false,
        error: error.message,
      }
    }
  }

  /**
   * Get device secret info
   */
  async getDeviceSecret(deviceId: string): Promise<EdgeDeviceSecret | null> {
    // @ts-ignore - edgeDeviceSecret model will be available after prisma generate
    const secret = await prisma.edgeDeviceSecret.findUnique({
      where: { deviceId },
    })

    if (!secret) {
      return null
    }

    return {
      id: secret.id,
      deviceId: secret.deviceId,
      secretKey: "***", // Never return actual secret
      previousSecretKey: secret.previousSecretKey ? "***" : null,
      rotationTimestamp: secret.rotationTimestamp,
      gracePeriodEndsAt: secret.gracePeriodEndsAt,
      isActive: secret.isActive,
    }
  }

  /**
   * Revoke device access
   */
  async revokeDeviceAccess(deviceId: string): Promise<boolean> {
    // @ts-ignore - edgeDeviceSecret model will be available after prisma generate
    const result = await prisma.edgeDeviceSecret.updateMany({
      where: { deviceId },
      data: {
        isActive: false,
      },
    })

    return result.count > 0
  }

  /**
   * Reactivate device access
   */
  async reactivateDeviceAccess(deviceId: string): Promise<boolean> {
    // @ts-ignore - edgeDeviceSecret model will be available after prisma generate
    const result = await prisma.edgeDeviceSecret.updateMany({
      where: { deviceId },
      data: {
        isActive: true,
      },
    })

    return result.count > 0
  }

  /**
   * Force token refresh (without rotating secret)
   */
  async forceTokenRefresh(deviceId: string): Promise<JWTTokenResult> {
    // @ts-ignore - edgeDeviceSecret model will be available after prisma generate
    const deviceSecret = await prisma.edgeDeviceSecret.findUnique({
      where: { deviceId },
    })

    if (!deviceSecret) {
      throw new Error("Device not found")
    }

    if (!deviceSecret.isActive) {
      throw new Error("Device is inactive")
    }

    return await this.generateJWTToken(deviceId, deviceSecret.secretKey)
  }

  /**
   * Get all devices expiring soon
   */
  async getDevicesExpiringSoon(hours: number = 6): Promise<string[]> {
    const threshold = new Date(Date.now() + hours * 60 * 60 * 1000)

    // @ts-ignore - edgeDeviceSecret model will be available after prisma generate
    const devices = await prisma.edgeDeviceSecret.findMany({
      where: {
        isActive: true,
        gracePeriodEndsAt: {
          lte: threshold,
        },
      },
      select: {
        deviceId: true,
      },
    })

    return devices.map((d: { deviceId: string }) => d.deviceId)
  }

  /**
   * Clean up old secrets (after grace period)
   */
  async cleanupOldSecrets(): Promise<number> {
    const now = new Date()

    // @ts-ignore - edgeDeviceSecret model will be available after prisma generate
    const result = await prisma.edgeDeviceSecret.updateMany({
      where: {
        gracePeriodEndsAt: {
          lt: now,
        },
        previousSecretKey: {
          not: null,
        },
      },
      data: {
        previousSecretKey: null,
      },
    })

    return result.count
  }

  /**
   * Get rotation statistics
   */
  async getRotationStats() {
    // @ts-ignore - edgeDeviceSecret model will be available after prisma generate
    const [total, active, expiringSoon, inactive] = await Promise.all([
      prisma.edgeDeviceSecret.count(),
      prisma.edgeDeviceSecret.count({ where: { isActive: true } }),
      prisma.edgeDeviceSecret.count({
        where: {
          isActive: true,
          gracePeriodEndsAt: {
            lte: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
          },
        },
      }),
      prisma.edgeDeviceSecret.count({ where: { isActive: false } }),
    ])

    return {
      total,
      active,
      expiringSoon,
      inactive,
    }
  }

  /**
   * Schedule automatic rotation for all devices
   */
  async scheduleAutoRotation(intervalHours: number = 168): Promise<void> { // 7 days default
    // This would typically be run as a cron job
    // @ts-ignore - edgeDeviceSecret model will be available after prisma generate
    const devices = await prisma.edgeDeviceSecret.findMany({
      where: { isActive: true },
      select: { deviceId: true },
    })

    for (const device of devices) {
      await this.rotateEdgeDeviceSecret(device.deviceId)
    }
  }
}

// Singleton instance
const edgeCredentialRotationEngine = new EdgeCredentialRotationEngine()

/**
 * Rotate edge device secret
 */
export async function rotateEdgeDeviceSecret(deviceId: string): Promise<JWTTokenResult> {
  return await edgeCredentialRotationEngine.rotateEdgeDeviceSecret(deviceId)
}

/**
 * Verify edge token
 */
export async function verifyEdgeToken(token: string, deviceId: string): Promise<TokenVerificationResult> {
  return await edgeCredentialRotationEngine.verifyEdgeToken(token, deviceId)
}

/**
 * Get device secret info
 */
export async function getDeviceSecret(deviceId: string): Promise<EdgeDeviceSecret | null> {
  return await edgeCredentialRotationEngine.getDeviceSecret(deviceId)
}

/**
 * Revoke device access
 */
export async function revokeDeviceAccess(deviceId: string): Promise<boolean> {
  return await edgeCredentialRotationEngine.revokeDeviceAccess(deviceId)
}

/**
 * Reactivate device access
 */
export async function reactivateDeviceAccess(deviceId: string): Promise<boolean> {
  return await edgeCredentialRotationEngine.reactivateDeviceAccess(deviceId)
}

/**
 * Force token refresh
 */
export async function forceTokenRefresh(deviceId: string): Promise<JWTTokenResult> {
  return await edgeCredentialRotationEngine.forceTokenRefresh(deviceId)
}

/**
 * Get devices expiring soon
 */
export async function getDevicesExpiringSoon(hours?: number): Promise<string[]> {
  return await edgeCredentialRotationEngine.getDevicesExpiringSoon(hours)
}

/**
 * Cleanup old secrets
 */
export async function cleanupOldSecrets(): Promise<number> {
  return await edgeCredentialRotationEngine.cleanupOldSecrets()
}

/**
 * Get rotation statistics
 */
export async function getRotationStats() {
  return await edgeCredentialRotationEngine.getRotationStats()
}

/**
 * Schedule auto rotation
 */
export async function scheduleAutoRotation(intervalHours?: number): Promise<void> {
  return await edgeCredentialRotationEngine.scheduleAutoRotation(intervalHours)
}

export { edgeCredentialRotationEngine }