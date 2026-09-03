/**
 * NUDM / IUDX Compliant Schema Transformer
 * Transforms internal SLOTS Prisma models into standardized JSON-LD / GeoJSON open municipal parking schemas
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export interface NUDMParkingFacility {
  id: string // URN format
  name: string
  location: GeoJSONPoint
  capacity: CapacityInfo
  pricing: PricingInfo
  status: "ACTIVE" | "MAINTENANCE" | "CLOSED"
  timestamp: string // ISO-8601 UTC
  "@context": string // JSON-LD context
}

export interface GeoJSONPoint {
  type: "Point"
  coordinates: [number, number] // [longitude, latitude]
}

export interface CapacityInfo {
  total: number
  available: number
  occupied: number
  ev_bays: number
  accessible_bays: number
}

export interface PricingInfo {
  baseRate: number
  currentRate: number
  currency: string
  pricingFactor: number
  breakdown: {
    occupancyMultiplier: number
    demandMultiplier: number
    eventMultiplier: number
  }
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection"
  features: GeoJSONFeature[]
  "@context": string
}

export interface GeoJSONFeature {
  type: "Feature"
  geometry: GeoJSONPoint
  properties: NUDMParkingFacility
}

export interface NUDMExportQuery {
  city?: string
  wardId?: string
  radiusKm?: number
  lat?: number
  lng?: number
}

/**
 * NUDM / IUDX Schema Transformer
 * Converts internal SLOTS database models to NUDM-compliant schemas
 */
class NUDMSchemaTransformer {
  private readonly NUDM_CONTEXT = "https://nudm.gov.in/contexts/parking-v1.jsonld"
  private readonly SCHEMA_VERSION = "1.0"

  /**
   * Generate URN format ID for parking facility
   */
  private generateURN(lotId: string, city: string): string {
    return `urn:nudm:in:${city}:parking:${lotId}`
  }

  /**
   * Transform Prisma parking lot to NUDM facility
   */
  async transformParkingLot(parkingLotId: string): Promise<NUDMParkingFacility | null> {
    try {
      const lot = await prisma.parkinglot.findUnique({
        where: { id: parkingLotId },
        include: {
          ownerprofile: true,
          slots: {
            where: {
              status: { in: ["AVAILABLE", "OCCUPIED"] }
            }
          }
        }
      })

      if (!lot) {
        return null
      }

      // Get capacity information
      const totalBays = lot.slots.length
      const availableBays = lot.slots.filter(s => s.status === "AVAILABLE").length
      const occupiedBays = lot.slots.filter(s => s.status === "OCCUPIED").length
      const evBays = lot.slots.filter(s => s.slotType === "EV_CHARGING").length
      const accessibleBays = lot.slots.filter(s => s.slotType === "ACCESSIBLE_ADA").length

      // Get current pricing
      const currentRate = await this.getCurrentRate(parkingLotId)

      // Get site information for city extraction
      const site = lot.parkingSiteId ? await prisma.parkingSite.findFirst({
        where: { id: lot.parkingSiteId }
      }) : null

      // Generate URN
      const city = site ? this.extractCityFromSite(site) : "unknown"
      const urn = this.generateURN(lot.id, city)

      // Create GeoJSON point from lot coordinates
      const location: GeoJSONPoint = {
        type: "Point",
        coordinates: [lot.lng, lot.lat]
      }

      // Determine status
      const status = this.determineFacilityStatus(lot)

      const facility: NUDMParkingFacility = {
        id: urn,
        name: lot.name || lot.id,
        location,
        capacity: {
          total: totalBays,
          available: availableBays,
          occupied: occupiedBays,
          ev_bays: evBays,
          accessible_bays: accessibleBays
        },
        pricing: currentRate,
        status,
        timestamp: new Date().toISOString(),
        "@context": this.NUDM_CONTEXT
      }

      return facility
    } catch (error) {
      console.error("Error transforming parking lot:", error)
      return null
    }
  }

  /**
   * Transform multiple parking lots to GeoJSON FeatureCollection
   */
  async transformParkingLots(lotIds: string[]): Promise<GeoJSONFeatureCollection> {
    const features: GeoJSONFeature[] = []

    for (const lotId of lotIds) {
      const facility = await this.transformParkingLot(lotId)
      if (facility) {
        const feature: GeoJSONFeature = {
          type: "Feature",
          geometry: facility.location,
          properties: facility
        }
        features.push(feature)
      }
    }

    return {
      type: "FeatureCollection",
      features,
      "@context": this.NUDM_CONTEXT
    }
  }

  /**
   * Query parking lots by filters
   */
  async queryParkingLots(query: NUDMExportQuery): Promise<string[]> {
    const where: any = {}

    // Filter by city (from site name or metadata)
    if (query.city) {
      // In production, this would query by city field
      // For now, we'll filter by parking site name containing city
      const sites = await prisma.parkingSite.findMany({
        where: {
          name: {
            contains: query.city
          }
        },
        select: { id: true }
      })

      const siteIds = sites.map(s => s.id)
      if (siteIds.length > 0) {
        where.parkingSiteId = { in: siteIds }
      }
    }

    // Filter by ward ID (if stored in metadata)
    if (query.wardId) {
      // In production, would filter by ward field
      // For now, we'll filter by lot name containing ward
      where.lotName = {
        contains: query.wardId,
        mode: "insensitive"
      }
    }

    // Geo-spatial query (radius)
    if (query.lat !== undefined && query.lng !== undefined && query.radiusKm !== undefined) {
      const sites = await prisma.parkingSite.findMany({
        where: {}
      })

      const nearbySiteIds = sites
        .filter(site => {
          const distance = this.calculateDistance(
            query.lat!,
            query.lng!,
            site.latitude,
            site.longitude
          )
          return distance <= query.radiusKm!
        })
        .map(s => s.id)

      if (nearbySiteIds.length > 0) {
        where.parkingSiteId = { in: nearbySiteIds }
      }
    }

    const lots = await prisma.parkinglot.findMany({
      where,
      select: { id: true }
    })

    return lots.map(l => l.id)
  }

  /**
   * Get current pricing for parking lot
   */
  private async getCurrentRate(lotId: string): Promise<PricingInfo> {
    // Get base rate from pricing rules
    const pricingRule = await prisma.pricingrule.findFirst({
      where: { parkingLotId: lotId },
      orderBy: { createdAt: "desc" }
    })

    const baseRate = pricingRule?.basePrice || 50 // Default base rate

    // Simulate dynamic pricing factor
    const occupancyMultiplier = 1.0 + Math.random() * 0.3
    const demandMultiplier = 1.0 + Math.random() * 0.2
    const eventMultiplier = 1.0

    const pricingFactor = occupancyMultiplier * demandMultiplier * eventMultiplier
    const currentRate = baseRate * pricingFactor

    return {
      baseRate,
      currentRate,
      currency: "INR",
      pricingFactor,
      breakdown: {
        occupancyMultiplier,
        demandMultiplier,
        eventMultiplier
      }
    }
  }

  /**
   * Extract city from parking site
   */
  private extractCityFromSite(site: any): string {
    // In production, city would be a field on the site
    // For now, extract from name or use default
    const cityName = site.name?.split(",")[0]?.trim() || "unknown"
    return cityName.toLowerCase().replace(/\s+/g, "_")
  }

  /**
   * Determine facility status
   */
  private determineFacilityStatus(lot: any): "ACTIVE" | "MAINTENANCE" | "CLOSED" {
    // In production, this would check actual status flags
    // For now, assume all are ACTIVE
    return "ACTIVE"
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371 // Earth's radius in km
    const dLat = this.toRadians(lat2 - lat1)
    const dLng = this.toRadians(lng2 - lng1)

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
      Math.cos(this.toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
  }

  /**
   * Validate NUDM schema compliance
   */
  validateNUDMSchema(facility: NUDMParkingFacility): {
    valid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    // Check required fields
    if (!facility.id || !facility.id.startsWith("urn:nudm:")) {
      errors.push("Invalid or missing URN format ID")
    }

    if (!facility.name) {
      errors.push("Missing facility name")
    }

    if (!facility.location || facility.location.type !== "Point") {
      errors.push("Invalid or missing GeoJSON Point location")
    }

    if (!facility.location.coordinates || facility.location.coordinates.length !== 2) {
      errors.push("Invalid location coordinates")
    }

    if (!facility.capacity) {
      errors.push("Missing capacity information")
    }

    if (typeof facility.capacity.total !== "number" || facility.capacity.total < 0) {
      errors.push("Invalid total capacity")
    }

    if (!facility.pricing) {
      errors.push("Missing pricing information")
    }

    if (!["ACTIVE", "MAINTENANCE", "CLOSED"].includes(facility.status)) {
      errors.push("Invalid facility status")
    }

    if (!facility.timestamp || !this.isValidISO8601(facility.timestamp)) {
      errors.push("Invalid or missing timestamp")
    }

    if (!facility["@context"]) {
      errors.push("Missing JSON-LD context")
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Validate ISO-8601 timestamp
   */
  private isValidISO8601(timestamp: string): boolean {
    const date = new Date(timestamp)
    return !isNaN(date.getTime())
  }

  /**
   * Transform to IUDX-specific schema (if different from NUDM)
   */
  async transformToIUDX(parkingLotId: string): Promise<any> {
    // IUDX may have slightly different schema requirements
    // This method would implement those differences
    const nudmFacility = await this.transformParkingLot(parkingLotId)
    
    if (!nudmFacility) {
      return null
    }

    // Add IUDX-specific fields
    const iudxFacility = {
      ...nudmFacility,
      iudx_version: "1.0",
      data_provider: "SLOTS",
      data_source: "realtime",
      license: "CC-BY 4.0"
    }

    return iudxFacility
  }
}

// Singleton instance
const nudmSchemaTransformer = new NUDMSchemaTransformer()

/**
 * Transform parking lot to NUDM facility
 */
export async function transformToNUDM(parkingLotId: string): Promise<NUDMParkingFacility | null> {
  return await nudmSchemaTransformer.transformParkingLot(parkingLotId)
}

/**
 * Transform multiple parking lots to NUDM GeoJSON
 */
export async function transformToNUDMGeoJSON(lotIds: string[]): Promise<GeoJSONFeatureCollection> {
  return await nudmSchemaTransformer.transformParkingLots(lotIds)
}

/**
 * Query parking lots by filters
 */
export async function queryParkingLots(query: NUDMExportQuery): Promise<string[]> {
  return await nudmSchemaTransformer.queryParkingLots(query)
}

/**
 * Validate NUDM schema
 */
export function validateNUDMSchema(facility: NUDMParkingFacility) {
  return nudmSchemaTransformer.validateNUDMSchema(facility)
}

/**
 * Transform to IUDX schema
 */
export async function transformToIUDX(parkingLotId: string) {
  return await nudmSchemaTransformer.transformToIUDX(parkingLotId)
}

export { nudmSchemaTransformer }