/**
 * Pricing Decomposition Engine
 * Decomposes RL pricing actions into transparent multiplicative factors
 * for explainability and ULB compliance auditing
 */

export interface PricingDecomposition {
  baseRate: number // Base hourly fee in currency units
  occupancyMultiplier: number // Derived from real-time slot saturation
  demandMultiplier: number // Derived from Random Forest/RL demand signal
  eventMultiplier: number // Local high-density event scalar
  finalPrice: number // Calculated product
  factorBreakdown: FactorExplanation[] // Human-readable summary
  timestamp: Date
  lotId: string
}

export interface FactorExplanation {
  factor: string
  value: number
  contribution: number // Absolute contribution to final price
  percentage: number // Percentage of total multiplier
  description: string
}

export interface PricingContext {
  lotId: string
  baseRate: number
  currentOccupancy: number // 0.0 to 1.0
  demandScore: number // 0.0 to 1.0 from ML model
  hasEvent: boolean
  eventIntensity?: number // 0.0 to 1.0
  timeOfDay: 'morning' | 'day' | 'evening' | 'night'
  bookingDuration: number // hours
}

export interface RLActionOutput {
  action: number // Continuous action space output (0.0 to 1.0)
  confidence: number // Model confidence
  hiddenState?: number[] // Optional hidden state for additional context
}

/**
 * Pricing Decomposition Engine
 * Maps RL model outputs to transparent multiplicative factors
 */
class PricingDecompositionEngine {
  private readonly MAX_SURGE_MULTIPLIER = 3.0 // ULB compliance cap
  private readonly OCCUPANCY_THRESHOLD_HIGH = 0.85
  private readonly OCCUPANCY_THRESHOLD_LOW = 0.3
  private readonly DEMAND_THRESHOLD_HIGH = 0.8
  private readonly DEMAND_THRESHOLD_LOW = 0.2

  /**
   * Decompose pricing from RL action output
   */
  decomposeFromRLAction(
    context: PricingContext,
    rlAction: RLActionOutput
  ): PricingDecomposition {
    // Map continuous action space to multiplicative factors
    const occupancyMultiplier = this.calculateOccupancyMultiplier(context.currentOccupancy)
    const demandMultiplier = this.calculateDemandMultiplier(context.demandScore, rlAction.action)
    const eventMultiplier = this.calculateEventMultiplier(context.hasEvent, context.eventIntensity)

    // Calculate final price
    const totalMultiplier = occupancyMultiplier * demandMultiplier * eventMultiplier
    const cappedMultiplier = Math.min(totalMultiplier, this.MAX_SURGE_MULTIPLIER)
    const finalPrice = context.baseRate * cappedMultiplier

    // Generate factor breakdown
    const factorBreakdown = this.generateFactorBreakdown(
      context.baseRate,
      occupancyMultiplier,
      demandMultiplier,
      eventMultiplier,
      cappedMultiplier,
      finalPrice
    )

    return {
      baseRate: context.baseRate,
      occupancyMultiplier,
      demandMultiplier,
      eventMultiplier,
      finalPrice,
      factorBreakdown,
      timestamp: new Date(),
      lotId: context.lotId
    }
  }

  /**
   * Decompose pricing from direct factors (for manual/override pricing)
   */
  decomposeFromFactors(
    context: PricingContext,
    occupancyMultiplier: number,
    demandMultiplier: number,
    eventMultiplier: number
  ): PricingDecomposition {
    // Apply surge cap
    const totalMultiplier = occupancyMultiplier * demandMultiplier * eventMultiplier
    const cappedMultiplier = Math.min(totalMultiplier, this.MAX_SURGE_MULTIPLIER)
    const finalPrice = context.baseRate * cappedMultiplier

    const factorBreakdown = this.generateFactorBreakdown(
      context.baseRate,
      occupancyMultiplier,
      demandMultiplier,
      eventMultiplier,
      cappedMultiplier,
      finalPrice
    )

    return {
      baseRate: context.baseRate,
      occupancyMultiplier,
      demandMultiplier,
      eventMultiplier,
      finalPrice,
      factorBreakdown,
      timestamp: new Date(),
      lotId: context.lotId
    }
  }

  /**
   * Calculate occupancy multiplier based on current slot saturation
   */
  private calculateOccupancyMultiplier(occupancy: number): number {
    if (occupancy >= this.OCCUPANCY_THRESHOLD_HIGH) {
      // Linear scaling from 1.0 to 2.0 for high occupancy
      const excess = occupancy - this.OCCUPANCY_THRESHOLD_HIGH
      const maxExcess = 1.0 - this.OCCUPANCY_THRESHOLD_HIGH
      return 1.0 + (excess / maxExcess) * 1.0
    } else if (occupancy <= this.OCCUPANCY_THRESHOLD_LOW) {
      // Discount for low occupancy (0.7 to 1.0)
      return 0.7 + (occupancy / this.OCCUPANCY_THRESHOLD_LOW) * 0.3
    } else {
      // Standard range (1.0 to 1.2)
      const range = this.OCCUPANCY_THRESHOLD_HIGH - this.OCCUPANCY_THRESHOLD_LOW
      const position = (occupancy - this.OCCUPANCY_THRESHOLD_LOW) / range
      return 1.0 + position * 0.2
    }
  }

  /**
   * Calculate demand multiplier from ML demand score and RL action
   */
  private calculateDemandMultiplier(demandScore: number, rlAction: number): number {
    // Combine ML demand prediction with RL action adjustment
    const mlMultiplier = this.scoreToMultiplier(demandScore, this.DEMAND_THRESHOLD_LOW, this.DEMAND_THRESHOLD_HIGH)
    
    // RL action provides adjustment (0.8 to 1.2 range)
    const rlAdjustment = 0.8 + rlAction * 0.4
    
    // Combine with weighted average
    return (mlMultiplier * 0.7) + (rlAdjustment * 0.3)
  }

  /**
   * Calculate event multiplier
   */
  private calculateEventMultiplier(hasEvent: boolean, intensity?: number): number {
    if (!hasEvent) {
      return 1.0
    }

    const eventIntensity = intensity || 0.5
    // Scale from 1.0 to 1.5 based on event intensity
    return 1.0 + eventIntensity * 0.5
  }

  /**
   * Convert score to multiplier
   */
  private scoreToMultiplier(
    score: number,
    lowThreshold: number,
    highThreshold: number
  ): number {
    if (score >= highThreshold) {
      // High demand: 1.2 to 1.5
      const excess = score - highThreshold
      const maxExcess = 1.0 - highThreshold
      return 1.2 + (excess / maxExcess) * 0.3
    } else if (score <= lowThreshold) {
      // Low demand: 0.8 to 1.0
      return 0.8 + (score / lowThreshold) * 0.2
    } else {
      // Standard: 1.0 to 1.2
      const range = highThreshold - lowThreshold
      const position = (score - lowThreshold) / range
      return 1.0 + position * 0.2
    }
  }

  /**
   * Generate human-readable factor breakdown
   */
  private generateFactorBreakdown(
    baseRate: number,
    occupancyMultiplier: number,
    demandMultiplier: number,
    eventMultiplier: number,
    totalMultiplier: number,
    finalPrice: number
  ): FactorExplanation[] {
    const breakdown: FactorExplanation[] = []

    // Base rate
    breakdown.push({
      factor: "Base Rate",
      value: baseRate,
      contribution: baseRate,
      percentage: (baseRate / finalPrice) * 100,
      description: "Standard hourly rate for this parking lot"
    })

    // Occupancy multiplier
    const occupancyContribution = baseRate * (occupancyMultiplier - 1)
    breakdown.push({
      factor: "Occupancy Multiplier",
      value: occupancyMultiplier,
      contribution: occupancyContribution,
      percentage: (occupancyContribution / (finalPrice - baseRate)) * 100,
      description: this.getOccupancyDescription(occupancyMultiplier)
    })

    // Demand multiplier
    const demandContribution = baseRate * (demandMultiplier - 1)
    breakdown.push({
      factor: "Demand Multiplier",
      value: demandMultiplier,
      contribution: demandContribution,
      percentage: (demandContribution / (finalPrice - baseRate)) * 100,
      description: this.getDemandDescription(demandMultiplier)
    })

    // Event multiplier
    if (eventMultiplier > 1.0) {
      const eventContribution = baseRate * (eventMultiplier - 1)
      breakdown.push({
        factor: "Event Multiplier",
        value: eventMultiplier,
        contribution: eventContribution,
        percentage: (eventContribution / (finalPrice - baseRate)) * 100,
        description: this.getEventDescription(eventMultiplier)
      })
    }

    // Surge cap warning
    if (totalMultiplier >= this.MAX_SURGE_MULTIPLIER) {
      breakdown.push({
        factor: "Surge Cap Applied",
        value: this.MAX_SURGE_MULTIPLIER,
        contribution: 0,
        percentage: 0,
        description: "Maximum surge multiplier (3.0x) applied per ULB regulations"
      })
    }

    return breakdown
  }

  /**
   * Get human-readable occupancy description
   */
  private getOccupancyDescription(multiplier: number): string {
    if (multiplier >= 1.8) {
      return "Very high occupancy (85%+) - significant surge applied"
    } else if (multiplier >= 1.2) {
      return "High occupancy - moderate surge applied"
    } else if (multiplier >= 1.0) {
      return "Normal occupancy - standard pricing"
    } else {
      return "Low occupancy (30% or less) - discount applied"
    }
  }

  /**
   * Get human-readable demand description
   */
  private getDemandDescription(multiplier: number): string {
    if (multiplier >= 1.3) {
      return "Very high demand - demand surge applied"
    } else if (multiplier >= 1.1) {
      return "High demand - slight premium applied"
    } else if (multiplier >= 0.9) {
      return "Normal demand - standard pricing"
    } else {
      return "Low demand - discount applied"
    }
  }

  /**
   * Get human-readable event description
   */
  private getEventDescription(multiplier: number): string {
    if (multiplier >= 1.4) {
      return "Major local event - significant premium applied"
    } else if (multiplier >= 1.2) {
      return "Local event - moderate premium applied"
    } else {
      return "Minor event - slight premium applied"
    }
  }

  /**
   * Validate pricing decomposition reconstruction
   * Ensures finalPrice = baseRate * totalMultiplier (within floating-point tolerance)
   */
  validateDecomposition(decomposition: PricingDecomposition): {
    valid: boolean
    error: number
    tolerance: number
  } {
    const totalMultiplier = 
      decomposition.occupancyMultiplier * 
      decomposition.demandMultiplier * 
      decomposition.eventMultiplier
    
    const cappedMultiplier = Math.min(totalMultiplier, this.MAX_SURGE_MULTIPLIER)
    const reconstructedPrice = decomposition.baseRate * cappedMultiplier
    
    const tolerance = 0.01 // 1% tolerance for floating-point errors
    const error = Math.abs(reconstructedPrice - decomposition.finalPrice)
    const relativeError = error / decomposition.finalPrice
    
    return {
      valid: relativeError <= tolerance,
      error,
      tolerance: decomposition.finalPrice * tolerance
    }
  }

  /**
   * Check surge cap compliance
   */
  checkSurgeCapCompliance(decomposition: PricingDecomposition): {
    compliant: boolean
    totalMultiplier: number
    cap: number
    exceededBy: number
  } {
    const totalMultiplier = 
      decomposition.occupancyMultiplier * 
      decomposition.demandMultiplier * 
      decomposition.eventMultiplier
    
    const exceededBy = Math.max(0, totalMultiplier - this.MAX_SURGE_MULTIPLIER)
    
    return {
      compliant: totalMultiplier <= this.MAX_SURGE_MULTIPLIER,
      totalMultiplier,
      cap: this.MAX_SURGE_MULTIPLIER,
      exceededBy
    }
  }
}

// Singleton instance
const pricingDecompositionEngine = new PricingDecompositionEngine()

/**
 * Decompose pricing from RL action
 */
export function decomposePricingFromRL(
  context: PricingContext,
  rlAction: RLActionOutput
): PricingDecomposition {
  return pricingDecompositionEngine.decomposeFromRLAction(context, rlAction)
}

/**
 * Decompose pricing from direct factors
 */
export function decomposePricingFromFactors(
  context: PricingContext,
  occupancyMultiplier: number,
  demandMultiplier: number,
  eventMultiplier: number
): PricingDecomposition {
  return pricingDecompositionEngine.decomposeFromFactors(
    context,
    occupancyMultiplier,
    demandMultiplier,
    eventMultiplier
  )
}

/**
 * Validate pricing decomposition
 */
export function validatePricingDecomposition(decomposition: PricingDecomposition) {
  return pricingDecompositionEngine.validateDecomposition(decomposition)
}

/**
 * Check surge cap compliance
 */
export function checkSurgeCapCompliance(decomposition: PricingDecomposition) {
  return pricingDecompositionEngine.checkSurgeCapCompliance(decomposition)
}

export { pricingDecompositionEngine }