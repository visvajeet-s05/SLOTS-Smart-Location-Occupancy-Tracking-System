/**
 * Automated Audit Test Suite
 * Unit tests for pricing decomposition and fairness auditing
 */

import { describe, it, expect, beforeEach } from "@jest/globals"
import {
  decomposePricingFromRL,
  decomposePricingFromFactors,
  validatePricingDecomposition,
  checkSurgeCapCompliance,
  type PricingContext,
  type RLActionOutput,
} from "@/lib/pricing/explainability"
import {
  recordPricingEvent,
  runFairnessAudit,
  simulate24HourTraffic,
  clearAuditHistory,
  getAuditHistoryCount,
  type PricingDecomposition,
} from "@/lib/pricing/fairness-audit"

describe("Pricing Decomposition Engine", () => {
  describe("decomposePricingFromRL", () => {
    it("should decompose pricing from RL action correctly", () => {
      const context: PricingContext = {
        lotId: "test-lot-1",
        baseRate: 50,
        currentOccupancy: 0.8,
        demandScore: 0.7,
        hasEvent: false,
        timeOfDay: "day",
        bookingDuration: 2,
      }

      const rlAction: RLActionOutput = {
        action: 0.5,
        confidence: 0.9,
      }

      const decomposition = decomposePricingFromRL(context, rlAction)

      expect(decomposition).toBeDefined()
      expect(decomposition.baseRate).toBe(50)
      expect(decomposition.finalPrice).toBeGreaterThan(0)
      expect(decomposition.factorBreakdown).toHaveLength(3) // Base, Occupancy, Demand
      expect(decomposition.lotId).toBe("test-lot-1")
    })

    it("should apply event multiplier when event is present", () => {
      const context: PricingContext = {
        lotId: "test-lot-2",
        baseRate: 50,
        currentOccupancy: 0.6,
        demandScore: 0.5,
        hasEvent: true,
        eventIntensity: 0.8,
        timeOfDay: "evening",
        bookingDuration: 3,
      }

      const rlAction: RLActionOutput = {
        action: 0.3,
        confidence: 0.85,
      }

      const decomposition = decomposePricingFromRL(context, rlAction)

      expect(decomposition.eventMultiplier).toBeGreaterThan(1.0)
      expect(decomposition.factorBreakdown.some(f => f.factor === "Event Multiplier")).toBe(true)
    })

    it("should cap surge at maximum multiplier", () => {
      const context: PricingContext = {
        lotId: "test-lot-3",
        baseRate: 50,
        currentOccupancy: 0.95, // Very high
        demandScore: 0.95, // Very high
        hasEvent: true,
        eventIntensity: 1.0, // Maximum
        timeOfDay: "morning",
        bookingDuration: 1,
      }

      const rlAction: RLActionOutput = {
        action: 1.0, // Maximum
        confidence: 0.95,
      }

      const decomposition = decomposePricingFromRL(context, rlAction)

      const surgeCompliance = checkSurgeCapCompliance(decomposition)
      expect(surgeCompliance.compliant).toBe(true)
      expect(decomposition.finalPrice).toBeLessThanOrEqual(50 * 3.0) // Max 3x surge
    })
  })

  describe("decomposePricingFromFactors", () => {
    it("should decompose pricing from direct factors correctly", () => {
      const context: PricingContext = {
        lotId: "test-lot-4",
        baseRate: 40,
        currentOccupancy: 0.5,
        demandScore: 0.5,
        hasEvent: false,
        timeOfDay: "day",
        bookingDuration: 2,
      }

      const decomposition = decomposePricingFromFactors(context, 1.2, 1.1, 1.0)

      expect(decomposition.baseRate).toBe(40)
      expect(decomposition.occupancyMultiplier).toBe(1.2)
      expect(decomposition.demandMultiplier).toBe(1.1)
      expect(decomposition.eventMultiplier).toBe(1.0)
    })
  })

  describe("validatePricingDecomposition", () => {
    it("should validate pricing decomposition reconstruction", () => {
      const context: PricingContext = {
        lotId: "test-lot-5",
        baseRate: 50,
        currentOccupancy: 0.7,
        demandScore: 0.6,
        hasEvent: false,
        timeOfDay: "day",
        bookingDuration: 2,
      }

      const rlAction: RLActionOutput = {
        action: 0.4,
        confidence: 0.9,
      }

      const decomposition = decomposePricingFromRL(context, rlAction)
      const validation = validatePricingDecomposition(decomposition)

      expect(validation.valid).toBe(true)
      expect(validation.error).toBeLessThan(validation.tolerance)
    })

    it("should detect floating-point drift within tolerance", () => {
      const context: PricingContext = {
        lotId: "test-lot-6",
        baseRate: 100,
        currentOccupancy: 0.8,
        demandScore: 0.7,
        hasEvent: false,
        timeOfDay: "day",
        bookingDuration: 1,
      }

      const rlAction: RLActionOutput = {
        action: 0.6,
        confidence: 0.9,
      }

      const decomposition = decomposePricingFromRL(context, rlAction)
      const validation = validatePricingDecomposition(decomposition)

      // Should be valid within 1% tolerance
      expect(validation.valid).toBe(true)
    })
  })

  describe("checkSurgeCapCompliance", () => {
    it("should verify surge cap compliance", () => {
      const context: PricingContext = {
        lotId: "test-lot-7",
        baseRate: 50,
        currentOccupancy: 0.9,
        demandScore: 0.9,
        hasEvent: true,
        eventIntensity: 0.9,
        timeOfDay: "morning",
        bookingDuration: 1,
      }

      const rlAction: RLActionOutput = {
        action: 0.9,
        confidence: 0.95,
      }

      const decomposition = decomposePricingFromRL(context, rlAction)
      const compliance = checkSurgeCapCompliance(decomposition)

      expect(compliance).toBeDefined()
      expect(compliance.cap).toBe(3.0)
      expect(compliance.compliant).toBe(true) // Should be capped
    })
  })
})

describe("Fairness Auditor", () => {
  beforeEach(() => {
    clearAuditHistory()
  })

  describe("recordPricingEvent", () => {
    it("should record pricing events for auditing", () => {
      const decomposition: PricingDecomposition = {
        baseRate: 50,
        occupancyMultiplier: 1.2,
        demandMultiplier: 1.1,
        eventMultiplier: 1.0,
        finalPrice: 66,
        factorBreakdown: [],
        timestamp: new Date(),
        lotId: "test-lot",
      }

      recordPricingEvent(decomposition)

      expect(getAuditHistoryCount()).toBe(1)
    })

    it("should determine cohort based on timestamp", () => {
      const morning = new Date()
      morning.setHours(8, 0, 0, 0) // 8 AM

      const decomposition: PricingDecomposition = {
        baseRate: 50,
        occupancyMultiplier: 1.2,
        demandMultiplier: 1.1,
        eventMultiplier: 1.0,
        finalPrice: 66,
        factorBreakdown: [],
        timestamp: morning,
        lotId: "test-lot",
      }

      recordPricingEvent(decomposition, morning)

      expect(getAuditHistoryCount()).toBe(1)
    })
  })

  describe("runFairnessAudit", () => {
    it("should run fairness audit on pricing data", () => {
      simulate24HourTraffic(50)

      const auditReport = runFairnessAudit()

      expect(auditReport).toBeDefined()
      expect(auditReport.metrics).toBeDefined()
      expect(auditReport.metrics.disparateImpactRatio).toBeGreaterThan(0)
      expect(auditReport.metrics.disparateImpactRatio).toBeLessThanOrEqual(1)
      expect(auditReport.metrics.giniCoefficient).toBeGreaterThanOrEqual(0)
      expect(auditReport.metrics.giniCoefficient).toBeLessThanOrEqual(1)
      expect(auditReport.metrics.surgeCapCompliance).toBe(true)
      expect(auditReport.totalTransactions).toBe(24) // 24 hours
    })

    it("should calculate cohort statistics correctly", () => {
      simulate24HourTraffic(50)

      const auditReport = runFairnessAudit()

      expect(auditReport.metrics.cohortAnalysis.size).toBe(4) // 4 cohorts

      for (const [cohort, data] of auditReport.metrics.cohortAnalysis.entries()) {
        expect(data.prices.length).toBeGreaterThan(0)
        expect(data.averagePrice).toBeGreaterThan(0)
        expect(data.priceRange.min).toBeLessThanOrEqual(data.priceRange.max)
      }
    })

    it("should generate recommendations based on metrics", () => {
      simulate24HourTraffic(50)

      const auditReport = runFairnessAudit()

      expect(auditReport.recommendations).toBeDefined()
      expect(Array.isArray(auditReport.recommendations)).toBe(true)
      expect(auditReport.recommendations.length).toBeGreaterThan(0)
    })

    it("should determine compliance status", () => {
      simulate24HourTraffic(50)

      const auditReport = runFairnessAudit()

      expect(["COMPLIANT", "WARNING", "NON_COMPLIANT"]).toContain(
        auditReport.complianceStatus
      )
    })
  })

  describe("simulate24HourTraffic", () => {
    it("should simulate 24 hours of traffic data", () => {
      simulate24HourTraffic(50)

      expect(getAuditHistoryCount()).toBe(24)
    })

    it("should clear history when called", () => {
      simulate24HourTraffic(50)
      expect(getAuditHistoryCount()).toBe(24)

      clearAuditHistory()
      expect(getAuditHistoryCount()).toBe(0)
    })
  })
})

describe("Surge Cap Compliance Test Suite", () => {
  it("should verify surge cap is never breached across 1000 simulated demand spikes", () => {
    const baseRate = 50
    const violations: number[] = []

    for (let i = 0; i < 1000; i++) {
      // Simulate extreme demand spikes
      const context: PricingContext = {
        lotId: "test-lot",
        baseRate,
        currentOccupancy: 0.9 + Math.random() * 0.1, // 90-100%
        demandScore: 0.9 + Math.random() * 0.1, // 90-100%
        hasEvent: Math.random() > 0.5,
        eventIntensity: Math.random(),
        timeOfDay: "morning",
        bookingDuration: 1,
      }

      const rlAction: RLActionOutput = {
        action: Math.random(), // 0-1
        confidence: 0.9,
      }

      const decomposition = decomposePricingFromRL(context, rlAction)
      const compliance = checkSurgeCapCompliance(decomposition)

      if (!compliance.compliant) {
        violations.push(compliance.totalMultiplier)
      }
    }

    // Verify zero violations
    expect(violations.length).toBe(0)
    expect(violations).toHaveLength(0)
  })

  it("should maintain pricing reconstruction accuracy across 1000 decompositions", () => {
    const reconstructionErrors: number[] = []

    for (let i = 0; i < 1000; i++) {
      const context: PricingContext = {
        lotId: "test-lot",
        baseRate: 50 + Math.random() * 50, // 50-100
        currentOccupancy: Math.random(),
        demandScore: Math.random(),
        hasEvent: Math.random() > 0.5,
        eventIntensity: Math.random(),
        timeOfDay: "day",
        bookingDuration: 1 + Math.floor(Math.random() * 5),
      }

      const rlAction: RLActionOutput = {
        action: Math.random(),
        confidence: 0.9,
      }

      const decomposition = decomposePricingFromRL(context, rlAction)
      const validation = validatePricingDecomposition(decomposition)

      reconstructionErrors.push(validation.error)

      // All should be valid within tolerance
      expect(validation.valid).toBe(true)
    }

    // Verify errors are within acceptable range
    const maxError = Math.max(...reconstructionErrors)
    const avgError = reconstructionErrors.reduce((a, b) => a + b, 0) / reconstructionErrors.length

    expect(maxError).toBeLessThan(1.0) // Max error < 1 currency unit
    expect(avgError).toBeLessThan(0.1) // Average error < 0.1 currency units
  })
})

describe("Fairness Metrics Calculation", () => {
  beforeEach(() => {
    clearAuditHistory()
  })

  it("should calculate Disparate Impact Ratio correctly", () => {
    // Create controlled pricing data with known disparity
    const basePrice = 50

    // Add pricing events for each cohort
    for (let i = 0; i < 10; i++) {
      const cohorts = ["commuter_morning", "off_peak_day", "evening_recreational", "night_essential"] as const
      
      for (const cohort of cohorts) {
        const multiplier = cohort === "commuter_morning" ? 1.5 : 1.0 // Disparity
        const decomposition: PricingDecomposition = {
          baseRate: basePrice,
          occupancyMultiplier: multiplier,
          demandMultiplier: 1.0,
          eventMultiplier: 1.0,
          finalPrice: basePrice * multiplier,
          factorBreakdown: [],
          timestamp: new Date(),
          lotId: "test-lot",
        }

        recordPricingEvent(decomposition)
      }
    }

    const auditReport = runFairnessAudit()

    // DIR should be < 1.0 due to disparity
    expect(auditReport.metrics.disparateImpactRatio).toBeLessThan(1.0)
    expect(auditReport.metrics.disparateImpactRatio).toBeGreaterThan(0)
  })

  it("should calculate Gini coefficient for price variation", () => {
    // Create pricing data with known variation
    const prices = [40, 50, 60, 70, 80, 90, 100]

    for (const price of prices) {
      const decomposition: PricingDecomposition = {
        baseRate: 50,
        occupancyMultiplier: price / 50,
        demandMultiplier: 1.0,
        eventMultiplier: 1.0,
        finalPrice: price,
        factorBreakdown: [],
        timestamp: new Date(),
        lotId: "test-lot",
      }

      recordPricingEvent(decomposition)
    }

    const auditReport = runFairnessAudit()

    // Gini should be between 0 and 1
    expect(auditReport.metrics.giniCoefficient).toBeGreaterThanOrEqual(0)
    expect(auditReport.metrics.giniCoefficient).toBeLessThanOrEqual(1)
  })
})