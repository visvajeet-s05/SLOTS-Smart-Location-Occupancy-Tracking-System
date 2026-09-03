/**
 * Demographic & Cohort Fairness Auditor
 * Audits price variance across temporal/user cohorts for compliance
 */

import type { PricingDecomposition } from "./explainability"

// Re-export for use in tests
export type { PricingDecomposition }

export type CohortType = 
  | "commuter_morning"
  | "off_peak_day"
  | "evening_recreational"
  | "night_essential"

export interface CohortPricingData {
  cohort: CohortType
  prices: number[]
  timestamps: Date[]
  averagePrice: number
  medianPrice: number
  priceRange: { min: number; max: number }
  standardDeviation: number
}

export interface FairnessMetrics {
  disparateImpactRatio: number // DIR across cohorts
  giniCoefficient: number // Gini coefficient of price variation
  surgeCapCompliance: boolean // Whether surge cap was ever breached
  cohortAnalysis: Map<CohortType, CohortPricingData>
  timestamp: Date
}

export interface AuditReport {
  metrics: FairnessMetrics
  recommendations: string[]
  complianceStatus: "COMPLIANT" | "WARNING" | "NON_COMPLIANT"
  auditPeriod: { start: Date; end: Date }
  totalTransactions: number
}

/**
 * Demographic & Cohort Fairness Auditor
 */
class FairnessAuditor {
  private readonly MAX_SURGE_MULTIPLIER = 3.0
  private readonly COHORT_TIME_RANGES = {
    commuter_morning: { start: 7, end: 10 }, // 7 AM - 10 AM
    off_peak_day: { start: 10, end: 17 }, // 10 AM - 5 PM
    evening_recreational: { start: 17, end: 22 }, // 5 PM - 10 PM
    night_essential: { start: 22, end: 7 } // 10 PM - 7 AM
  }

  private pricingHistory: Array<{
    decomposition: PricingDecomposition
    timestamp: Date
    cohort: CohortType
  }> = []

  /**
   * Determine cohort from timestamp
   */
  private determineCohort(timestamp: Date): CohortType {
    const hour = timestamp.getHours()

    if (hour >= 7 && hour < 10) {
      return "commuter_morning" as CohortType
    } else if (hour >= 10 && hour < 17) {
      return "off_peak_day" as CohortType
    } else if (hour >= 17 && hour < 22) {
      return "evening_recreational" as CohortType
    } else {
      return "night_essential" as CohortType
    }
  }

  /**
   * Record pricing event for auditing
   */
  recordPricingEvent(decomposition: PricingDecomposition, timestamp: Date = new Date()): void {
    const cohort = this.determineCohort(timestamp)
    
    this.pricingHistory.push({
      decomposition,
      timestamp,
      cohort
    })
  }

  /**
   * Calculate cohort pricing statistics
   */
  private calculateCohortStatistics(cohort: CohortType): CohortPricingData {
    const cohortEvents = this.pricingHistory.filter(e => e.cohort === cohort)
    const prices = cohortEvents.map(e => e.decomposition.finalPrice)
    const timestamps = cohortEvents.map(e => e.timestamp)

    if (prices.length === 0) {
      return {
        cohort,
        prices: [],
        timestamps: [],
        averagePrice: 0,
        medianPrice: 0,
        priceRange: { min: 0, max: 0 },
        standardDeviation: 0
      }
    }

    const averagePrice = this.calculateMean(prices)
    const medianPrice = this.calculateMedian(prices)
    const priceRange = {
      min: Math.min(...prices),
      max: Math.max(...prices)
    }
    const standardDeviation = this.calculateStandardDeviation(prices)

    return {
      cohort,
      prices,
      timestamps,
      averagePrice,
      medianPrice,
      priceRange,
      standardDeviation
    }
  }

  /**
   * Calculate Disparate Impact Ratio (DIR)
   * DIR = (most disadvantaged avg price) / (most advantaged avg price)
   */
  private calculateDisparateImpactRatio(cohortAnalysis: Map<CohortType, CohortPricingData>): number {
    const avgPrices = Array.from(cohortAnalysis.values())
      .map(c => c.averagePrice)
      .filter(p => p > 0)

    if (avgPrices.length < 2) {
      return 1.0 // No disparity to measure
    }

    const minPrice = Math.min(...avgPrices)
    const maxPrice = Math.max(...avgPrices)

    if (maxPrice === 0) {
      return 1.0
    }

    return minPrice / maxPrice
  }

  /**
   * Calculate Gini Coefficient
   * Measures inequality in price distribution (0 = perfect equality, 1 = maximum inequality)
   */
  private calculateGiniCoefficient(prices: number[]): number {
    if (prices.length === 0) {
      return 0
    }

    const sortedPrices = [...prices].sort((a, b) => a - b)
    const n = sortedPrices.length
    const mean = this.calculateMean(sortedPrices)

    if (mean === 0) {
      return 0
    }

    let sumNumerator = 0
    for (let i = 0; i < n; i++) {
      sumNumerator += (2 * (i + 1) - n - 1) * sortedPrices[i]
    }

    const gini = sumNumerator / (n * n * mean)
    return Math.max(0, Math.min(1, gini)) // Clamp to [0, 1]
  }

  /**
   * Calculate mean
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((sum, val) => sum + val, 0) / values.length
  }

  /**
   * Calculate median
   */
  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0
    
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2
    } else {
      return sorted[mid]
    }
  }

  /**
   * Calculate standard deviation
   */
  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0
    
    const mean = this.calculateMean(values)
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2))
    const variance = this.calculateMean(squaredDiffs)
    
    return Math.sqrt(variance)
  }

  /**
   * Check surge cap compliance across all transactions
   */
  private checkSurgeCapCompliance(): boolean {
    for (const event of this.pricingHistory) {
      const totalMultiplier = 
        event.decomposition.occupancyMultiplier * 
        event.decomposition.demandMultiplier * 
        event.decomposition.eventMultiplier
      
      if (totalMultiplier > this.MAX_SURGE_MULTIPLIER) {
        return false
      }
    }
    return true
  }

  /**
   * Run comprehensive fairness audit
   */
  runAudit(auditPeriod?: { start: Date; end: Date }): AuditReport {
    // Filter by audit period if provided
    let filteredHistory = this.pricingHistory
    if (auditPeriod) {
      filteredHistory = this.pricingHistory.filter(
        e => e.timestamp >= auditPeriod.start && e.timestamp <= auditPeriod.end
      )
    }

    if (filteredHistory.length === 0) {
      return {
        metrics: {
          disparateImpactRatio: 1.0,
          giniCoefficient: 0,
          surgeCapCompliance: true,
          cohortAnalysis: new Map(),
          timestamp: new Date()
        },
        recommendations: ["No pricing data available for audit"],
        complianceStatus: "WARNING",
        auditPeriod: auditPeriod || { start: new Date(), end: new Date() },
        totalTransactions: 0
      }
    }

    // Calculate cohort statistics
    const cohortAnalysis = new Map<CohortType, CohortPricingData>()
    for (const cohort of Object.keys(this.COHORT_TIME_RANGES) as CohortType[]) {
      cohortAnalysis.set(cohort, this.calculateCohortStatistics(cohort))
    }

    // Calculate fairness metrics
    const allPrices = filteredHistory.map(e => e.decomposition.finalPrice)
    const disparateImpactRatio = this.calculateDisparateImpactRatio(cohortAnalysis)
    const giniCoefficient = this.calculateGiniCoefficient(allPrices)
    const surgeCapCompliance = this.checkSurgeCapCompliance()

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      disparateImpactRatio,
      giniCoefficient,
      surgeCapCompliance,
      cohortAnalysis
    )

    // Determine compliance status
    const complianceStatus = this.determineComplianceStatus(
      disparateImpactRatio,
      giniCoefficient,
      surgeCapCompliance
    )

    return {
      metrics: {
        disparateImpactRatio,
        giniCoefficient,
        surgeCapCompliance,
        cohortAnalysis,
        timestamp: new Date()
      },
      recommendations,
      complianceStatus,
      auditPeriod: auditPeriod || {
        start: filteredHistory[0].timestamp,
        end: filteredHistory[filteredHistory.length - 1].timestamp
      },
      totalTransactions: filteredHistory.length
    }
  }

  /**
   * Generate audit recommendations
   */
  private generateRecommendations(
    dir: number,
    gini: number,
    surgeCompliance: boolean,
    cohortAnalysis: Map<CohortType, CohortPricingData>
  ): string[] {
    const recommendations: string[] = []

    // DIR recommendations
    if (dir < 0.8) {
      recommendations.push(
        "DISPARATE IMPACT WARNING: Pricing disparity exceeds acceptable threshold. " +
        "Review pricing algorithm for cohort-based bias."
      )
    } else if (dir < 0.9) {
      recommendations.push(
        "DISPARATE IMPACT NOTICE: Moderate pricing disparity detected. " +
        "Consider implementing fairness constraints."
      )
    }

    // Gini coefficient recommendations
    if (gini > 0.4) {
      recommendations.push(
        "HIGH INEQUALITY: Price distribution shows significant inequality. " +
        "Consider capping maximum variance across cohorts."
      )
    } else if (gini > 0.3) {
      recommendations.push(
        "MODERATE INEQUALITY: Price variation is elevated. " +
        "Monitor for potential fairness issues."
      )
    }

    // Surge cap recommendations
    if (!surgeCompliance) {
      recommendations.push(
        "SURGE CAP VIOLATION: Maximum surge multiplier exceeded. " +
        "Immediate action required to comply with ULB regulations."
      )
    }

    // Cohort-specific recommendations
    for (const [cohort, data] of cohortAnalysis.entries()) {
      if (data.prices.length > 0) {
        const priceVariance = data.priceRange.max - data.priceRange.min
        if (priceVariance > data.averagePrice * 0.5) {
          recommendations.push(
            `HIGH VARIANCE IN ${cohort}: Price range exceeds 50% of average. ` +
            "Review dynamic pricing parameters for this cohort."
          )
        }
      }
    }

    if (recommendations.length === 0) {
      recommendations.push("No fairness issues detected. Continue monitoring.")
    }

    return recommendations
  }

  /**
   * Determine compliance status
   */
  private determineComplianceStatus(
    dir: number,
    gini: number,
    surgeCompliance: boolean
  ): "COMPLIANT" | "WARNING" | "NON_COMPLIANT" {
    if (!surgeCompliance) {
      return "NON_COMPLIANT"
    }

    if (dir < 0.8 || gini > 0.4) {
      return "NON_COMPLIANT"
    }

    if (dir < 0.9 || gini > 0.3) {
      return "WARNING"
    }

    return "COMPLIANT"
  }

  /**
   * Simulate 24-hour traffic data for testing
   */
  simulate24HourTraffic(baseRate: number = 50): void {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    for (let hour = 0; hour < 24; hour++) {
      const timestamp = new Date(startOfDay.getTime() + hour * 60 * 60 * 1000)
      const cohort = this.determineCohort(timestamp)

      // Simulate varying prices based on time of day
      let simulatedPrice = baseRate
      
      if (cohort === "commuter_morning") {
        simulatedPrice = baseRate * (1.2 + Math.random() * 0.3) // 1.2x - 1.5x
      } else if (cohort === "off_peak_day") {
        simulatedPrice = baseRate * (0.9 + Math.random() * 0.2) // 0.9x - 1.1x
      } else if (cohort === "evening_recreational") {
        simulatedPrice = baseRate * (1.3 + Math.random() * 0.4) // 1.3x - 1.7x
      } else {
        simulatedPrice = baseRate * (0.7 + Math.random() * 0.2) // 0.7x - 0.9x
      }

      // Create mock decomposition
      const mockDecomposition: PricingDecomposition = {
        baseRate,
        occupancyMultiplier: 1.0 + Math.random() * 0.5,
        demandMultiplier: 1.0 + Math.random() * 0.5,
        eventMultiplier: 1.0,
        finalPrice: simulatedPrice,
        factorBreakdown: [],
        timestamp,
        lotId: "simulated-lot"
      }

      this.recordPricingEvent(mockDecomposition, timestamp)
    }
  }

  /**
   * Clear pricing history
   */
  clearHistory(): void {
    this.pricingHistory = []
  }

  /**
   * Get pricing history count
   */
  getHistoryCount(): number {
    return this.pricingHistory.length
  }
}

// Singleton instance
const fairnessAuditor = new FairnessAuditor()

/**
 * Record pricing event for auditing
 */
export function recordPricingEvent(decomposition: PricingDecomposition, timestamp?: Date): void {
  fairnessAuditor.recordPricingEvent(decomposition, timestamp)
}

/**
 * Run fairness audit
 */
export function runFairnessAudit(auditPeriod?: { start: Date; end: Date }): AuditReport {
  return fairnessAuditor.runAudit(auditPeriod)
}

/**
 * Simulate 24-hour traffic data
 */
export function simulate24HourTraffic(baseRate?: number): void {
  fairnessAuditor.simulate24HourTraffic(baseRate)
}

/**
 * Clear audit history
 */
export function clearAuditHistory(): void {
  fairnessAuditor.clearHistory()
}

/**
 * Get audit history count
 */
export function getAuditHistoryCount(): number {
  return fairnessAuditor.getHistoryCount()
}

export { fairnessAuditor }