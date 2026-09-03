/**
 * Unit Test Suite for Reserved Slots Compliance Engine
 * Validates compliance checking across reservation types
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals"
import {
  evaluateSlotCompliance,
  getActiveViolations,
  resolveViolation,
  SlotClassification,
  type ComplianceCheckResult,
} from "@/lib/compliance/reserved-slots"

// Mock Prisma Client
jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    slot: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    booking: {
      findFirst: jest.fn(),
    },
    complianceViolation: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
  })),
  SlotStatus: {
    AVAILABLE: "AVAILABLE",
    OCCUPIED: "OCCUPIED",
    RESERVED: "RESERVED",
    DISABLED: "DISABLED",
    CLOSED: "CLOSED",
  },
}))

describe("Reserved Slots Compliance Engine", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Slot Classification", () => {
    it("should correctly classify ACCESSIBLE_ADA slots", () => {
      expect(SlotClassification.ACCESSIBLE_ADA).toBe("ACCESSIBLE_ADA")
    })

    it("should correctly classify EV_CHARGING slots", () => {
      expect(SlotClassification.EV_CHARGING).toBe("EV_CHARGING")
    })

    it("should correctly classify VIP_RESERVED slots", () => {
      expect(SlotClassification.VIP_RESERVED).toBe("VIP_RESERVED")
    })

    it("should correctly classify REGULAR slots", () => {
      expect(SlotClassification.REGULAR).toBe("REGULAR")
    })
  })

  describe("Regular Slot Compliance", () => {
    it("should allow any vehicle in regular slots", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      prisma.slot.findUnique.mockResolvedValue({
        id: "slot-1",
        lotId: "lot-1",
        slotType: "REGULAR",
        status: "OCCUPIED",
        levelId: null,
      })

      const result = await evaluateSlotCompliance("slot-1", "TN-01-AB-1234", 1)

      expect(result.compliant).toBe(true)
      expect(result.violationType).toBeUndefined()
      expect(result.actionRequired).toBeUndefined()
    })
  })

  describe("Accessible ADA Slot Compliance", () => {
    it("should trigger high-severity violation for unauthorized vehicle in ADA slot", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      prisma.slot.findUnique.mockResolvedValue({
        id: "slot-ada-1",
        lotId: "lot-1",
        slotType: "ACCESSIBLE_ADA",
        status: "OCCUPIED",
        levelId: null,
      })

      prisma.booking.findFirst.mockResolvedValue(null) // No valid reservation

      prisma.complianceViolation.create.mockResolvedValue({
        id: "violation-1",
        type: "ACCESSIBLE_ADA",
        slotId: "slot-ada-1",
        vehiclePlate: "TN-01-AB-1234",
        severity: "HIGH",
        status: "ACTIVE",
        lotId: "lot-1",
        timestamp: new Date(),
        resolvedAt: null,
      })

      const result = await evaluateSlotCompliance("slot-ada-1", "TN-01-AB-1234", 1)

      expect(result.compliant).toBe(false)
      expect(result.violationType).toBe(SlotClassification.ACCESSIBLE_ADA)
      expect(result.actionRequired).toContain("ADA slot")
      expect(result.violation).toBeDefined()
      expect(result.violation?.severity).toBe("HIGH")
    })

    it("should bypass violation for authorized ADA reservation", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      prisma.slot.findUnique.mockResolvedValue({
        id: "slot-ada-1",
        lotId: "lot-1",
        slotType: "ACCESSIBLE_ADA",
        status: "OCCUPIED",
        levelId: null,
      })

      prisma.booking.findFirst.mockResolvedValue({
        id: "booking-1",
        customerId: "user-1",
        parkingLotId: "lot-1",
        slotId: "slot-ada-1",
        vehicleNumber: "TN-01-AB-1234",
        status: "ACTIVE",
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(Date.now() + 3600000),
        slot: {
          id: "slot-ada-1",
          slotType: "ACCESSIBLE_ADA",
        },
      })

      const result = await evaluateSlotCompliance("slot-ada-1", "TN-01-AB-1234", 1)

      expect(result.compliant).toBe(true)
      expect(result.violationType).toBeUndefined()
      expect(result.violation).toBeUndefined()
    })
  })

  describe("EV Charging Slot Compliance", () => {
    it("should trigger medium-severity violation for unauthorized vehicle in EV slot", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      prisma.slot.findUnique.mockResolvedValue({
        id: "slot-ev-1",
        lotId: "lot-1",
        slotType: "EV_CHARGING",
        status: "OCCUPIED",
        levelId: null,
      })

      prisma.booking.findFirst.mockResolvedValue(null) // No valid reservation

      prisma.complianceViolation.create.mockResolvedValue({
        id: "violation-2",
        type: "EV_CHARGING",
        slotId: "slot-ev-1",
        vehiclePlate: "TN-01-CD-5678",
        severity: "MEDIUM",
        status: "ACTIVE",
        lotId: "lot-1",
        timestamp: new Date(),
        resolvedAt: null,
      })

      const result = await evaluateSlotCompliance("slot-ev-1", "TN-01-CD-5678", 1)

      expect(result.compliant).toBe(false)
      expect(result.violationType).toBe(SlotClassification.EV_CHARGING)
      expect(result.actionRequired).toContain("EV")
      expect(result.violation).toBeDefined()
      expect(result.violation?.severity).toBe("MEDIUM")
    })

    it("should bypass violation for authorized EV reservation", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      prisma.slot.findUnique.mockResolvedValue({
        id: "slot-ev-1",
        lotId: "lot-1",
        slotType: "EV_CHARGING",
        status: "OCCUPIED",
        levelId: null,
      })

      prisma.booking.findFirst.mockResolvedValue({
        id: "booking-2",
        customerId: "user-2",
        parkingLotId: "lot-1",
        slotId: "slot-ev-1",
        vehicleNumber: "TN-01-CD-5678",
        status: "ACTIVE",
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(Date.now() + 3600000),
        slot: {
          id: "slot-ev-1",
          slotType: "EV_CHARGING",
        },
      })

      const result = await evaluateSlotCompliance("slot-ev-1", "TN-01-CD-5678", 1)

      expect(result.compliant).toBe(true)
      expect(result.violationType).toBeUndefined()
      expect(result.violation).toBeUndefined()
    })
  })

  describe("VIP Reserved Slot Compliance", () => {
    it("should trigger high-severity violation for unauthorized vehicle in VIP slot", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      prisma.slot.findUnique.mockResolvedValue({
        id: "slot-vip-1",
        lotId: "lot-1",
        slotType: "VIP_RESERVED",
        status: "OCCUPIED",
        levelId: null,
      })

      prisma.booking.findFirst.mockResolvedValue(null) // No valid reservation

      prisma.complianceViolation.create.mockResolvedValue({
        id: "violation-3",
        type: "VIP_RESERVED",
        slotId: "slot-vip-1",
        vehiclePlate: "TN-01-EF-9012",
        severity: "HIGH",
        status: "ACTIVE",
        lotId: "lot-1",
        timestamp: new Date(),
        resolvedAt: null,
      })

      const result = await evaluateSlotCompliance("slot-vip-1", "TN-01-EF-9012", 1)

      expect(result.compliant).toBe(false)
      expect(result.violationType).toBe(SlotClassification.VIP_RESERVED)
      expect(result.actionRequired).toContain("VIP")
      expect(result.violation).toBeDefined()
      expect(result.violation?.severity).toBe("HIGH")
    })

    it("should bypass violation for authorized VIP reservation", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      prisma.slot.findUnique.mockResolvedValue({
        id: "slot-vip-1",
        lotId: "lot-1",
        slotType: "VIP_RESERVED",
        status: "OCCUPIED",
        levelId: null,
      })

      prisma.booking.findFirst.mockResolvedValue({
        id: "booking-3",
        customerId: "user-3",
        parkingLotId: "lot-1",
        slotId: "slot-vip-1",
        vehicleNumber: "TN-01-EF-9012",
        status: "ACTIVE",
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(Date.now() + 3600000),
        slot: {
          id: "slot-vip-1",
          slotType: "VIP_RESERVED",
        },
      })

      const result = await evaluateSlotCompliance("slot-vip-1", "TN-01-EF-9012", 1)

      expect(result.compliant).toBe(true)
      expect(result.violationType).toBeUndefined()
      expect(result.violation).toBeUndefined()
    })
  })

  describe("Available Slot Compliance", () => {
    it("should not trigger violation for available slots", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      prisma.slot.findUnique.mockResolvedValue({
        id: "slot-1",
        lotId: "lot-1",
        slotType: "ACCESSIBLE_ADA",
        status: "AVAILABLE",
        levelId: null,
      })

      const result = await evaluateSlotCompliance("slot-1", "TN-01-AB-1234", 0)

      expect(result.compliant).toBe(true)
      expect(result.violationType).toBeUndefined()
    })
  })

  describe("Slot Not Found", () => {
    it("should return error when slot not found", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      prisma.slot.findUnique.mockResolvedValue(null)

      const result = await evaluateSlotCompliance("slot-nonexistent", "TN-01-AB-1234", 1)

      expect(result.compliant).toBe(false)
      expect(result.actionRequired).toContain("not found")
    })
  })

  describe("Active Violations Query", () => {
    it("should return all active violations for a lot", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      prisma.complianceViolation.findMany.mockResolvedValue([
        {
          id: "violation-1",
          type: "ACCESSIBLE_ADA",
          slotId: "slot-ada-1",
          vehiclePlate: "TN-01-AB-1234",
          severity: "HIGH",
          status: "ACTIVE",
          lotId: "lot-1",
          timestamp: new Date(),
          resolvedAt: null,
        },
        {
          id: "violation-2",
          type: "EV_CHARGING",
          slotId: "slot-ev-1",
          vehiclePlate: "TN-01-CD-5678",
          severity: "MEDIUM",
          status: "ACTIVE",
          lotId: "lot-1",
          timestamp: new Date(),
          resolvedAt: null,
        },
      ])

      const violations = await getActiveViolations("lot-1")

      expect(violations).toHaveLength(2)
      expect(violations[0].type).toBe("ACCESSIBLE_ADA")
      expect(violations[1].type).toBe("EV_CHARGING")
    })

    it("should return empty array when no active violations", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      prisma.complianceViolation.findMany.mockResolvedValue([])

      const violations = await getActiveViolations("lot-1")

      expect(violations).toHaveLength(0)
    })
  })

  describe("Violation Resolution", () => {
    it("should successfully resolve a violation", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      prisma.complianceViolation.update.mockResolvedValue({
        count: 1,
      })

      const result = await resolveViolation("violation-1")

      expect(result).toBe(true)
      expect(prisma.complianceViolation.update).toHaveBeenCalledWith({
        where: { id: "violation-1" },
        data: {
          status: "RESOLVED",
          resolvedAt: expect.any(Date),
        },
      })
    })
  })

  describe("Reservation Type Mismatch", () => {
    it("should trigger violation when reservation type does not match slot type", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      prisma.slot.findUnique.mockResolvedValue({
        id: "slot-ada-1",
        lotId: "lot-1",
        slotType: "ACCESSIBLE_ADA",
        status: "OCCUPIED",
        levelId: null,
      })

      // Vehicle has EV reservation but is in ADA slot
      prisma.booking.findFirst.mockResolvedValue({
        id: "booking-1",
        customerId: "user-1",
        parkingLotId: "lot-1",
        slotId: "slot-ada-1",
        vehicleNumber: "TN-01-AB-1234",
        status: "ACTIVE",
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(Date.now() + 3600000),
        slot: {
          id: "slot-ada-1",
          slotType: "EV_CHARGING", // Mismatch
        },
      })

      prisma.complianceViolation.create.mockResolvedValue({
        id: "violation-1",
        type: "ACCESSIBLE_ADA",
        slotId: "slot-ada-1",
        vehiclePlate: "TN-01-AB-1234",
        severity: "HIGH",
        status: "ACTIVE",
        lotId: "lot-1",
        timestamp: new Date(),
        resolvedAt: null,
      })

      const result = await evaluateSlotCompliance("slot-ada-1", "TN-01-AB-1234", 1)

      expect(result.compliant).toBe(false)
      expect(result.violationType).toBe(SlotClassification.ACCESSIBLE_ADA)
    })
  })

  describe("100% Coverage Test", () => {
    it("should cover all reservation types", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      const slotTypes = [
        "REGULAR",
        "ACCESSIBLE_ADA",
        "EV_CHARGING",
        "VIP_RESERVED",
      ]

      for (const slotType of slotTypes) {
        prisma.slot.findUnique.mockResolvedValue({
          id: `slot-${slotType}`,
          lotId: "lot-1",
          slotType,
          status: "OCCUPIED",
          levelId: null,
        })

        prisma.booking.findFirst.mockResolvedValue(null)

        if (slotType !== "REGULAR") {
          prisma.complianceViolation.create.mockResolvedValue({
            id: `violation-${slotType}`,
            type: slotType,
            slotId: `slot-${slotType}`,
            vehiclePlate: "TN-01-AB-1234",
            severity: slotType === "EV_CHARGING" ? "MEDIUM" : "HIGH",
            status: "ACTIVE",
            lotId: "lot-1",
            timestamp: new Date(),
            resolvedAt: null,
          })
        }

        const result = await evaluateSlotCompliance(`slot-${slotType}`, "TN-01-AB-1234", 1)

        if (slotType === "REGULAR") {
          expect(result.compliant).toBe(true)
        } else {
          expect(result.compliant).toBe(false)
          expect(result.violationType).toBe(slotType)
        }
      }
    })
  })
})