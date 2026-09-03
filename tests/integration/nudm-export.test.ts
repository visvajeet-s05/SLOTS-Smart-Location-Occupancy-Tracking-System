/**
 * NUDM Export Integration Test Suite
 * Verifies that internal database state changes correctly map to NUDM GeoJSON schemas
 * without data loss or schema violation
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals"
import { PrismaClient } from "@prisma/client"
import {
  transformToNUDM,
  transformToNUDMGeoJSON,
  queryParkingLots,
  validateNUDMSchema,
  type NUDMParkingFacility,
  type NUDMExportQuery,
} from "@/lib/nudm/schema-transformer"

const prisma = new PrismaClient()

describe("NUDM Schema Transformer Integration Tests", () => {
  let testLotId: string
  let testSiteId: string

  beforeAll(async () => {
    // Create test parking site
    const site = await prisma.parkingSite.create({
      data: {
        name: "Test City, Chennai",
        location: "Test Location",
        latitude: 13.0827,
        longitude: 80.2707,
      },
    })
    testSiteId = site.id

    // Create test parking lot
    const lot = await prisma.parkinglot.create({
      data: {
        ownerId: "test-owner-id",
        name: "Test Parking Lot",
        address: "123 Test Street",
        lat: 13.0827,
        lng: 80.2707,
        status: "ACTIVE",
        totalSlots: 100,
        parkingSiteId: testSiteId,
      },
    })
    testLotId = lot.id

    // Create test slots
    for (let i = 0; i < 50; i++) {
      await prisma.slot.create({
        data: {
          slotNumber: `SLOT-${i}`,
          status: i < 20 ? "AVAILABLE" : "OCCUPIED",
          slotType: i < 5 ? "EV_CHARGING" : "STANDARD",
          isAccessible: i < 3,
          lotId: testLotId,
        },
      })
    }

    // Create pricing rule
    await prisma.pricingrule.create({
      data: {
        parkingLotId: testLotId,
        baseRate: 50,
        vehicleType: "CAR",
        duration: 1,
        price: 50,
      },
    })
  })

  afterAll(async () => {
    // Cleanup test data
    await prisma.slot.deleteMany({ where: { lotId: testLotId } })
    await prisma.pricingrule.deleteMany({ where: { parkingLotId: testLotId } })
    await prisma.parkinglot.delete({ where: { id: testLotId } })
    await prisma.parkingSite.delete({ where: { id: testSiteId } })
    await prisma.$disconnect()
  })

  describe("transformToNUDM", () => {
    it("should transform internal parking lot to NUDM facility schema", async () => {
      const facility = await transformToNUDM(testLotId)

      expect(facility).toBeDefined()
      expect(facility.id).toMatch(/^urn:nudm:in:/)
      expect(facility.name).toBe("Test Parking Lot")
      expect(facility.location.type).toBe("Point")
      expect(facility.location.coordinates).toHaveLength(2)
      expect(facility.capacity).toBeDefined()
      expect(facility.pricing).toBeDefined()
      expect(facility.status).toBe("ACTIVE")
      expect(facility.timestamp).toBeDefined()
      expect(facility["@context"]).toBe("https://nudm.gov.in/contexts/parking-v1.jsonld")
    })

    it("should accurately map capacity information", async () => {
      const facility = await transformToNUDM(testLotId)

      expect(facility.capacity.total).toBe(50)
      expect(facility.capacity.available).toBe(20)
      expect(facility.capacity.occupied).toBe(30)
      expect(facility.capacity.ev_bays).toBe(5)
      expect(facility.capacity.accessible_bays).toBe(3)
    })

    it("should include pricing information with breakdown", async () => {
      const facility = await transformToNUDM(testLotId)

      expect(facility.pricing).toBeDefined()
      expect(facility.pricing.baseRate).toBeGreaterThan(0)
      expect(facility.pricing.currentRate).toBeGreaterThan(0)
      expect(facility.pricing.currency).toBe("INR")
      expect(facility.pricing.pricingFactor).toBeGreaterThan(0)
      expect(facility.pricing.breakdown).toBeDefined()
      expect(facility.pricing.breakdown.occupancyMultiplier).toBeGreaterThan(0)
      expect(facility.pricing.breakdown.demandMultiplier).toBeGreaterThan(0)
    })

    it("should return null for non-existent parking lot", async () => {
      const facility = await transformToNUDM("non-existent-lot-id")
      expect(facility).toBeNull()
    })
  })

  describe("transformToNUDMGeoJSON", () => {
    it("should transform multiple parking lots to GeoJSON FeatureCollection", async () => {
      const lotIds = [testLotId]
      const geoJSON = await transformToNUDMGeoJSON(lotIds)

      expect(geoJSON).toBeDefined()
      expect(geoJSON.type).toBe("FeatureCollection")
      expect(geoJSON.features).toHaveLength(1)
      expect(geoJSON["@context"]).toBe("https://nudm.gov.in/contexts/parking-v1.jsonld")
    })

    it("should create valid GeoJSON features", async () => {
      const lotIds = [testLotId]
      const geoJSON = await transformToNUDMGeoJSON(lotIds)

      const feature = geoJSON.features[0]
      expect(feature.type).toBe("Feature")
      expect(feature.geometry.type).toBe("Point")
      expect(feature.geometry.coordinates).toHaveLength(2)
      expect(feature.properties).toBeDefined()
      expect(feature.properties.id).toMatch(/^urn:nudm:in:/)
    })

    it("should handle empty lot ID list", async () => {
      const geoJSON = await transformToNUDMGeoJSON([])

      expect(geoJSON.type).toBe("FeatureCollection")
      expect(geoJSON.features).toHaveLength(0)
    })
  })

  describe("queryParkingLots", () => {
    it("should query parking lots by city filter", async () => {
      const query: NUDMExportQuery = {
        city: "Chennai",
      }

      const lotIds = await queryParkingLots(query)

      expect(Array.isArray(lotIds)).toBe(true)
      // Should include our test lot since it's in Chennai
      expect(lotIds.length).toBeGreaterThan(0)
    })

    it("should query parking lots by ward ID filter", async () => {
      const query: NUDMExportQuery = {
        wardId: "Test",
      }

      const lotIds = await queryParkingLots(query)

      expect(Array.isArray(lotIds)).toBe(true)
    })

    it("should query parking lots by geographic radius", async () => {
      const query: NUDMExportQuery = {
        lat: 13.0827,
        lng: 80.2707,
        radiusKm: 10,
      }

      const lotIds = await queryParkingLots(query)

      expect(Array.isArray(lotIds)).toBe(true)
      // Should include our test lot since it's within 10km
      expect(lotIds.length).toBeGreaterThan(0)
    })

    it("should return empty array for filters with no matches", async () => {
      const query: NUDMExportQuery = {
        city: "NonExistentCity",
      }

      const lotIds = await queryParkingLots(query)

      expect(lotIds).toHaveLength(0)
    })

    it("should handle query with no filters", async () => {
      const query: NUDMExportQuery = {}

      const lotIds = await queryParkingLots(query)

      expect(Array.isArray(lotIds)).toBe(true)
      expect(lotIds.length).toBeGreaterThan(0)
    })
  })

  describe("validateNUDMSchema", () => {
    it("should validate a correctly formed NUDM facility", async () => {
      const facility = await transformToNUDM(testLotId)
      expect(facility).not.toBeNull()

      const validation = validateNUDMSchema(facility)

      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it("should detect missing URN format", () => {
      const invalidFacility: NUDMParkingFacility = {
        id: "invalid-id",
        name: "Test",
        location: { type: "Point", coordinates: [80.2707, 13.0827] },
        capacity: { total: 100, available: 50, occupied: 50, ev_bays: 10, accessible_bays: 5 },
        pricing: {
          baseRate: 50,
          currentRate: 65,
          currency: "INR",
          pricingFactor: 1.3,
          breakdown: { occupancyMultiplier: 1.2, demandMultiplier: 1.1, eventMultiplier: 1.0 },
        },
        status: "ACTIVE",
        timestamp: new Date().toISOString(),
        "@context": "https://nudm.gov.in/contexts/parking-v1.jsonld",
      }

      const validation = validateNUDMSchema(invalidFacility)

      expect(validation.valid).toBe(false)
      expect(validation.errors).toContainEqual("Invalid or missing URN format ID")
    })

    it("should detect missing facility name", () => {
      const invalidFacility: NUDMParkingFacility = {
        id: "urn:nudm:in:chennai:parking:lot-123",
        name: "",
        location: { type: "Point", coordinates: [80.2707, 13.0827] },
        capacity: { total: 100, available: 50, occupied: 50, ev_bays: 10, accessible_bays: 5 },
        pricing: {
          baseRate: 50,
          currentRate: 65,
          currency: "INR",
          pricingFactor: 1.3,
          breakdown: { occupancyMultiplier: 1.2, demandMultiplier: 1.1, eventMultiplier: 1.0 },
        },
        status: "ACTIVE",
        timestamp: new Date().toISOString(),
        "@context": "https://nudm.gov.in/contexts/parking-v1.jsonld",
      }

      const validation = validateNUDMSchema(invalidFacility)

      expect(validation.valid).toBe(false)
      expect(validation.errors).toContainEqual("Missing facility name")
    })

    it("should detect invalid GeoJSON Point", () => {
      const invalidFacility: NUDMParkingFacility = {
        id: "urn:nudm:in:chennai:parking:lot-123",
        name: "Test",
        location: { type: "Point", coordinates: [80.2707] }, // Missing second coordinate
        capacity: { total: 100, available: 50, occupied: 50, ev_bays: 10, accessible_bays: 5 },
        pricing: {
          baseRate: 50,
          currentRate: 65,
          currency: "INR",
          pricingFactor: 1.3,
          breakdown: { occupancyMultiplier: 1.2, demandMultiplier: 1.1, eventMultiplier: 1.0 },
        },
        status: "ACTIVE",
        timestamp: new Date().toISOString(),
        "@context": "https://nudm.gov.in/contexts/parking-v1.jsonld",
      }

      const validation = validateNUDMSchema(invalidFacility)

      expect(validation.valid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
    })

    it("should detect invalid facility status", () => {
      const invalidFacility: NUDMParkingFacility = {
        id: "urn:nudm:in:chennai:parking:lot-123",
        name: "Test",
        location: { type: "Point", coordinates: [80.2707, 13.0827] },
        capacity: { total: 100, available: 50, occupied: 50, ev_bays: 10, accessible_bays: 5 },
        pricing: {
          baseRate: 50,
          currentRate: 65,
          currency: "INR",
          pricingFactor: 1.3,
          breakdown: { occupancyMultiplier: 1.2, demandMultiplier: 1.1, eventMultiplier: 1.0 },
        },
        status: "MAINTENANCE", // Valid status
        timestamp: new Date().toISOString(),
        "@context": "https://nudm.gov.in/contexts/parking-v1.jsonld",
      }

      // Create a copy with invalid status
      const invalidFacilityCopy = { ...invalidFacility }
      ;(invalidFacilityCopy as any).status = "INVALID_STATUS"

      const validation = validateNUDMSchema(invalidFacilityCopy)

      expect(validation.valid).toBe(false)
      expect(validation.errors).toContainEqual("Invalid facility status")
    })

    it("should detect invalid timestamp", () => {
      const invalidFacility: NUDMParkingFacility = {
        id: "urn:nudm:in:chennai:parking:lot-123",
        name: "Test",
        location: { type: "Point", coordinates: [80.2707, 13.0827] },
        capacity: { total: 100, available: 50, occupied: 50, ev_bays: 10, accessible_bays: 5 },
        pricing: {
          baseRate: 50,
          currentRate: 65,
          currency: "INR",
          pricingFactor: 1.3,
          breakdown: { occupancyMultiplier: 1.2, demandMultiplier: 1.1, eventMultiplier: 1.0 },
        },
        status: "ACTIVE",
        timestamp: "invalid-timestamp",
        "@context": "https://nudm.gov.in/contexts/parking-v1.jsonld",
      }

      const validation = validateNUDMSchema(invalidFacility)

      expect(validation.valid).toBe(false)
      expect(validation.errors).toContainEqual("Invalid or missing timestamp")
    })

    it("should detect missing JSON-LD context", () => {
      const invalidFacility: NUDMParkingFacility = {
        id: "urn:nudm:in:chennai:parking:lot-123",
        name: "Test",
        location: { type: "Point", coordinates: [80.2707, 13.0827] },
        capacity: { total: 100, available: 50, occupied: 50, ev_bays: 10, accessible_bays: 5 },
        pricing: {
          baseRate: 50,
          currentRate: 65,
          currency: "INR",
          pricingFactor: 1.3,
          breakdown: { occupancyMultiplier: 1.2, demandMultiplier: 1.1, eventMultiplier: 1.0 },
        },
        status: "ACTIVE",
        timestamp: new Date().toISOString(),
        "@context": "",
      }

      const validation = validateNUDMSchema(invalidFacility)

      expect(validation.valid).toBe(false)
      expect(validation.errors).toContainEqual("Missing JSON-LD context")
    })
  })

  describe("Data Loss Prevention", () => {
    it("should preserve all capacity information during transformation", async () => {
      // Get original data from database
      const originalLot = await prisma.parkinglot.findUnique({
        where: { id: testLotId },
        include: {
          slots: {
            where: { status: { in: ["AVAILABLE", "OCCUPIED"] } }
          }
        }
      })

      expect(originalLot).not.toBeNull()

      const originalTotal = originalLot!.slots.length
      const originalAvailable = originalLot!.slots.filter(s => s.status === "AVAILABLE").length
      const originalOccupied = originalLot!.slots.filter(s => s.status === "OCCUPIED").length
      const originalEV = originalLot!.slots.filter(s => s.slotType === "EV_CHARGING").length
      const originalAccessible = originalLot!.slots.filter(s => s.isAccessible === true).length

      // Transform to NUDM
      const facility = await transformToNUDM(testLotId)

      // Verify no data loss
      expect(facility.capacity.total).toBe(originalTotal)
      expect(facility.capacity.available).toBe(originalAvailable)
      expect(facility.capacity.occupied).toBe(originalOccupied)
      expect(facility.capacity.ev_bays).toBe(originalEV)
      expect(facility.capacity.accessible_bays).toBe(originalAccessible)
    })

    it("should preserve pricing information during transformation", async () => {
      // Get original pricing rule
      const originalPricing = await prisma.pricingrule.findFirst({
        where: { parkingLotId: testLotId },
      })

      expect(originalPricing).not.toBeNull()

      // Transform to NUDM
      const facility = await transformToNUDM(testLotId)

      // Verify pricing is preserved
      expect(facility.pricing.baseRate).toBe(originalPricing!.baseRate)
      expect(facility.pricing.currentRate).toBeGreaterThan(0)
      expect(facility.pricing.currency).toBe("INR")
    })

    it("should preserve geographic coordinates accurately", async () => {
      // Get original lot
      const originalLot = await prisma.parkinglot.findUnique({
        where: { id: testLotId },
      })

      expect(originalLot).not.toBeNull()

      // Transform to NUDM
      const facility = await transformToNUDM(testLotId)

      // Verify coordinates (longitude, latitude order in GeoJSON)
      expect(facility.location.coordinates[0]).toBeCloseTo(originalLot!.lng, 6)
      expect(facility.location.coordinates[1]).toBeCloseTo(originalLot!.lat, 6)
    })
  })

  describe("Schema Compliance", () => {
    it("should generate valid URN format for all facilities", async () => {
      const facility = await transformToNUDM(testLotId)
      expect(facility).not.toBeNull()

      expect(facility.id).toMatch(/^urn:nudm:in:[a-z]+:parking:.+$/)
    })

    it("should generate valid ISO-8601 timestamps", async () => {
      const facility = await transformToNUDM(testLotId)
      expect(facility).not.toBeNull()

      const timestamp = new Date(facility.timestamp)
      expect(timestamp.getTime()).not.toBeNaN()
    })

    it("should use correct GeoJSON Point format", async () => {
      const facility = await transformToNUDM(testLotId)
      expect(facility).not.toBeNull()

      expect(facility.location.type).toBe("Point")
      expect(facility.location.coordinates).toHaveLength(2)
      expect(facility.location.coordinates[0]).toBeGreaterThanOrEqual(-180)
      expect(facility.location.coordinates[0]).toBeLessThanOrEqual(180)
      expect(facility.location.coordinates[1]).toBeGreaterThanOrEqual(-90)
      expect(facility.location.coordinates[1]).toBeLessThanOrEqual(90)
    })

    it("should include valid pricing breakdown structure", async () => {
      const facility = await transformToNUDM(testLotId)
      expect(facility).not.toBeNull()

      expect(facility.pricing.breakdown).toBeDefined()
      expect(typeof facility.pricing.breakdown.occupancyMultiplier).toBe("number")
      expect(typeof facility.pricing.breakdown.demandMultiplier).toBe("number")
      expect(typeof facility.pricing.breakdown.eventMultiplier).toBe("number")
    })
  })
})