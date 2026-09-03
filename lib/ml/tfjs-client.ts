/**
 * Client-side pricing utility for instant price calculation
 * Reduces API latency by computing approximate prices on the frontend
 */

export interface ClientPricingInput {
  baseRate: number
  occupancyRate: number
  demandScore: number
  bayType: 'STANDARD' | 'ACCESSIBLE' | 'EV_CHARGING' | 'VIP' | 'TWO_WHEELER'
  hourOfDay: number
  durationHours: number
  minRate?: number
  maxRate?: number
}

export interface ClientPricingOutput {
  estimatedPrice: number
  totalPrice: number
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  explanation: string
}

/**
 * Bay type premiums (client-side)
 */
const BAY_TYPE_PREMIUMS: Record<string, number> = {
  STANDARD: 1.0,
  ACCESSIBLE: 1.1,
  EV_CHARGING: 1.2,
  VIP: 1.5,
  TWO_WHEELER: 0.7,
}

/**
 * Time of day multipliers (client-side)
 */
function getTimeOfDayMultiplier(hour: number): number {
  if (hour >= 8 && hour < 10) return 1.2 // Morning rush
  if (hour >= 12 && hour < 14) return 1.1 // Lunch
  if (hour >= 17 && hour < 19) return 1.3 // Evening rush
  if (hour >= 20) return 0.9 // Night
  return 1.0 // Normal
}

/**
 * Calculate approximate price on client side
 */
export function calculateClientPrice(input: ClientPricingInput): ClientPricingOutput {
  const {
    baseRate,
    occupancyRate,
    demandScore,
    bayType,
    hourOfDay,
    durationHours,
    minRate = baseRate * 0.5,
    maxRate = baseRate * 2.0,
  } = input

  // Calculate occupancy factor
  let occupancyFactor = 1.0
  if (occupancyRate > 0.9) occupancyFactor = 1.5
  else if (occupancyRate > 0.7) occupancyFactor = 1.3
  else if (occupancyRate > 0.5) occupancyFactor = 1.1

  // Calculate demand factor
  let demandFactor = 1.0
  if (demandScore > 0.8) demandFactor = 1.5
  else if (demandScore > 0.6) demandFactor = 1.3
  else if (demandScore > 0.4) demandFactor = 1.1

  // Get time of day multiplier
  const timeOfDayMultiplier = getTimeOfDayMultiplier(hourOfDay)

  // Get bay type premium
  const bayTypePremium = BAY_TYPE_PREMIUMS[bayType] || 1.0

  // Calculate final multiplier
  const finalMultiplier = occupancyFactor * demandFactor * timeOfDayMultiplier * bayTypePremium

  // Calculate estimated price per hour
  let estimatedPrice = baseRate * finalMultiplier

  // Ensure price is within bounds
  estimatedPrice = Math.max(minRate, Math.min(maxRate, estimatedPrice))

  // Calculate total price
  const totalPrice = estimatedPrice * durationHours

  // Calculate confidence based on input quality
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM'
  if (occupancyRate > 0 && demandScore > 0) {
    confidence = 'HIGH'
  } else if (occupancyRate > 0 || demandScore > 0) {
    confidence = 'MEDIUM'
  } else {
    confidence = 'LOW'
  }

  // Generate explanation
  const explanation = generateClientExplanation({
    baseRate,
    occupancyRate,
    demandScore,
    estimatedPrice,
    hourOfDay,
    bayType,
  })

  return {
    estimatedPrice,
    totalPrice,
    confidence,
    explanation,
  }
}

/**
 * Generate client-side explanation
 */
function generateClientExplanation(params: {
  baseRate: number
  occupancyRate: number
  demandScore: number
  estimatedPrice: number
  hourOfDay: number
  bayType: string
}): string {
  const { baseRate, occupancyRate, demandScore, estimatedPrice, hourOfDay, bayType } = params

  const occupancyPercent = Math.round(occupancyRate * 100)
  const demandPercent = Math.round(demandScore * 100)
  const priceIncrease = Math.round(((estimatedPrice - baseRate) / baseRate) * 100)

  let timeDescription = ''
  if (hourOfDay >= 8 && hourOfDay < 10) timeDescription = 'morning rush'
  else if (hourOfDay >= 12 && hourOfDay < 14) timeDescription = 'lunch'
  else if (hourOfDay >= 17 && hourOfDay < 19) timeDescription = 'evening rush'
  else timeDescription = 'off-peak'

  if (priceIncrease > 0) {
    return `Estimated: ₹${estimatedPrice.toFixed(0)}/hr (+${priceIncrease}% from base ₹${baseRate}/hr). Factors: ${occupancyPercent}% occupancy, ${demandPercent}% demand, ${timeDescription}, ${bayType}.`
  } else {
    return `Estimated: ₹${estimatedPrice.toFixed(0)}/hr. Base rate with ${timeDescription} and ${bayType}.`
  }
}

/**
 * Quick price estimate (simplified)
 */
export function quickPriceEstimate(
  baseRate: number,
  durationHours: number,
  occupancyRate: number = 0.5
): number {
  // Simple linear model: price increases with occupancy
  const multiplier = 1 + (occupancyRate - 0.5) * 0.5
  const price = baseRate * multiplier
  return Math.round(price * durationHours)
}

/**
 * Format price for display
 */
export function formatPrice(price: number, currency: string = 'INR'): string {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency
  return `${symbol}${price.toFixed(0)}`
}

/**
 * Validate price inputs
 */
export function validatePricingInput(input: ClientPricingInput): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (input.baseRate <= 0) {
    errors.push('Base rate must be positive')
  }

  if (input.occupancyRate < 0 || input.occupancyRate > 1) {
    errors.push('Occupancy rate must be between 0 and 1')
  }

  if (input.demandScore < 0 || input.demandScore > 1) {
    errors.push('Demand score must be between 0 and 1')
  }

  if (input.durationHours <= 0) {
    errors.push('Duration must be positive')
  }

  if (input.hourOfDay < 0 || input.hourOfDay > 23) {
    errors.push('Hour must be between 0 and 23')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}