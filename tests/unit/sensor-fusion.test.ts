/**
 * Unit Test Suite for Sensor Fusion Engine
 * Verifies Bayesian/Dempster-Shafer confidence fusion and environmental weight switching
 */

import { describe, it, expect } from "@jest/globals"
import {
  processSensorFusion,
  batchProcessSensorFusion,
  getFusionConfig,
  updateFusionConfig,
  type SensorInput,
  type FusionResult,
  type EnvironmentCondition,
} from "@/lib/vision/sensor-fusion"

describe("Sensor Fusion Engine", () => {
  describe("Basic Fusion", () => {
    it("should calculate fused occupancy state with high confidence", () => {
      const input: SensorInput = {
        slotId: "slot-101",
        visionConfidence: 0.85,
        visionState: 1,
        ultrasonicDistanceCm: 30,
        irBeamBroken: true,
        environmentCondition: "daylight_clear",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.fusedOccupancyState).toBe(1)
      expect(result.fusedConfidence).toBeGreaterThan(0.7)
      expect(result.sensorWeights.vision).toBe(0.70)
      expect(result.overrideReason).toBeUndefined()
    })

    it("should calculate fused vacancy state with high confidence", () => {
      const input: SensorInput = {
        slotId: "slot-102",
        visionConfidence: 0.90,
        visionState: 0,
        ultrasonicDistanceCm: 200,
        irBeamBroken: false,
        environmentCondition: "daylight_clear",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.fusedOccupancyState).toBe(0)
      expect(result.fusedConfidence).toBeGreaterThan(0.7)
    })

    it("should handle intermediate ultrasonic distance", () => {
      const input: SensorInput = {
        slotId: "slot-103",
        visionConfidence: 0.60,
        visionState: 1,
        ultrasonicDistanceCm: 100, // Intermediate range
        irBeamBroken: true,
        environmentCondition: "daylight_clear",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.fusedOccupancyState).toBeDefined()
      expect(result.fusedConfidence).toBeGreaterThan(0)
    })
  })

  describe("Environmental Weight Switching", () => {
    it("should decrease vision weight during monsoon glare", () => {
      const input: SensorInput = {
        slotId: "slot-104",
        visionConfidence: 0.45,
        visionState: 1,
        ultrasonicDistanceCm: 35,
        irBeamBroken: true,
        environmentCondition: "monsoon_glare",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.sensorWeights.vision).toBe(0.30)
      expect(result.sensorWeights.ultrasonic).toBe(0.50)
      expect(result.sensorWeights.ir).toBe(0.20)
    })

    it("should decrease vision weight during low light", () => {
      const input: SensorInput = {
        slotId: "slot-105",
        visionConfidence: 0.50,
        visionState: 0,
        ultrasonicDistanceCm: 180,
        irBeamBroken: false,
        environmentCondition: "night_low_light",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.sensorWeights.vision).toBe(0.30)
      expect(result.sensorWeights.ultrasonic).toBe(0.50)
      expect(result.sensorWeights.ir).toBe(0.20)
    })

    it("should use normal weights during daylight clear", () => {
      const input: SensorInput = {
        slotId: "slot-106",
        visionConfidence: 0.80,
        visionState: 1,
        ultrasonicDistanceCm: 40,
        irBeamBroken: true,
        environmentCondition: "daylight_clear",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.sensorWeights.vision).toBe(0.70)
      expect(result.sensorWeights.ultrasonic).toBe(0.20)
      expect(result.sensorWeights.ir).toBe(0.10)
    })
  })

  describe("Vision Occlusion Override", () => {
    it("should override vision when confidence < 0.30 and hardware sensors agree", () => {
      const input: SensorInput = {
        slotId: "slot-107",
        visionConfidence: 0.25, // Low confidence
        visionState: 0, // Vision says vacant
        ultrasonicDistanceCm: 30, // Ultrasonic says occupied
        irBeamBroken: true, // IR says occupied
        environmentCondition: "daylight_clear",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.fusedOccupancyState).toBe(1) // Should be occupied (hardware override)
      expect(result.overrideReason).toBe("Vision occlusion - hardware sensor override")
      expect(result.sensorWeights.vision).toBe(0.10) // Minimal vision weight
      expect(result.sensorWeights.ultrasonic).toBe(0.60) // High ultrasonic weight
    })

    it("should not override vision when hardware sensors disagree", () => {
      const input: SensorInput = {
        slotId: "slot-108",
        visionConfidence: 0.25, // Low confidence
        visionState: 0,
        ultrasonicDistanceCm: 30, // Ultrasonic says occupied
        irBeamBroken: false, // IR says vacant (disagreement)
        environmentCondition: "daylight_clear",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.overrideReason).toBeUndefined()
      expect(result.sensorWeights.vision).toBeGreaterThan(0.10)
    })

    it("should not override vision when confidence >= 0.30", () => {
      const input: SensorInput = {
        slotId: "slot-109",
        visionConfidence: 0.35, // Above threshold
        visionState: 0,
        ultrasonicDistanceCm: 30,
        irBeamBroken: true,
        environmentCondition: "daylight_clear",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.overrideReason).toBeUndefined()
    })
  })

  describe("Hardware Sensor Override Prevention", () => {
    it("should prevent false positives from camera occlusion", () => {
      // Scenario: Camera sees something but it's occlusion/glare
      // Hardware sensors confirm slot is actually vacant
      const input: SensorInput = {
        slotId: "slot-110",
        visionConfidence: 0.20, // Very low confidence (occlusion)
        visionState: 1, // Vision incorrectly says occupied
        ultrasonicDistanceCm: 200, // Ultrasonic says vacant
        irBeamBroken: false, // IR says vacant
        environmentCondition: "monsoon_glare",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.fusedOccupancyState).toBe(0) // Should be vacant (hardware override)
      expect(result.overrideReason).toBe("Vision occlusion - hardware sensor override")
    })

    it("should use hardware sensors when vision is unreliable", () => {
      const input: SensorInput = {
        slotId: "slot-111",
        visionConfidence: 0.15,
        visionState: 1,
        ultrasonicDistanceCm: 45,
        irBeamBroken: true,
        environmentCondition: "monsoon_glare",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.fusedOccupancyState).toBe(1)
      expect(result.overrideReason).toBe("Vision occlusion - hardware sensor override")
      expect(result.fusedConfidence).toBeGreaterThan(0.7) // High confidence from hardware
    })
  })

  describe("Batch Processing", () => {
    it("should process multiple sensor inputs efficiently", () => {
      const inputs: SensorInput[] = Array.from({ length: 10 }, (_, i) => ({
        slotId: `slot-${i}`,
        visionConfidence: 0.8,
        visionState: i % 2,
        ultrasonicDistanceCm: i % 2 === 0 ? 200 : 40,
        irBeamBroken: i % 2 === 1,
        environmentCondition: "daylight_clear" as EnvironmentCondition,
        timestamp: new Date(),
      }))

      const results = batchProcessSensorFusion(inputs)

      expect(results).toHaveLength(10)
      results.forEach((result, i) => {
        expect(result.slotId).toBe(`slot-${i}`)
        expect(result.fusedOccupancyState).toBeDefined()
        expect(result.fusedConfidence).toBeGreaterThan(0)
      })
    })
  })

  describe("100 Simulated Sensor Permutations", () => {
    it("should accurately calculate combined state across 100 permutations", () => {
      const inputs: SensorInput[] = []

      // Generate 100 permutations with varying conditions
      for (let i = 0; i < 100; i++) {
        const environmentConditions: EnvironmentCondition[] = [
          "daylight_clear",
          "night_low_light",
          "monsoon_glare",
          "unknown",
        ]

        inputs.push({
          slotId: `slot-${i}`,
          visionConfidence: Math.random(),
          visionState: Math.random() > 0.5 ? 1 : 0,
          ultrasonicDistanceCm: 20 + Math.random() * 200,
          irBeamBroken: Math.random() > 0.5,
          environmentCondition: environmentConditions[i % 4],
          timestamp: new Date(),
        })
      }

      const results = batchProcessSensorFusion(inputs)

      expect(results).toHaveLength(100)

      // Verify all results are valid
      results.forEach(result => {
        expect(result.fusedOccupancyState).toBeGreaterThanOrEqual(0)
        expect(result.fusedOccupancyState).toBeLessThanOrEqual(1)
        expect(result.fusedConfidence).toBeGreaterThanOrEqual(0)
        expect(result.fusedConfidence).toBeLessThanOrEqual(1)
        expect(result.sensorWeights.vision + result.sensorWeights.ultrasonic + result.sensorWeights.ir).toBeCloseTo(1.0, 1)
      })

      // Count state distribution
      const occupiedCount = results.filter(r => r.fusedOccupancyState === 1).length
      const vacantCount = results.filter(r => r.fusedOccupancyState === 0).length

      expect(occupiedCount + vacantCount).toBe(100)
    })
  })

  describe("Configuration Management", () => {
    it("should allow configuration updates", () => {
      const initialConfig = getFusionConfig()

      updateFusionConfig({
        baseVisionWeight: 0.60,
        baseUltrasonicWeight: 0.30,
      })

      const updatedConfig = getFusionConfig()

      expect(updatedConfig.baseVisionWeight).toBe(0.60)
      expect(updatedConfig.baseUltrasonicWeight).toBe(0.30)
      expect(updatedConfig.baseIRWeight).toBe(initialConfig.baseIRWeight)

      // Restore original config
      updateFusionConfig(initialConfig)
    })

    it("should apply updated configuration to fusion results", () => {
      const originalConfig = getFusionConfig()

      updateFusionConfig({
        baseVisionWeight: 0.50,
        baseUltrasonicWeight: 0.40,
        baseIRWeight: 0.10,
      })

      const input: SensorInput = {
        slotId: "slot-112",
        visionConfidence: 0.80,
        visionState: 1,
        ultrasonicDistanceCm: 40,
        irBeamBroken: true,
        environmentCondition: "daylight_clear",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.sensorWeights.vision).toBe(0.50)
      expect(result.sensorWeights.ultrasonic).toBe(0.40)
      expect(result.sensorWeights.ir).toBe(0.10)

      // Restore original config
      updateFusionConfig(originalConfig)
    })
  })

  describe("Edge Cases", () => {
    it("should handle ultrasonic distance at occupancy threshold", () => {
      const config = getFusionConfig()
      const input: SensorInput = {
        slotId: "slot-113",
        visionConfidence: 0.50,
        visionState: 0,
        ultrasonicDistanceCm: config.ultrasonicOccupiedThreshold, // Exactly at threshold
        irBeamBroken: false,
        environmentCondition: "daylight_clear",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.fusedOccupancyState).toBeDefined()
      expect(result.individualConfidences.ultrasonic).toBeGreaterThan(0.8)
    })

    it("should handle ultrasonic distance at vacancy threshold", () => {
      const config = getFusionConfig()
      const input: SensorInput = {
        slotId: "slot-114",
        visionConfidence: 0.50,
        visionState: 1,
        ultrasonicDistanceCm: config.ultrasonicVacantThreshold, // Exactly at threshold
        irBeamBroken: true,
        environmentCondition: "daylight_clear",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      expect(result.fusedOccupancyState).toBeDefined()
      expect(result.individualConfidences.ultrasonic).toBeGreaterThan(0.8)
    })

    it("should handle unknown environment condition", () => {
      const input: SensorInput = {
        slotId: "slot-115",
        visionConfidence: 0.70,
        visionState: 1,
        ultrasonicDistanceCm: 40,
        irBeamBroken: true,
        environmentCondition: "unknown",
        timestamp: new Date(),
      }

      const result = processSensorFusion(input)

      // Unknown should use normal weights (not degraded)
      expect(result.sensorWeights.vision).toBe(0.70)
      expect(result.sensorWeights.ultrasonic).toBe(0.20)
      expect(result.sensorWeights.ir).toBe(0.10)
    })
  })
})