import { PrismaClient, BayType } from "@prisma/client"
import { predictDemandScore, DemandPredictionInput } from "./demand-predictor"
import { getSiteOccupancy } from "../booking-engine"

const prisma = new PrismaClient()

/**
 * RL State Space Definition
 * State: [OccupancyRate, DemandScore, TimeOfDay, BayType]
 */
interface PricingState {
  occupancyRate: number // 0.0 to 1.0
  demandScore: number // 0.0 to 1.0
  timeOfDay: number // 0-23
  bayType: BayType
}

/**
 * RL Action Space
 * Action: Multiplier adjustments
 */
type PricingAction = 0.8 | 1.0 | 1.25 | 1.5 | 2.0

/**
 * Q-Learning Table (simplified)
 * Maps state to action values
 */
const Q_TABLE: Record<string, Record<string, number>> = {}

/**
 * Learning rate
 */
const LEARNING_RATE = 0.1

/**
 * Discount factor
 */
const DISCOUNT_FACTOR = 0.9

/**
 * Exploration rate (epsilon-greedy)
 */
const EPSILON = 0.1

/**
 * Bay type premiums
 */
const BAY_TYPE_PREMIUMS: Record<BayType, number> = {
  STANDARD: 1.0,
  ACCESSIBLE: 1.1,
  EV_CHARGING: 1.2,
  VIP: 1.5,
  TWO_WHEELER: 0.7,
}

/**
 * Get state key for Q-table lookup
 */
function getStateKey(state: PricingState): string {
  return `${state.occupancyRate.toFixed(2)}_${state.demandScore.toFixed(2)}_${state.timeOfDay}_${state.bayType}`
}

/**
 * Get Q-value for state-action pair
 */
function getQValue(state: PricingState, action: PricingAction): number {
  const stateKey = getStateKey(state)
  const actionKey = action.toString()
  return Q_TABLE[stateKey]?.[actionKey] || 0
}

/**
 * Set Q-value for state-action pair
 */
function setQValue(state: PricingState, action: PricingAction, value: number): void {
  const stateKey = getStateKey(state)
  const actionKey = action.toString()
  if (!Q_TABLE[stateKey]) {
    Q_TABLE[stateKey] = {}
  }
  Q_TABLE[stateKey][actionKey] = value
}

/**
 * Calculate reward for state-action pair
 * Goal: Maximize utilization without exceeding 95% occupancy
 */
function calculateReward(
  state: PricingState,
  action: PricingAction,
  resultingOccupancy: number
): number {
  // Reward based on occupancy target (95% = 0.95)
  const targetOccupancy = 0.95
  const occupancyError = Math.abs(resultingOccupancy - targetOccupancy)
  
  // Base reward: closer to target = higher reward
  let reward = 1 - occupancyError
  
  // Penalty for exceeding 95% (bad for customer experience)
  if (resultingOccupancy > 0.95) {
    reward -= 2 // Heavy penalty
  }
  
  // Penalty for very low occupancy (revenue loss)
  if (resultingOccupancy < 0.5) {
    reward -= 0.5
  }
  
  // Bonus for moderate-high occupancy (good balance)
  if (resultingOccupancy >= 0.7 && resultingOccupancy <= 0.95) {
    reward += 0.5
  }
  
  // Penalty for extreme multipliers during low demand
  if (action >= 1.5 && state.demandScore < 0.3) {
    reward -= 0.5
  }
  
  // Bonus for reasonable multipliers during high demand
  if (action >= 1.25 && state.demandScore > 0.7) {
    reward += 0.3
  }
  
  return reward
}

/**
 * Select action using epsilon-greedy policy
 */
function selectAction(state: PricingState): PricingAction {
  // Exploration: random action
  if (Math.random() < EPSILON) {
    const actions: PricingAction[] = [0.8, 1.0, 1.25, 1.5, 2.0]
    return actions[Math.floor(Math.random() * actions.length)]
  }
  
  // Exploitation: best action from Q-table
  const stateKey = getStateKey(state)
  const qValues = Q_TABLE[stateKey]
  
  if (!qValues || Object.keys(qValues).length === 0) {
    // No learned values, use rule-based action
    return getRuleBasedAction(state)
  }
  
  // Select action with highest Q-value
  let bestAction: PricingAction = 1.0
  let bestQValue = -Infinity
  
  for (const [actionKey, qValue] of Object.entries(qValues)) {
    if (qValue > bestQValue) {
      bestQValue = qValue
      bestAction = parseFloat(actionKey) as PricingAction
    }
  }
  
  return bestAction
}

/**
 * Rule-based action selection (fallback when Q-table is empty)
 */
function getRuleBasedAction(state: PricingState): PricingAction {
  const { occupancyRate, demandScore } = state
  
  // Very high demand + high occupancy -> Increase price
  if (demandScore > 0.8 && occupancyRate > 0.7) {
    return 1.5
  }
  
  // High demand -> Moderate increase
  if (demandScore > 0.6) {
    return 1.25
  }
  
  // Low demand -> Decrease price
  if (demandScore < 0.3 && occupancyRate < 0.5) {
    return 0.8
  }
  
  // Moderate demand -> Normal price
  return 1.0
}

/**
 * Update Q-value using Q-learning update rule
 */
function updateQValue(
  state: PricingState,
  action: PricingAction,
  reward: number,
  nextState: PricingState
): void {
  const currentQ = getQValue(state, action)
  
  // Find max Q-value for next state
  const nextActions: PricingAction[] = [0.8, 1.0, 1.25, 1.5, 2.0]
  let maxNextQ = -Infinity
  
  for (const nextAction of nextActions) {
    const q = getQValue(nextState, nextAction)
    if (q > maxNextQ) {
      maxNextQ = q
    }
  }
  
  if (maxNextQ === -Infinity) {
    maxNextQ = 0
  }
  
  // Q-learning update rule
  const newQ = currentQ + LEARNING_RATE * (reward + DISCOUNT_FACTOR * maxNextQ - currentQ)
  setQValue(state, action, newQ)
}

/**
 * Calculate dynamic price using RL policy
 */
export async function calculateDynamicPrice({
  siteId,
  parkingBayId,
  bayType,
  durationHours,
  startTime,
}: {
  siteId: string
  parkingBayId?: string
  bayType?: BayType
  durationHours: number
  startTime: Date
}): Promise<{
  basePrice: number
  occupancyFactor: number
  demandFactor: number
  bayTypePremium: number
  timeOfDayFactor: number
  finalPrice: number
  totalPrice: number
  explanation: string
  multiplier: number
  demandScore: number
  occupancyRate: number
}> {
  // Get current occupancy
  const occupancy = await getSiteOccupancy(siteId)
  const occupancyRate = occupancy.totalBays > 0 
    ? occupancy.occupiedBays / occupancy.totalBays 
    : 0
  
  // Get pricing rule for site
  const pricingRule = await prisma.dynamicPricingRule.findFirst({
    where: { siteId },
  })
  
  const baseRatePerHour = pricingRule?.baseRatePerHour || 50
  const minRate = pricingRule?.minRate || baseRatePerHour * 0.5
  const maxRate = pricingRule?.maxRate || baseRatePerHour * 2.0
  const isDynamicEnabled = pricingRule?.isDynamicEnabled ?? true
  
  // Get bay type
  let actualBayType: BayType = BayType.STANDARD
  if (bayType) {
    actualBayType = bayType
  } else if (parkingBayId) {
    const bay = await prisma.parkingBay.findUnique({
      where: { id: parkingBayId },
    })
    actualBayType = bay?.bayType || BayType.STANDARD
  }
  
  // Get time of day
  const hourOfDay = startTime.getHours()
  const dayOfWeek = startTime.getDay()
  
  // Predict demand score
  const demandPrediction = predictDemandScore({
    siteId,
    hourOfDay,
    dayOfWeek,
    currentOccupancy: occupancyRate,
    weatherFlag: 'sunny', // Default, can be enhanced with weather API
    isEventDay: false, // Default, can be enhanced with event API
  })
  
  const demandScore = demandPrediction.demandScore
  
  // Calculate state for RL
  const state: PricingState = {
    occupancyRate,
    demandScore,
    timeOfDay: hourOfDay,
    bayType: actualBayType,
  }
  
  // Select action (multiplier) using RL policy
  let multiplier: PricingAction = 1.0
  
  if (isDynamicEnabled) {
    multiplier = selectAction(state)
    
    // Simulate learning (in production, this would be done offline)
    // We use a simplified reward calculation based on current state
    const reward = calculateReward(state, multiplier, occupancyRate)
    updateQValue(state, multiplier, reward, state)
  }
  
  // Apply pricing rule multipliers
  const occupancyMultiplier = pricingRule?.occupancyMultiplier || 1.0
  const peakMultiplier = pricingRule?.peakMultiplier || 1.0
  const eventMultiplier = pricingRule?.eventMultiplier || 1.0
  
  // Calculate time of day factor
  let timeOfDayFactor = 1.0
  if (hourOfDay >= 8 && hourOfDay < 10) timeOfDayFactor = 1.2 // Morning rush
  else if (hourOfDay >= 12 && hourOfDay < 14) timeOfDayFactor = 1.1 // Lunch
  else if (hourOfDay >= 17 && hourOfDay < 19) timeOfDayFactor = 1.3 // Evening rush
  else if (hourOfDay >= 20) timeOfDayFactor = 0.9 // Night
  
  // Calculate bay type premium
  const bayTypePremium = BAY_TYPE_PREMIUMS[actualBayType] || 1.0
  
  // Calculate final multiplier
  const finalMultiplier = multiplier * occupancyMultiplier * peakMultiplier * eventMultiplier * bayTypePremium * timeOfDayFactor
  
  // Calculate final price per hour
  let finalPrice = baseRatePerHour * finalMultiplier
  
  // Ensure price is within bounds
  finalPrice = Math.max(minRate, Math.min(maxRate, finalPrice))
  
  // Calculate total price
  const totalPrice = finalPrice * durationHours
  
  // Calculate factors for explanation
  const occupancyFactor = (occupancyRate > 0.7 ? 1 + (occupancyRate - 0.7) * 0.5 : 1)
  const demandFactor = 1 + (demandScore - 0.5) * 0.4
  
  // Generate explanation
  const explanation = generatePricingExplanation({
    basePrice: baseRatePerHour,
    occupancyRate,
    demandScore,
    multiplier,
    finalPrice,
    hourOfDay,
    bayType: actualBayType,
  })
  
  // Log demand snapshot
  await prisma.demandSnapshot.create({
    data: {
      siteId,
      occupancyRate,
      calculatedRate: finalPrice,
      demandScore,
      weatherCondition: 'sunny',
      isPeakHour: (hourOfDay >= 8 && hourOfDay < 10) || (hourOfDay >= 17 && hourOfDay < 19),
      pricingRuleId: pricingRule?.id,
    },
  })
  
  return {
    basePrice: baseRatePerHour,
    occupancyFactor,
    demandFactor,
    bayTypePremium,
    timeOfDayFactor,
    finalPrice,
    totalPrice,
    explanation,
    multiplier,
    demandScore,
    occupancyRate,
  }
}

/**
 * Generate human-readable pricing explanation
 */
function generatePricingExplanation(params: {
  basePrice: number
  occupancyRate: number
  demandScore: number
  multiplier: number
  finalPrice: number
  hourOfDay: number
  bayType: BayType
}): string {
  const { basePrice, occupancyRate, demandScore, multiplier, finalPrice, hourOfDay, bayType } = params
  
  const occupancyPercent = Math.round(occupancyRate * 100)
  const demandPercent = Math.round(demandScore * 100)
  const multiplierPercent = Math.round((multiplier - 1) * 100)
  
  let timeDescription = ''
  if (hourOfDay >= 8 && hourOfDay < 10) timeDescription = 'morning rush'
  else if (hourOfDay >= 12 && hourOfDay < 14) timeDescription = 'lunch'
  else if (hourOfDay >= 17 && hourOfDay < 19) timeDescription = 'evening rush'
  else timeDescription = 'off-peak'
  
  const baseMessage = `Base rate: ₹${basePrice.toFixed(0)}/hr`
  const occupancyMessage = occupancyPercent > 70 
    ? `High occupancy (${occupancyPercent}%)` 
    : `Moderate occupancy (${occupancyPercent}%)`
  const demandMessage = demandPercent > 60 
    ? `High demand (${demandPercent}%)` 
    : `Normal demand (${demandPercent}%)`
  const bayTypeMessage = bayType !== 'STANDARD' ? `${bayType} premium` : 'standard bay'
  
  if (multiplier > 1.0) {
    return `${baseMessage}. ${occupancyMessage} during ${timeDescription} with ${demandMessage} for ${bayTypeMessage} triggered a ${multiplierPercent}% rate adjustment. Final rate: ₹${finalPrice.toFixed(0)}/hr.`
  } else if (multiplier < 1.0) {
    return `${baseMessage}. Low demand during ${timeDescription} for ${bayTypeMessage} triggered a ${multiplierPercent}% discount. Final rate: ₹${finalPrice.toFixed(0)}/hr.`
  } else {
    return `${baseMessage}. Normal conditions during ${timeDescription} for ${bayTypeMessage}. Final rate: ₹${finalPrice.toFixed(0)}/hr.`
  }
}

/**
 * Get pricing rules for a site
 */
export async function getPricingRules(siteId: string) {
  const pricingRule = await prisma.dynamicPricingRule.findFirst({
    where: { siteId },
  })
  
  if (!pricingRule) {
    // Return default pricing
    return {
      siteId,
      baseRatePerHour: 50,
      minRate: 25,
      maxRate: 100,
      occupancyMultiplier: 1.0,
      peakMultiplier: 1.0,
      eventMultiplier: 1.0,
      isDynamicEnabled: true,
    }
  }
  
  return pricingRule
}

/**
 * Update pricing rules for a site
 */
export async function updatePricingRules(
  siteId: string,
  updates: {
    baseRatePerHour?: number
    minRate?: number
    maxRate?: number
    occupancyMultiplier?: number
    peakMultiplier?: number
    eventMultiplier?: number
    isDynamicEnabled?: boolean
  }
) {
  const pricingRule = await prisma.dynamicPricingRule.upsert({
    where: { id: `${siteId}-pricing` },
    update: updates,
    create: {
      id: `${siteId}-pricing`,
      siteId,
      baseRatePerHour: updates.baseRatePerHour || 50,
      minRate: updates.minRate || 25,
      maxRate: updates.maxRate || 100,
      occupancyMultiplier: updates.occupancyMultiplier || 1.0,
      peakMultiplier: updates.peakMultiplier || 1.0,
      eventMultiplier: updates.eventMultiplier || 1.0,
      isDynamicEnabled: updates.isDynamicEnabled ?? true,
    },
  })
  
  return pricingRule
}