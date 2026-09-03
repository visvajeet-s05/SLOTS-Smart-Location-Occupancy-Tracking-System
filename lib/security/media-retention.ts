/**
 * Media Retention Policy Engine
 * Automated data retention and privacy management service
 * Enforces strict retention windows for regulatory compliance
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export interface MediaFile {
  id: string
  lotId: string
  slotId?: string
  type: "VIDEO" | "ALPR_CROP" | "COMPLIANCE_EVIDENCE"
  filePath: string
  fileSize: number
  createdAt: Date
  isViolationEvidence: boolean
  metadata?: any
}

export interface RetentionPolicy {
  rawVideoRetentionHours: number
  alprCropRetentionHours: number
  complianceEvidenceRetentionDays: number
  anonymizationAfterDays: number
}

export interface CleanupResult {
  success: boolean
  deletedFilesCount: number
  freedBytes: number
  preservedFilesCount: number
  error?: string
}

export interface AnonymizationResult {
  success: boolean
  anonymizedRecordsCount: number
  error?: string
}

/**
 * Media Retention Policy Engine
 * Enforces strict retention windows for regulatory compliance
 */
class MediaRetentionPolicyEngine {
  private config: RetentionPolicy

  constructor(config?: Partial<RetentionPolicy>) {
    this.config = {
      rawVideoRetentionHours: 24,
      alprCropRetentionHours: 72,
      complianceEvidenceRetentionDays: 90,
      anonymizationAfterDays: 30,
      ...config,
    }
  }

  /**
   * Enforce storage TTL for a parking lot
   * Scans and purges media files exceeding retention windows
   */
  async enforceStorageTTL(lotId: string): Promise<CleanupResult> {
    try {
      const now = new Date()
      let deletedCount = 0
      let freedBytes = 0
      let preservedFilesCount = 0

      // Calculate retention thresholds
      const videoThreshold = new Date(now.getTime() - this.config.rawVideoRetentionHours * 60 * 60 * 1000)
      const alprCropThreshold = new Date(now.getTime() - this.config.alprCropRetentionHours * 60 * 60 * 1000)
      const evidenceThreshold = new Date(now.getTime() - this.config.complianceEvidenceRetentionDays * 24 * 60 * 60 * 1000)

      // Get all media files for the lot
      // In production, this would query S3 or local storage
      // For now, we'll simulate with database records
      const mediaFiles = await this.getMediaFiles(lotId)

      for (const file of mediaFiles) {
        const shouldDelete = this.shouldDeleteFile(file, videoThreshold, alprCropThreshold, evidenceThreshold)

        if (shouldDelete) {
          // Delete the file
          const deleted = await this.deleteMediaFile(file)
          if (deleted) {
            deletedCount++
            freedBytes += file.fileSize
          }
        } else {
          preservedFilesCount++
        }
      }

      return {
        success: true,
        deletedFilesCount: deletedCount,
        freedBytes,
        preservedFilesCount,
      }
    } catch (error: any) {
      console.error("Storage TTL enforcement error:", error)
      return {
        success: false,
        deletedFilesCount: 0,
        freedBytes: 0,
        preservedFilesCount: 0,
        error: error.message,
      }
    }
  }

  /**
   * Determine if a file should be deleted based on retention policy
   */
  private shouldDeleteFile(
    file: MediaFile,
    videoThreshold: Date,
    alprCropThreshold: Date,
    evidenceThreshold: Date
  ): boolean {
    // Preserve compliance evidence
    if (file.isViolationEvidence) {
      // Only delete if older than evidence retention period
      if (file.createdAt < evidenceThreshold) {
        return true
      }
      return false
    }

    // Check based on file type
    if (file.type === "VIDEO") {
      return file.createdAt < videoThreshold
    }

    if (file.type === "ALPR_CROP") {
      return file.createdAt < alprCropThreshold
    }

    return false
  }

  /**
   * Get media files for a lot (simulated - would query S3/local storage in production)
   */
  private async getMediaFiles(lotId: string): Promise<MediaFile[]> {
    // In production, this would query:
    // - S3 buckets for video segments
    // - Local edge storage for ALPR crops
    // - Database metadata for file tracking

    // For now, return empty array as simulation
    const mediaRecords = await prisma.mediaFile.findMany({
      where: { lotId },
      orderBy: { createdAt: "asc" },
    })

    return mediaRecords.map((record: any) => ({
      id: record.id,
      lotId: record.lotId,
      slotId: record.slotId,
      type: record.type,
      filePath: record.filePath,
      fileSize: record.fileSize,
      createdAt: record.createdAt,
      isViolationEvidence: record.isViolationEvidence,
      metadata: record.metadata,
    }))
  }

  /**
   * Delete a media file
   */
  private async deleteMediaFile(file: MediaFile): Promise<boolean> {
    try {
      // In production, this would:
      // - Delete from S3 bucket
      // - Delete from local edge storage
      // - Update database record

      // For now, simulate deletion
      await prisma.mediaFile.delete({
        where: { id: file.id },
      })

      console.log(`Deleted media file: ${file.filePath}`)
      return true
    } catch (error) {
      console.error(`Failed to delete media file ${file.id}:`, error)
      return false
    }
  }

  /**
   * Anonymize historical metadata
   * Strips exact license plate strings and hashes vehicle identities
   */
  async anonymizeHistoricalMetadata(lotId: string, olderThanDays: number): Promise<AnonymizationResult> {
    try {
      const threshold = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
      let anonymizedCount = 0

      // Get compliance violations older than threshold
      const violations = await prisma.complianceViolation.findMany({
        where: {
          lotId,
          timestamp: { lt: threshold },
          status: "RESOLVED", // Only anonymize resolved violations
        },
      })

      for (const violation of violations) {
        // Anonymize the vehicle plate
        await prisma.complianceViolation.update({
          where: { id: violation.id },
          data: {
            vehiclePlate: this.hashString(violation.vehiclePlate),
          },
        })

        anonymizedCount++
      }

      // Anonymize historical booking records
      const bookings = await prisma.booking.findMany({
        where: {
          parkingLotId: lotId,
          endTime: { lt: threshold },
          status: "COMPLETED",
        },
      })

      for (const booking of bookings) {
        if (booking.vehicleNumber) {
          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              vehicleNumber: this.hashString(booking.vehicleNumber),
            },
          })

          anonymizedCount++
        }
      }

      return {
        success: true,
        anonymizedRecordsCount: anonymizedCount,
      }
    } catch (error: any) {
      console.error("Metadata anonymization error:", error)
      return {
        success: false,
        anonymizedRecordsCount: 0,
        error: error.message,
      }
    }
  }

  /**
   * Hash a string for anonymization
   */
  private hashString(str: string): string {
    // Simple hash for demonstration
    // In production, use proper cryptographic hash
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return `HASH_${Math.abs(hash)}`
  }

  /**
   * Mark media file as compliance evidence
   */
  async markAsEvidence(fileId: string, violationId: string): Promise<boolean> {
    try {
      await prisma.mediaFile.update({
        where: { id: fileId },
        data: {
          isViolationEvidence: true,
          metadata: {
            violationId,
            markedAt: new Date(),
          },
        },
      })

      return true
    } catch (error) {
      console.error("Failed to mark file as evidence:", error)
      return false
    }
  }

  /**
   * Get retention statistics for a lot
   */
  async getRetentionStats(lotId: string) {
    try {
      const now = new Date()
      const videoThreshold = new Date(now.getTime() - this.config.rawVideoRetentionHours * 60 * 60 * 1000)
      const alprCropThreshold = new Date(now.getTime() - this.config.alprCropRetentionHours * 60 * 60 * 1000)

      const mediaFiles = await this.getMediaFiles(lotId)

      const stats = {
        totalFiles: mediaFiles.length,
        expiredFiles: 0,
        preservedFiles: 0,
        totalSize: 0,
        expiredSize: 0,
        byType: {
          VIDEO: 0,
          ALPR_CROP: 0,
          COMPLIANCE_EVIDENCE: 0,
        },
      }

      for (const file of mediaFiles) {
        stats.totalSize += file.fileSize
        stats.byType[file.type]++

        const shouldDelete = this.shouldDeleteFile(file, videoThreshold, alprCropThreshold, new Date())
        if (shouldDelete) {
          stats.expiredFiles++
          stats.expiredSize += file.fileSize
        } else {
          stats.preservedFiles++
        }
      }

      return stats
    } catch (error: any) {
      console.error("Retention stats error:", error)
      return null
    }
  }

  /**
   * Batch enforce storage TTL across all lots
   */
  async batchEnforceStorageTTL(): Promise<Record<string, CleanupResult>> {
    try {
      // Get all parking lots
      const lots = await prisma.parkinglot.findMany({
        select: { id: true },
      })

      const results: Record<string, CleanupResult> = {}

      for (const lot of lots) {
        results[lot.id] = await this.enforceStorageTTL(lot.id)
      }

      return results
    } catch (error: any) {
      console.error("Batch storage TTL enforcement error:", error)
      return {}
    }
  }

  /**
   * Get current retention policy configuration
   */
  getConfig(): RetentionPolicy {
    return { ...this.config }
  }

  /**
   * Update retention policy configuration
   */
  updateConfig(config: Partial<RetentionPolicy>): void {
    this.config = { ...this.config, ...config }
  }
}

// Singleton instance
const mediaRetentionPolicyEngine = new MediaRetentionPolicyEngine()

/**
 * Enforce storage TTL for a lot
 */
export async function enforceStorageTTL(lotId: string): Promise<CleanupResult> {
  return await mediaRetentionPolicyEngine.enforceStorageTTL(lotId)
}

/**
 * Anonymize historical metadata
 */
export async function anonymizeHistoricalMetadata(lotId: string, olderThanDays: number): Promise<AnonymizationResult> {
  return await mediaRetentionPolicyEngine.anonymizeHistoricalMetadata(lotId, olderThanDays)
}

/**
 * Mark media as evidence
 */
export async function markAsEvidence(fileId: string, violationId: string): Promise<boolean> {
  return await mediaRetentionPolicyEngine.markAsEvidence(fileId, violationId)
}

/**
 * Get retention statistics
 */
export async function getRetentionStats(lotId: string) {
  return await mediaRetentionPolicyEngine.getRetentionStats(lotId)
}

/**
 * Batch enforce storage TTL
 */
export async function batchEnforceStorageTTL(): Promise<Record<string, CleanupResult>> {
  return await mediaRetentionPolicyEngine.batchEnforceStorageTTL()
}

/**
 * Get retention config
 */
export function getRetentionConfig(): RetentionPolicy {
  return mediaRetentionPolicyEngine.getConfig()
}

/**
 * Update retention config
 */
export function updateRetentionConfig(config: Partial<RetentionPolicy>): void {
  mediaRetentionPolicyEngine.updateConfig(config)
}

export { mediaRetentionPolicyEngine }