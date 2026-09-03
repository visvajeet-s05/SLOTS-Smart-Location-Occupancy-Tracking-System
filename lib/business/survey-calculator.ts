/**
 * Survey Calculation Engine
 * Calculates parking capacity, hardware BOM, and revenue projections
 * Based on Indian standard vehicle turn radii and site dimensions
 */

export interface SiteDimensions {
  lengthMeters: number
  widthMeters: number
  areaSqMeters: number
  entryLanes: number
  exitLanes: number
  isMultiStorey: boolean
  floors: number
  surfaceType: "ASPHALT" | "PAVED" | "UNPAVED"
}

export interface ParkingCapacity {
  totalSlots: number
  accessibleSlots: number
  evChargingSlots: number
  regularSlots: number
  slotLayout: {
    rows: number
    columns: number
    spacingMeters: number
  }
}

export interface HardwareItem {
  item: string
  quantity: number
  unitCostINR: number
  totalCostINR: number
}

export interface HardwareBOM {
  cameras: HardwareItem[]
  barrierGates: HardwareItem
  edgeNodes: HardwareItem
  evChargers: HardwareItem
  sensors: HardwareItem
  networking: HardwareItem
  totalEstimatedCostINR: number
}

export interface RevenueProjection {
  estimatedMonthlyGrossRevenueINR: number
  estimatedMonthlyNetRevenueINR: number
  landownerShareINR: number
  platformShareINR: number
  occupancyRate: number
  avgHourlyRateINR: number
}

export interface SiteSurveyResult {
  capacity: ParkingCapacity
  hardwareBOM: HardwareBOM
  revenueProjection: RevenueProjection
  recommendations: string[]
}

/**
 * Survey Calculation Engine
 * Computes capacity, hardware BOM, and revenue projections
 */
class SurveyCalculatorEngine {
  // Indian standard vehicle dimensions and turn radii
  private readonly STANDARD_VEHICLE_LENGTH = 4.5 // meters
  private readonly STANDARD_VEHICLE_WIDTH = 2.0 // meters
  private readonly TURN_RADIUS = 5.5 // meters
  private readonly AISLE_WIDTH = 6.0 // meters
  private readonly SLOT_LENGTH = 5.0 // meters
  private readonly SLOT_WIDTH = 2.5 // meters

  // Hardware costs (INR)
  private readonly COSTS = {
    CAMERA_WIDE_ANGLE: 15000,
    CAMERA_PTZ: 25000,
    BARRIER_GATE: 35000,
    EDGE_NODE_JETSON_NANO: 25000,
    EDGE_NODE_RPI_4: 15000,
    EV_CHARGER_7KW: 150000,
    EV_CHARGER_22KW: 300000,
    ULTRASONIC_SENSOR: 2000,
    IR_BEAM_SENSOR: 1500,
    NETWORKING_SWITCH_8PORT: 5000,
    NETWORKING_SWITCH_24PORT: 15000,
    CABLING_PER_METER: 100,
  }

  // Chennai hourly pricing (INR)
  private readonly HOURLY_RATES = {
    REGULAR: 20,
    PREMIUM: 35,
    VIP: 50,
    EV_CHARGING: 30,
  }

  /**
   * Calculate parking capacity based on site dimensions
   */
  calculateParkingCapacity(dimensions: SiteDimensions): ParkingCapacity {
    const { lengthMeters, widthMeters, entryLanes, exitLanes, isMultiStorey, floors, surfaceType } = dimensions

    // Calculate effective usable area (accounting for aisles and circulation)
    const aisleArea = (entryLanes + exitLanes) * this.AISLE_WIDTH * lengthMeters
    const circulationArea = lengthMeters * widthMeters * 0.15 // 15% for circulation
    const usableArea = lengthMeters * widthMeters - aisleArea - circulationArea

    // Apply surface type efficiency factor
    const surfaceEfficiency = surfaceType === "ASPHALT" ? 1.0 : surfaceType === "PAVED" ? 0.95 : 0.85

    const effectiveArea = usableArea * surfaceEfficiency

    // Calculate slot dimensions with turn radius consideration
    const slotArea = this.SLOT_LENGTH * this.SLOT_WIDTH
    const totalSlots = Math.floor(effectiveArea / slotArea)

    // Adjust for multi-storey
    const adjustedTotalSlots = isMultiStorey ? totalSlots * floors : totalSlots

    // Calculate layout (optimal arrangement)
    const columns = Math.floor(Math.sqrt(adjustedTotalSlots))
    const rows = Math.ceil(adjustedTotalSlots / columns)

    // Allocate slot types (Indian standards: 4% accessible, 5% EV charging)
    const accessibleSlots = Math.floor(adjustedTotalSlots * 0.04)
    const evChargingSlots = Math.floor(adjustedTotalSlots * 0.05)
    const regularSlots = adjustedTotalSlots - accessibleSlots - evChargingSlots

    return {
      totalSlots: adjustedTotalSlots,
      accessibleSlots,
      evChargingSlots,
      regularSlots,
      slotLayout: {
        rows,
        columns,
        spacingMeters: this.SLOT_WIDTH,
      },
    }
  }

  /**
   * Generate hardware Bill of Materials
   */
  generateHardwareBOM(capacity: ParkingCapacity): HardwareBOM {
    const { totalSlots, accessibleSlots, evChargingSlots } = capacity

    // Cameras: 1 wide-angle per 12 surface slots
    const cameraCount = Math.ceil(totalSlots / 12)
    const cameras: HardwareItem[] = [
      {
        item: "Wide-Angle Edge Camera (1080p, Night Vision)",
        quantity: cameraCount,
        unitCostINR: this.COSTS.CAMERA_WIDE_ANGLE,
        totalCostINR: cameraCount * this.COSTS.CAMERA_WIDE_ANGLE,
      },
    ]

    // Barrier gates: 1 per entry lane + 1 per exit lane
    const barrierCount = capacity.slotLayout.rows + capacity.slotLayout.columns // Simplified: barriers at key points
    const barrierGates: HardwareItem = {
      item: "Automated Barrier Gate (Boom Barrier)",
      quantity: barrierCount,
      unitCostINR: this.COSTS.BARRIER_GATE,
      totalCostINR: barrierCount * this.COSTS.BARRIER_GATE,
    }

    // Edge nodes: 1 per 50 slots
    const edgeNodeCount = Math.ceil(totalSlots / 50)
    const edgeNodes: HardwareItem = {
      item: "Edge Processing Unit (Jetson Nano 4GB)",
      quantity: edgeNodeCount,
      unitCostINR: this.COSTS.EDGE_NODE_JETSON_NANO,
      totalCostINR: edgeNodeCount * this.COSTS.EDGE_NODE_JETSON_NANO,
    }

    // EV chargers: 1 per 10 EV slots
    const evChargerCount = Math.ceil(evChargingSlots / 10)
    const evChargers: HardwareItem = {
      item: `EV Charger (${evChargingSlots > 20 ? "22KW" : "7KW"})`,
      quantity: evChargerCount,
      unitCostINR: evChargingSlots > 20 ? this.COSTS.EV_CHARGER_22KW : this.COSTS.EV_CHARGER_7KW,
      totalCostINR: evChargerCount * (evChargingSlots > 20 ? this.COSTS.EV_CHARGER_22KW : this.COSTS.EV_CHARGER_7KW),
    }

    // Sensors: Ultrasonic + IR per slot
    const sensorCount = totalSlots * 2
    const sensors: HardwareItem = {
      item: "Sensor Package (Ultrasonic + IR Beam)",
      quantity: sensorCount,
      unitCostINR: this.COSTS.ULTRASONIC_SENSOR + this.COSTS.IR_BEAM_SENSOR,
      totalCostINR: sensorCount * (this.COSTS.ULTRASONIC_SENSOR + this.COSTS.IR_BEAM_SENSOR),
    }

    // Networking: 8-port switch per 50 slots
    const switchCount = Math.ceil(totalSlots / 50)
    const networking: HardwareItem = {
      item: "Network Switch (8-port)",
      quantity: switchCount,
      unitCostINR: this.COSTS.NETWORKING_SWITCH_8PORT,
      totalCostINR: switchCount * this.COSTS.NETWORKING_SWITCH_8PORT,
    }

    const totalCost =
      cameras.reduce((sum, item) => sum + item.totalCostINR, 0) +
      barrierGates.totalCostINR +
      edgeNodes.totalCostINR +
      evChargers.totalCostINR +
      sensors.totalCostINR +
      networking.totalCostINR

    return {
      cameras,
      barrierGates,
      edgeNodes,
      evChargers,
      sensors,
      networking,
      totalEstimatedCostINR: totalCost,
    }
  }

  /**
   * Generate revenue projection
   */
  generateRevenueProjection(capacity: ParkingCapacity, avgHourlyRateINR?: number): RevenueProjection {
    const { totalSlots } = capacity

    // Use provided rate or default regular rate
    const hourlyRate = avgHourlyRateINR || this.HOURLY_RATES.REGULAR

    // Assume 60% average occupancy for Chennai
    const occupancyRate = 0.6

    // Operating hours: 12 hours per day (8 AM - 8 PM)
    const operatingHoursPerDay = 12
    const daysPerMonth = 30

    // Calculate monthly gross revenue
    const estimatedMonthlyGrossRevenueINR =
      totalSlots * hourlyRate * occupancyRate * operatingHoursPerDay * daysPerMonth

    // Deduct platform fees (30% platform, 70% landowner)
    const platformShareINR = estimatedMonthlyGrossRevenueINR * 0.30
    const landownerShareINR = estimatedMonthlyGrossRevenueINR * 0.70

    // Estimate maintenance costs (10% of gross)
    const maintenanceCost = estimatedMonthlyGrossRevenueINR * 0.10
    const estimatedMonthlyNetRevenueINR = landownerShareINR - maintenanceCost

    return {
      estimatedMonthlyGrossRevenueINR,
      estimatedMonthlyNetRevenueINR,
      landownerShareINR,
      platformShareINR,
      occupancyRate,
      avgHourlyRateINR: hourlyRate,
    }
  }

  /**
   * Get recommendations based on survey results
   */
  getRecommendations(capacity: ParkingCapacity, bom: HardwareBOM): string[] {
    const recommendations: string[] = []

    // Capacity recommendations
    if (capacity.totalSlots < 50) {
      recommendations.push("Consider expanding lot size or optimizing layout for better capacity")
    }

    if (capacity.accessibleSlots === 0) {
      recommendations.push("Add accessible parking slots to comply with Indian accessibility standards")
    }

    if (capacity.evChargingSlots === 0) {
      recommendations.push("Consider adding EV charging slots to capture growing EV market")
    }

    // Hardware recommendations
    if (bom.evChargers.quantity === 0 && capacity.totalSlots > 20) {
      recommendations.push("Consider adding EV chargers to meet increasing EV demand")
    }

    if (bom.edgeNodes.quantity === 0 && capacity.totalSlots > 10) {
      recommendations.push("Add edge processing units for real-time monitoring")
    }

    // Surface type recommendations
    if (capacity.slotLayout.rows > 20) {
      recommendations.push("Consider installing guidance signage for large layouts")
    }

    return recommendations
  }

  /**
   * Complete site survey calculation
   */
  calculateSiteSurvey(dimensions: SiteDimensions, avgHourlyRateINR?: number): SiteSurveyResult {
    const capacity = this.calculateParkingCapacity(dimensions)
    const bom = this.generateHardwareBOM(capacity)
    const revenue = this.generateRevenueProjection(capacity, avgHourlyRateINR)
    const recommendations = this.getRecommendations(capacity, bom)

    return {
      capacity,
      hardwareBOM: bom,
      revenueProjection: revenue,
      recommendations,
    }
  }
}

// Singleton instance
const surveyCalculatorEngine = new SurveyCalculatorEngine()

/**
 * Calculate parking capacity
 */
export function calculateParkingCapacity(dimensions: SiteDimensions): ParkingCapacity {
  return surveyCalculatorEngine.calculateParkingCapacity(dimensions)
}

/**
 * Generate hardware BOM
 */
export function generateHardwareBOM(capacity: ParkingCapacity): HardwareBOM {
  return surveyCalculatorEngine.generateHardwareBOM(capacity)
}

/**
 * Generate revenue projection
 */
export function generateRevenueProjection(capacity: ParkingCapacity, avgHourlyRateINR?: number): RevenueProjection {
  return surveyCalculatorEngine.generateRevenueProjection(capacity, avgHourlyRateINR)
}

/**
 * Complete site survey calculation
 */
export function calculateSiteSurvey(dimensions: SiteDimensions, avgHourlyRateINR?: number): SiteSurveyResult {
  return surveyCalculatorEngine.calculateSiteSurvey(dimensions, avgHourlyRateINR)
}

export { surveyCalculatorEngine }