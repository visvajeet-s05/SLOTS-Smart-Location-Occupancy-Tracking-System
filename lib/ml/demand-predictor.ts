/**
 * Random Forest / Regression Demand Predictor
 * Simulates a trained Random Forest model for demand prediction
 * Uses feature weightings and decision-tree logic
 */

export interface DemandPredictionInput {
  siteId: string
  hourOfDay: number // 0-23
  dayOfWeek: number // 0-6 (Sunday-Saturday)
  currentOccupancy: number // 0.0 to 1.0
  weatherFlag?: 'sunny' | 'rainy' | 'cloudy' | 'storm'
  isEventDay?: boolean
}

export interface DemandPredictionOutput {
  demandScore: number // 0.0 to 1.0
  confidence: number // 0.0 to 1.0
  keyFactors: {
    factor: string
    weight: number
    value: number
  }[]
  explanation: string
}

/**
 * Feature weights for demand prediction
 * These weights simulate a trained Random Forest model
 */
const FEATURE_WEIGHTS = {
  hourOfDay: 0.25,
  dayOfWeek: 0.15,
  currentOccupancy: 0.30,
  weather: 0.15,
  event: 0.15,
}

/**
 * Peak hour ranges (start, end, multiplier)
 */
const PEAK_HOURS = [
  { start: 8, end: 10, multiplier: 1.3 }, // Morning rush
  { start: 12, end: 14, multiplier: 1.2 }, // Lunch
  { start: 17, end: 19, multiplier: 1.4 }, // Evening rush
  { start: 20, end: 22, multiplier: 1.1 }, // Night
]

/**
 * Day of week multipliers
 */
const DAY_MULTIPLIERS = {
  0: 0.8, // Sunday
  1: 1.0, // Monday
  2: 1.1, // Tuesday
  3: 1.15, // Wednesday
  4: 1.2, // Thursday
  5: 1.3, // Friday
  6: 1.25, // Saturday
}

/**
 * Weather impact factors
 */
const WEATHER_FACTORS = {
  sunny: 1.0,
  cloudy: 1.1,
  rainy: 1.3,
  storm: 1.5,
}

/**
 * Predict demand score using simulated Random Forest logic
 */
export function predictDemandScore(
  input: DemandPredictionInput
): DemandPredictionOutput {
  const { hourOfDay, dayOfWeek, currentOccupancy, weatherFlag, isEventDay } = input

  const keyFactors: {
    factor: string
    weight: number
    value: number
  }[] = []

  // 1. Calculate hour of day factor
  let hourFactor = 1.0
  let hourWeight = 0
  for (const peak of PEAK_HOURS) {
    if (hourOfDay >= peak.start && hourOfDay < peak.end) {
      hourFactor = peak.multiplier
      hourWeight = (hourFactor - 1) * FEATURE_WEIGHTS.hourOfDay
      keyFactors.push({
        factor: 'Peak Hour',
        weight: FEATURE_WEIGHTS.hourOfDay,
        value: hourFactor,
      })
      break
    }
  }
  if (hourWeight === 0) {
    hourWeight = 0.5 * FEATURE_WEIGHTS.hourOfDay
  }

  // 2. Calculate day of week factor
  const dayMultiplier = DAY_MULTIPLIERS[dayOfWeek as keyof typeof DAY_MULTIPLIERS] || 1.0
  const dayWeight = (dayMultiplier - 1) * FEATURE_WEIGHTS.dayOfWeek
  keyFactors.push({
    factor: 'Day of Week',
    weight: FEATURE_WEIGHTS.dayOfWeek,
    value: dayMultiplier,
  })

  // 3. Calculate occupancy factor (most important)
  let occupancyFactor = 1.0
  if (currentOccupancy > 0.9) {
    occupancyFactor = 2.0 // Very high demand
  } else if (currentOccupancy > 0.7) {
    occupancyFactor = 1.5 // High demand
  } else if (currentOccupancy > 0.5) {
    occupancyFactor = 1.2 // Moderate demand
  } else if (currentOccupancy > 0.3) {
    occupancyFactor = 1.0 // Normal demand
  } else {
    occupancyFactor = 0.8 // Low demand
  }
  const occupancyWeight = (occupancyFactor - 1) * FEATURE_WEIGHTS.currentOccupancy
  keyFactors.push({
    factor: 'Current Occupancy',
    weight: FEATURE_WEIGHTS.currentOccupancy,
    value: currentOccupancy,
  })

  // 4. Calculate weather factor
  let weatherFactor = 1.0
  let weatherWeight = 0
  if (weatherFlag) {
    weatherFactor = WEATHER_FACTORS[weatherFlag] || 1.0
    weatherWeight = (weatherFactor - 1) * FEATURE_WEIGHTS.weather
    keyFactors.push({
      factor: 'Weather',
      weight: FEATURE_WEIGHTS.weather,
      value: weatherFactor,
    })
  }

  // 5. Calculate event factor
  let eventFactor = 1.0
  let eventWeight = 0
  if (isEventDay) {
    eventFactor = 1.5
    eventWeight = (eventFactor - 1) * FEATURE_WEIGHTS.event
    keyFactors.push({
      factor: 'Event Day',
      weight: FEATURE_WEIGHTS.event,
      value: eventFactor,
    })
  }

  // Combine all factors to get demand score
  const baseScore = 0.5 // Midpoint
  const weightedSum =
    hourWeight +
    dayWeight +
    occupancyWeight +
    weatherWeight +
    eventWeight

  let demandScore = baseScore + weightedSum

  // Normalize to 0.0 to 1.0 range
  demandScore = Math.max(0, Math.min(1, demandScore))

  // Calculate confidence based on currentOccupancy (more data = higher confidence)
  const confidence = 0.5 + (currentOccupancy * 0.4) + (isEventDay ? 0.1 : 0)

  // Generate explanation
  const explanation = generateExplanation(
    demandScore,
    keyFactors,
    currentOccupancy,
    hourOfDay
  )

  return {
    demandScore,
    confidence,
    keyFactors,
    explanation,
  }
}

/**
 * Generate human-readable explanation
 */
function generateExplanation(
  demandScore: number,
  factors: { factor: string; weight: number; value: number }[],
  occupancy: number,
  hour: number
): string {
  const demandLevel = demandScore > 0.8 ? 'extremely high' : demandScore > 0.6 ? 'high' : demandScore > 0.4 ? 'moderate' : demandScore > 0.2 ? 'low' : 'very low'

  const occupancyLevel = occupancy > 0.9 ? 'critical' : occupancy > 0.7 ? 'high' : occupancy > 0.5 ? 'moderate' : 'low'

  const topFactor = factors.reduce((max, f) => (f.weight > max.weight ? f : max), {
    factor: 'None',
    weight: 0,
    value: 0,
  })

  return `Demand is ${demandLevel} (${Math.round(demandScore * 100)}%) driven by ${occupancyLevel} occupancy (${Math.round(occupancy * 100)}%) at ${hour}:00. Primary factor: ${topFactor.factor} (${topFactor.value}x).`
}

/**
 * Get demand score as percentage (0-100)
 */
export function getDemandScorePercentage(demandScore: number): number {
  return Math.round(demandScore * 100)
}

/**
 * Classify demand level
 */
export function classifyDemandLevel(demandScore: number): string {
  if (demandScore > 0.8) return 'EXTREME'
  if (demandScore > 0.6) return 'HIGH'
  if (demandScore > 0.4) return 'MODERATE'
  if (demandScore > 0.2) return 'LOW'
  return 'VERY_LOW'
}