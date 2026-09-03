/**
 * Unit Test Suite for Media Retention Policy Engine
 * Verifies that expired media is deleted while violation evidence is preserved
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals"
import {
  enforceStorageTTL,
  anonymizeHistoricalMetadata,
  markAsEvidence,
  getRetentionStats,
  getRetentionConfig,
  updateRetentionConfig,
  type MediaFile,
  type CleanupResult,
} from "@/lib/security/media-retention"

// Mock Prisma Client
jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    mediaFile: {
      findMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    complianceViolation: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  })),
}))

describe("Media Retention Policy Engine", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Storage TTL Enforcement", () => {
    it("should delete expired raw video files", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const now = new Date()
      const expiredVideo = {
        id: "video-1",
        lotId: "lot-1",
        type: "VIDEO",
        filePath: "/videos/lot-1/segment-1.mp4",
        fileSize: 1048576, // 1MB
        createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000), // 25 hours ago
        isViolationEvidence: false,
        metadata: {},
      }

      // @ts-ignore
      prisma.mediaFile.findMany.mockResolvedValue([expiredVideo])
      // @ts-ignore
      prisma.mediaFile.delete.mockResolvedValue({ count: 1 })

      const result = await enforceStorageTTL("lot-1")

      expect(result.success).toBe(true)
      expect(result.deletedFilesCount).toBe(1)
      expect(result.freedBytes).toBe(1048576)
    })

    it("should delete expired ALPR crop files", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const now = new Date()
      const expiredCrop = {
        id: "crop-1",
        lotId: "lot-1",
        type: "ALPR_CROP",
        filePath: "/crops/lot-1/plate-123.jpg",
        fileSize: 524288, // 512KB
        createdAt: new Date(now.getTime() - 73 * 60 * 60 * 1000), // 73 hours ago
        isViolationEvidence: false,
        metadata: {},
      }

      // @ts-ignore
      prisma.mediaFile.findMany.mockResolvedValue([expiredCrop])
      // @ts-ignore
      prisma.mediaFile.delete.mockResolvedValue({ count: 1 })

      const result = await enforceStorageTTL("lot-1")

      expect(result.success).toBe(true)
      expect(result.deletedFilesCount).toBe(1)
      expect(result.freedBytes).toBe(524288)
    })

    it("should preserve violation-linked media files", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const now = new Date()
      const evidenceFile = {
        id: "evidence-1",
        lotId: "lot-1",
        type: "COMPLIANCE_EVIDENCE",
        filePath: "/evidence/lot-1/violation-123.jpg",
        fileSize: 1048576,
        createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000), // 25 hours ago
        isViolationEvidence: true,
        metadata: { violationId: "violation-123" },
      }

      // @ts-ignore
      prisma.mediaFile.findMany.mockResolvedValue([evidenceFile])

      const result = await enforceStorageTTL("lot-1")

      expect(result.success).toBe(true)
      expect(result.deletedFilesCount).toBe(0) // Should not delete evidence
      expect(result.preservedFilesCount).toBe(1)
    })

    it("should preserve recently created media files", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const now = new Date()
      const recentVideo = {
        id: "video-2",
        lotId: "lot-1",
        type: "VIDEO",
        filePath: "/videos/lot-1/segment-2.mp4",
        fileSize: 1048576,
        createdAt: new Date(now.getTime() - 10 * 60 * 60 * 1000), // 10 hours ago
        isViolationEvidence: false,
        metadata: {},
      }

      // @ts-ignore
      prisma.mediaFile.findMany.mockResolvedValue([recentVideo])

      const result = await enforceStorageTTL("lot-1")

      expect(result.success).toBe(true)
      expect(result.deletedFilesCount).toBe(0)
      expect(result.preservedFilesCount).toBe(1)
    })

    it("should preserve old evidence files within evidence retention period", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const now = new Date()
      const oldEvidence = {
        id: "evidence-2",
        lotId: "lot-1",
        type: "COMPLIANCE_EVIDENCE",
        filePath: "/evidence/lot-1/violation-456.jpg",
        fileSize: 1048576,
        createdAt: new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000), // 89 days ago
        isViolationEvidence: true,
        metadata: { violationId: "violation-456" },
      }

      // @ts-ignore
      prisma.mediaFile.findMany.mockResolvedValue([oldEvidence])

      const result = await enforceStorageTTL("lot-1")

      expect(result.success).toBe(true)
      expect(result.deletedFilesCount).toBe(0) // Evidence still within 90-day retention
      expect(result.preservedFilesCount).toBe(1)
    })

    it("should delete evidence files older than retention period", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const now = new Date()
      const expiredEvidence = {
        id: "evidence-3",
        lotId: "lot-1",
        type: "COMPLIANCE_EVIDENCE",
        filePath: "/evidence/lot-1/violation-789.jpg",
        fileSize: 1048576,
        createdAt: new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000), // 91 days ago
        isViolationEvidence: true,
        metadata: { violationId: "violation-789" },
      }

      // @ts-ignore
      prisma.mediaFile.findMany.mockResolvedValue([expiredEvidence])
      // @ts-ignore
      prisma.mediaFile.delete.mockResolvedValue({ count: 1 })

      const result = await enforceStorageTTL("lot-1")

      expect(result.success).toBe(true)
      expect(result.deletedFilesCount).toBe(1)
      expect(result.preservedFilesCount).toBe(0)
    })
  })

  describe("Metadata Anonymization", () => {
    it("should anonymize vehicle plates in resolved violations", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const now = new Date()
      const violations = [
        {
          id: "violation-1",
          lotId: "lot-1",
          vehiclePlate: "TN-01-AB-1234",
          timestamp: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
          status: "RESOLVED",
          metadataJson: {},
        },
      ]

      // @ts-ignore
      prisma.complianceViolation.findMany.mockResolvedValue(violations)
      // @ts-ignore
      prisma.complianceViolation.update.mockResolvedValue({ count: 1 })

      const result = await anonymizeHistoricalMetadata("lot-1", 30)

      expect(result.success).toBe(true)
      expect(result.anonymizedRecordsCount).toBe(1)
    })

    it("should anonymize vehicle plates in completed bookings", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const now = new Date()
      const bookings = [
        {
          id: "booking-1",
          parkingLotId: "lot-1",
          vehicleNumber: "TN-01-CD-5678",
          endTime: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000),
          status: "COMPLETED",
        },
      ]

      // @ts-ignore
      prisma.booking.findMany.mockResolvedValue(bookings)
      // @ts-ignore
      prisma.booking.update.mockResolvedValue({ count: 1 })

      const result = await anonymizeHistoricalMetadata("lot-1", 30)

      expect(result.success).toBe(true)
      expect(result.anonymizedRecordsCount).toBe(1)
    })

    it("should not anonymize active violations", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const now = new Date()
      const activeViolation = {
        id: "violation-2",
        lotId: "lot-1",
        vehiclePlate: "TN-01-EF-9012",
        timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        status: "ACTIVE",
        metadataJson: {},
      }

      // @ts-ignore
      prisma.complianceViolation.findMany.mockResolvedValue([activeViolation])

      const result = await anonymizeHistoricalMetadata("lot-1", 30)

      expect(result.success).toBe(true)
      expect(result.anonymizedRecordsCount).toBe(0) // Should not anonymize active
    })

    it("should handle errors during anonymization", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      // @ts-ignore
      prisma.complianceViolation.findMany.mockRejectedValue(new Error("Database Error"))

      const result = await anonymizeHistoricalMetadata("lot-1", 30)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe("Evidence Marking", () => {
    it("should mark media file as compliance evidence", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      // @ts-ignore
      prisma.mediaFile.update.mockResolvedValue({ count: 1 })

      const result = await markAsEvidence("file-1", "violation-123")

      expect(result).toBe(true)
    })

    it("should handle errors when marking evidence", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      // @ts-ignore
      prisma.mediaFile.update.mockRejectedValue(new Error("Database Error"))

      const result = await markAsEvidence("file-1", "violation-123")

      expect(result).toBe(false)
    })
  })

  describe("Retention Statistics", () => {
    it("should calculate retention statistics for a lot", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const now = new Date()
      const mediaFiles = [
        {
          id: "video-1",
          lotId: "lot-1",
          type: "VIDEO",
          filePath: "/videos/lot-1/segment-1.mp4",
          fileSize: 1048576,
          createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
          isViolationEvidence: false,
          metadata: {},
        },
        {
          id: "crop-1",
          lotId: "lot-1",
          type: "ALPR_CROP",
          filePath: "/crops/lot-1/plate-123.jpg",
          fileSize: 524288,
          createdAt: new Date(now.getTime() - 10 * 60 * 60 * 1000),
          isViolationEvidence: false,
          metadata: {},
        },
      ]

      // @ts-ignore
      prisma.mediaFile.findMany.mockResolvedValue(mediaFiles)

      const stats = await getRetentionStats("lot-1")

      expect(stats).not.toBeNull()
      expect(stats.totalFiles).toBe(2)
      expect(stats.expiredFiles).toBe(1) // Only video is expired
      expect(stats.preservedFiles).toBe(1) // Crop is preserved
    })

    it("should handle errors when calculating stats", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      // @ts-ignore
      prisma.mediaFile.findMany.mockRejectedValue(new Error("Database Error"))

      const stats = await getRetentionStats("lot-1")

      expect(stats).toBeNull()
    })
  })

  describe("Configuration Management", () => {
    it("should return default retention configuration", () => {
      const config = getRetentionConfig()

      expect(config.rawVideoRetentionHours).toBe(24)
      expect(config.alprCropRetentionHours).toBe(72)
      expect(config.complianceEvidenceRetentionDays).toBe(90)
      expect(config.anonymizationAfterDays).toBe(30)
    })

    it("should allow updating retention configuration", () => {
      updateRetentionConfig({
        rawVideoRetentionHours: 48,
        alprCropRetentionHours: 144,
      })

      const config = getRetentionConfig()

      expect(config.rawVideoRetentionHours).toBe(48)
      expect(config.alprCropRetentionHours).toBe(144)
    })
  })

  describe("TTL Scenarios", () => {
    it("should handle mixed media types with different TTLs", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const now = new Date()
      const mediaFiles = [
        {
          id: "video-1",
          lotId: "lot-1",
          type: "VIDEO",
          filePath: "/videos/lot-1/segment-1.mp4",
          fileSize: 1048576,
          createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000), // 25h ago - expired
          isViolationEvidence: false,
          metadata: {},
        },
        {
          id: "crop-1",
          lotId: "lot-1",
          type: "ALPR_CROP",
          filePath: "/crops/lot-1/plate-123.jpg",
          fileSize: 524288,
          createdAt: new Date(now.getTime() - 10 * 60 * 60 * 1000), // 10h ago - preserved
          isViolationEvidence: false,
          metadata: {},
        },
        {
          id: "evidence-1",
          lotId: "lot-1",
          type: "COMPLIANCE_EVIDENCE",
          filePath: "/evidence/lot-1/violation-123.jpg",
          fileSize: 1048576,
          createdAt: new Date(now.getTime() - 80 * 24 * 60 * 60 * 1000), // 80 days ago - preserved
          isViolationEvidence: true,
          metadata: { violationId: "violation-123" },
        },
      ]

      // @ts-ignore
      prisma.mediaFile.findMany.mockResolvedValue(mediaFiles)
      // @ts-ignore
      prisma.mediaFile.delete.mockResolvedValue({ count: 1 })

      const result = await enforceStorageTTL("lot-1")

      expect(result.success).toBe(true)
      expect(result.deletedFilesCount).toBe(1) // Only expired video
      expect(result.preservedFilesCount).toBe(2) // Crop and evidence preserved
    })

    it("should handle all files expired scenario", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const now = new Date()
      const allExpired = [
        {
          id: "video-1",
          lotId: "lot-1",
          type: "VIDEO",
          filePath: "/videos/lot-1/segment-1.mp4",
          fileSize: 1048576,
          createdAt: new Date(now.getTime() - 30 * 60 * 60 * 1000),
          isViolationEvidence: false,
          metadata: {},
        },
        {
          id: "crop-1",
          lotId: "lot-1",
          type: "ALPR_CROP",
          filePath: "/crops/lot-1/plate-123.jpg",
          fileSize: 524288,
          createdAt: new Date(now.getTime() - 80 * 60 * 60 * 1000),
          isViolationEvidence: false,
          metadata: {},
        },
      ]

      // @ts-ignore
      prisma.mediaFile.findMany.mockResolvedValue(allExpired)
      // @ts-ignore
      prisma.mediaFile.delete.mockResolvedValue({ count: 2 })

      const result = await enforceStorageTTL("lot-1")

      expect(result.success).toBe(true)
      expect(result.deletedFilesCount).toBe(2)
      expect(result.preservedFilesCount).toBe(0)
    })

    it("should handle all files preserved scenario", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const now = new Date()
      const allPreserved = [
        {
          id: "video-1",
          lotId: "lot-1",
          type: "VIDEO",
          filePath: "/videos/lot-1/segment-1.mp4",
          fileSize: 1048576,
          createdAt: new Date(now.getTime() - 10 * 60 * 60 * 1000),
          isViolationEvidence: false,
          metadata: {},
        },
        {
          id: "crop-1",
          lotId: "lot-1",
          type: "ALPR_CROP",
          filePath: "/crops/lot-1/plate-123.jpg",
          fileSize: 524288,
          createdAt: new Date(now.getTime() - 30 * 60 * 60 * 1000),
          isViolationEvidence: false,
          metadata: {},
        },
      ]

      // @ts-ignore
      prisma.mediaFile.findMany.mockResolvedValue(allPreserved)

      const result = await enforceStorageTTL("lot-1")

      expect(result.success).toBe(true)
      expect(result.deletedFilesCount).toBe(0)
      expect(result.preservedFilesCount).toBe(2)
    })
  })
})