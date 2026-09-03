/**
 * External Context Integration Layer
 * Ingests real-time weather API feeds and local event calendars
 * Injects dynamic contextual multiplier features into pricing predictor
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export interface WeatherCondition {
  condition: string
  temperature: number
  humidity: number
  windSpeed: number
  rainfall: number
  isSevere: boolean
}

export interface EventInfo {
  eventId: string
  name: string
  venue: string
  startTime: Date
  endTime: Date
  impactScore: number // 1.0 to 1.5
  eventType: "SPORTS" | "FESTIVAL" | "HOLIDAY" | "CONCERT" | "OTHER"
}

export interface DemandFeatures {
  lotId: string
  weatherMultiplier: number
  eventMultiplier: number
  timeOfDayMultiplier: number
  totalDemandMultiplier: number
  weatherCondition: WeatherCondition | null
  activeEvent: EventInfo | null
  cachedAt: Date
  cachedUntil: Date
}

export interface ExternalSignalsConfig {
  weatherApiKey?: string
  weatherApiUrl?: string
  cacheTTLMinutes?: number
}

/**
 * External Signal Aggregator
 * Combines weather and event features into unified demand multiplier
 */
class ExternalSignalAggregator {
  private config: ExternalSignalsConfig
  private cache: Map<string, { data: DemandFeatures; expiresAt: Date }> = new Map()

  constructor(config?: ExternalSignalsConfig) {
    this.config = {
      weatherApiKey: config?.weatherApiKey || process.env.WEATHER_API_KEY,
      weatherApiUrl: config?.weatherApiUrl || "https://api.openweathermap.org/data/2.5",
      cacheTTLMinutes: config?.cacheTTLMinutes || 15,
    }
  }

  /**
   * Fetch weather multiplier from OpenWeatherMap/WeatherAPI
   * Evaluates heavy rain, thunderstorms, or extreme heat flags
   */
  async fetchWeatherMultiplier(lat: number, lon: number): Promise<{
    condition: WeatherCondition
    multiplier: number
  }> {
    try {
      if (!this.config.weatherApiKey) {
        // Return default if no API key
        return {
          condition: {
            condition: "unknown",
            temperature: 25,
            humidity: 60,
            windSpeed: 5,
            rainfall: 0,
            isSevere: false,
          },
          multiplier: 1.0,
        }
      }

      const url = `${this.config.weatherApiUrl}/weather?lat=${lat}&lon=${lon}&appid=${this.config.weatherApiKey}&units=metric`

      const response = await fetch(url)
      const data = await response.json()

      const weatherCondition: WeatherCondition = {
        condition: data.weather?.[0]?.main || "unknown",
        temperature: data.main?.temp || 25,
        humidity: data.main?.humidity || 60,
        windSpeed: data.wind?.speed || 5,
        rainfall: data.rain?.["1h"] || data.snow?.["1h"] || 0,
        isSevere: this.isSevereWeather(data),
      }

      const multiplier = this.calculateWeatherMultiplier(weatherCondition)

      return {
        condition: weatherCondition,
        multiplier,
      }
    } catch (error) {
      console.error("Weather API error:", error)
      // Return default on error
      return {
        condition: {
          condition: "unknown",
          temperature: 25,
          humidity: 60,
          windSpeed: 5,
          rainfall: 0,
          isSevere: false,
        },
        multiplier: 1.0,
      }
    }
  }

  /**
   * Determine if weather is severe
   */
  private isSevereWeather(data: any): boolean {
    const condition = data.weather?.[0]?.main?.toLowerCase() || ""
    const rain = data.rain?.["1h"] || 0
    const snow = data.snow?.["1h"] || 0
    const wind = data.wind?.speed || 0

    // Severe conditions
    return (
      condition.includes("thunderstorm") ||
      condition.includes("storm") ||
      rain > 10 || // Heavy rain
      snow > 5 || // Heavy snow
      wind > 15 // High wind
    )
  }

  /**
   * Calculate weather-based demand multiplier
   */
  private calculateWeatherMultiplier(condition: WeatherCondition): number {
    const { condition: weatherType, temperature, rainfall, isSevere } = condition

    // Heavy rain increases parking demand (people prefer indoor/parked transport)
    if (rainfall > 10 || isSevere) {
      return 1.25
    }

    // Moderate rain
    if (rainfall > 5) {
      return 1.15
    }

    // Extreme heat increases demand for shaded parking
    if (temperature > 35) {
      return 1.10
    }

    // Normal weather
    return 1.0
  }

  /**
   * Fetch event demand multiplier from event database
   * Cross-references current date against events (IPL matches, holidays)
   */
  async fetchEventDemandMultiplier(lotId: string, timestamp: Date): Promise<{
    event: EventInfo | null
    multiplier: number
  }> {
    try {
      // Get parking lot location
      const lot = await prisma.parkinglot.findUnique({
        where: { id: lotId },
        select: {
          id: true,
          lat: true,
          lng: true,
          name: true,
        },
      })

      if (!lot) {
        return {
          event: null,
          multiplier: 1.0,
        }
      }

      // Check for events in database
      const now = timestamp
      const events = await prisma.event.findMany({
        where: {
          OR: [
            {
              startTime: { lte: now },
              endTime: { gte: now },
            },
            {
              AND: [
                { startTime: { gte: now } },
                { startTime: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) } }
              ], // Next 24 hours
            },
          ],
        },
        orderBy: { startTime: "asc" },
      })

      if (!events || events.length === 0) {
        return {
          event: null,
          multiplier: 1.0,
        }
      }

      // Find highest impact event
      const highestImpactEvent = events.reduce((max, event) =>
        event.surgeMultiplier > max.surgeMultiplier ? event : max
      )

      const eventInfo: EventInfo = {
        eventId: highestImpactEvent.id,
        name: highestImpactEvent.name,
        venue: highestImpactEvent.description || "Unknown",
        startTime: highestImpactEvent.startTime,
        endTime: highestImpactEvent.endTime,
        impactScore: highestImpactEvent.surgeMultiplier,
        eventType: "SPECIAL_EVENT" as any,
      }

      return {
        event: eventInfo,
        multiplier: eventInfo.impactScore,
      }
    } catch (error) {
      console.error("Event database error:", error)
      // Return default if Event model doesn't exist yet
      return {
        event: null,
        multiplier: 1.0,
      }
    }
  }

  /**
   * Calculate time-of-day multiplier
   */
  private calculateTimeOfDayMultiplier(timestamp: Date): number {
    const hour = timestamp.getHours()

    // Peak hours (9 AM - 12 PM, 5 PM - 8 PM)
    if ((hour >= 9 && hour < 12) || (hour >= 17 && hour < 20)) {
      return 1.15
    }

    // Normal hours
    if ((hour >= 7 && hour < 9) || (hour >= 12 && hour < 17) || (hour >= 20 && hour < 22)) {
      return 1.05
    }

    // Off-peak hours
    return 1.0
  }

  /**
   * Get combined contextual features
   * Aggregates weather, event, and time-of-day features
   */
  async getCombinedContextualFeatures(lotId: string): Promise<DemandFeatures> {
    const cacheKey = lotId
    const now = new Date()

    // Check cache
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return cached.data
    }

    // Get parking lot location
    const lot = await prisma.parkinglot.findUnique({
      where: { id: lotId },
      select: {
        id: true,
        lat: true,
        lng: true,
      },
    })

    if (!lot) {
      throw new Error("Parking lot not found")
    }

    // Fetch weather multiplier
    const weatherResult = await this.fetchWeatherMultiplier(lot.lat, lot.lng)

    // Fetch event multiplier
    const eventResult = await this.fetchEventDemandMultiplier(lotId, now)

    // Calculate time-of-day multiplier
    const timeOfDayMultiplier = this.calculateTimeOfDayMultiplier(now)

    // Calculate total demand multiplier
    const totalDemandMultiplier =
      weatherResult.multiplier *
      eventResult.multiplier *
      timeOfDayMultiplier

    const features: DemandFeatures = {
      lotId,
      weatherMultiplier: weatherResult.multiplier,
      eventMultiplier: eventResult.multiplier,
      timeOfDayMultiplier,
      totalDemandMultiplier,
      weatherCondition: weatherResult.condition,
      activeEvent: eventResult.event,
      cachedAt: now,
      cachedUntil: new Date(now.getTime() + this.config.cacheTTLMinutes! * 60 * 1000),
    }

    // Cache the result
    this.cache.set(cacheKey, {
      data: features,
      expiresAt: features.cachedUntil,
    })

    return features
  }

  /**
   * Clear cache for a specific lot
   */
  clearCache(lotId: string): void {
    this.cache.delete(lotId)
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const now = new Date()
    let valid = 0
    let expired = 0

    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt > now) {
        valid++
      } else {
        expired++
      }
    }

    return {
      total: this.cache.size,
      valid,
      expired,
    }
  }
}

// Singleton instance
const externalSignalAggregator = new ExternalSignalAggregator()

/**
 * Get combined contextual features
 */
export async function getCombinedContextualFeatures(lotId: string): Promise<DemandFeatures> {
  return await externalSignalAggregator.getCombinedContextualFeatures(lotId)
}

/**
 * Fetch weather multiplier
 */
export async function fetchWeatherMultiplier(lat: number, lon: number) {
  return await externalSignalAggregator.fetchWeatherMultiplier(lat, lon)
}

/**
 * Fetch event demand multiplier
 */
export async function fetchEventDemandMultiplier(lotId: string, timestamp: Date) {
  return await externalSignalAggregator.fetchEventDemandMultiplier(lotId, timestamp)
}

/**
 * Clear cache
 */
export function clearSignalCache(lotId?: string): void {
  if (lotId) {
    externalSignalAggregator.clearCache(lotId)
  } else {
    externalSignalAggregator.clearAllCache()
  }
}

/**
 * Get cache statistics
 */
export function getSignalCacheStats() {
  return externalSignalAggregator.getCacheStats()
}

export { externalSignalAggregator }