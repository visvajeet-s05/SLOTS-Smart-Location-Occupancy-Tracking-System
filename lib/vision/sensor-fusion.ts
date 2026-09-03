/**
 * Sensor Fusion Pipeline
 * Combines optical vision, ultrasonic, and IR sensor data for robust occupancy detection
 * Uses Bayesian/Dempster-Shafer confidence fusion with dynamic environmental weighting
 */

export type EnvironmentCondition = "daylight_clear" | "night_low_light" | "monsoon_glare" | "unknown"

export interface SensorInput {
  slotId: string
  visionConfidence: number // 0.0 to 1.0 from YOLOv8
  visionState: number // 0 = AVAILABLE, 1 = OCCUPIED
  ultrasonicDistanceCm: number // Distance in cm
  irBeamBroken: boolean // Binary line-of-sight trip sensor
  environmentCondition: EnvironmentCondition
  timestamp: Date
}

export interface FusionResult {
  slotId: string
  fusedOccupancyState: number // 0 = AVAILABLE, 1 = OCCUPIED
  fusedConfidence: number // Combined confidence score
  sensorWeights: {
    vision: number
    ultrasonic: number
    ir: number
  }
  individualConfidences: {
    vision: number
    ultrasonic: number
    ir: number
  }
  overrideReason?: string // If hardware sensor overrode vision
  timestamp: Date
}

export interface FusionConfig {
  baseVisionWeight: number
  baseUltrasonicWeight: number
  baseIRWeight: number
  degradedVisionWeight: number // Used during monsoon/low-light
  degradedUltrasonicWeight: number
  degradedIRWeight: number
  ultrasonicOccupiedThreshold: number // cm - distance below which slot is considered occupied
  ultrasonicVacantThreshold: number // cm - distance above which slot is considered vacant
}

/**
 * Sensor Fusion Engine
 * Bayesian/Dempster-Shafer confidence fusion for robust occupancy detection
 */
class SensorFusionEngine {
  private config: FusionConfig

  constructor(config?: Partial<FusionConfig>) {
    this.config = {
      baseVisionWeight: 0.70,
      baseUltrasonicWeight: 0.20,
      baseIRWeight: 0.10,
      degradedVisionWeight: 0.30,
      degradedUltrasonicWeight: 0.50,
      degradedIRWeight: 0.20,
      ultrasonicOccupiedThreshold: 50, // cm
      ultrasonicVacantThreshold: 150, // cm
      ...config,
    }
  }

  /**
   * Calculate ultrasonic occupancy probability from distance
   */
  private calculateUltrasonicConfidence(distanceCm: number): {
    state: number
    confidence: number
  } {
    // Map distance to occupancy probability
    // Closer = higher probability of being occupied
    if (distanceCm < this.config.ultrasonicOccupiedThreshold) {
      // Very close - definitely occupied
      return { state: 1, confidence: 0.95 }
    } else if (distanceCm < this.config.ultrasonicVacantThreshold) {
      // Intermediate range - linear interpolation
      const range = this.config.ultrasonicVacantThreshold - this.config.ultrasonicOccupiedThreshold
      const position = (distanceCm - this.config.ultrasonicOccupiedThreshold) / range
      const occupiedProb = 1.0 - position
      return { state: occupiedProb > 0.5 ? 1 : 0, confidence: Math.abs(occupiedProb - 0.5) * 2 }
    } else {
      // Far away - definitely vacant
      return { state: 0, confidence: 0.95 }
    }
  }

  /**
   * Calculate IR beam confidence
   */
  private calculateIRConfidence(irBeamBroken: boolean): {
    state: number
    confidence: number
  } {
    // IR beam broken = something is in the way = occupied
    if (irBeamBroken) {
      return { state: 1, confidence: 0.90 }
    } else {
      return { state: 0, confidence: 0.90 }
    }
  }

  /**
   * Determine if degraded conditions apply
   */
  private isDegradedCondition(environment: EnvironmentCondition): boolean {
    return environment === "monsoon_glare" || environment === "night_low_light"
  }

  /**
   * Get dynamic sensor weights based on environment
   */
  private getSensorWeights(environment: EnvironmentCondition): {
    vision: number
    ultrasonic: number
    ir: number
  } {
    if (this.isDegradedCondition(environment)) {
      return {
        vision: this.config.degradedVisionWeight,
        ultrasonic: this.config.degradedUltrasonicWeight,
        ir: this.config.degradedIRWeight,
      }
    } else {
      return {
        vision: this.config.baseVisionWeight,
        ultrasonic: this.config.baseUltrasonicWeight,
        ir: this.config.baseIRWeight,
      }
    }
  }

  /**
   * Apply Bayesian fusion to combine sensor confidences
   */
  private bayesianFusion(
    vision: { state: number; confidence: number },
    ultrasonic: { state: number; confidence: number },
    ir: { state: number; confidence: number },
    weights: { vision: number; ultrasonic: number; ir: number }
  ): { state: number; confidence: number } {
    // Normalize weights
    const totalWeight = weights.vision + weights.ultrasonic + weights.ir
    const normVision = weights.vision / totalWeight
    const normUltrasonic = weights.ultrasonic / totalWeight
    const normIR = weights.ir / totalWeight

    // Calculate weighted occupancy probability
    const occupiedProb =
      (vision.state * vision.confidence * normVision) +
      (ultrasonic.state * ultrasonic.confidence * normUltrasonic) +
      (ir.state * ir.confidence * normIR)

    // Determine final state
    const finalState = occupiedProb > 0.5 ? 1 : 0

    // Calculate final confidence (distance from 0.5)
    const finalConfidence = Math.abs(occupiedProb - 0.5) * 2

    return { state: finalState, confidence: finalConfidence }
  }

  /**
   * Detect if vision is severely occluded and should be overridden
   */
  private detectVisionOcclusion(
    visionConfidence: number,
    ultrasonic: { state: number; confidence: number },
    ir: { state: number; confidence: number }
  ): boolean {
    // Vision is severely degraded if confidence is very low
    if (visionConfidence < 0.30) {
      // Check if hardware sensors agree on state
      if (ultrasonic.state === ir.state && ultrasonic.confidence > 0.8 && ir.confidence > 0.8) {
        return true
      }
    }
    return false
  }

  /**
   * Process sensor fusion
   */
  processSensorFusion(input: SensorInput): FusionResult {
    // Calculate individual sensor confidences
    const ultrasonicResult = this.calculateUltrasonicConfidence(input.ultrasonicDistanceCm)
    const irResult = this.calculateIRConfidence(input.irBeamBroken)

    // Get dynamic weights based on environment
    const weights = this.getSensorWeights(input.environmentCondition)

    // Detect vision occlusion
    const visionOccluded = this.detectVisionOcclusion(
      input.visionConfidence,
      ultrasonicResult,
      irResult
    )

    let finalWeights = weights
    let overrideReason: string | undefined

    if (visionOccluded) {
      // Override vision with hardware sensors
      finalWeights = {
        vision: 0.10, // Minimal weight for occluded vision
        ultrasonic: 0.60,
        ir: 0.30,
      }
      overrideReason = "Vision occlusion - hardware sensor override"
    }

    // Apply Bayesian fusion
    const visionInput = { state: input.visionState, confidence: input.visionConfidence }
    const fusionResult = this.bayesianFusion(
      visionInput,
      ultrasonicResult,
      irResult,
      finalWeights
    )

    return {
      slotId: input.slotId,
      fusedOccupancyState: fusionResult.state,
      fusedConfidence: fusionResult.confidence,
      sensorWeights: finalWeights,
      individualConfidences: {
        vision: input.visionConfidence,
        ultrasonic: ultrasonicResult.confidence,
        ir: irResult.confidence,
      },
      overrideReason,
      timestamp: input.timestamp,
    }
  }

  /**
   * Batch process multiple sensor inputs
   */
  batchProcessSensorFusion(inputs: SensorInput[]): FusionResult[] {
    return inputs.map(input => this.processSensorFusion(input))
  }

  /**
   * Get current configuration
   */
  getConfig(): FusionConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FusionConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// Singleton instance
const sensorFusionEngine = new SensorFusionEngine()

/**
 * Process sensor fusion for single input
 */
export function processSensorFusion(input: SensorInput): FusionResult {
  return sensorFusionEngine.processSensorFusion(input)
}

/**
 * Batch process sensor fusion
 */
export function batchProcessSensorFusion(inputs: SensorInput[]): FusionResult[] {
  return sensorFusionEngine.batchProcessSensorFusion(inputs)
}

/**
 * Get fusion configuration
 */
export function getFusionConfig(): FusionConfig {
  return sensorFusionEngine.getConfig()
}

/**
 * Update fusion configuration
 */
export function updateFusionConfig(config: Partial<FusionConfig>): void {
  sensorFusionEngine.updateConfig(config)
}

export { sensorFusionEngine }