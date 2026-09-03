import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { queryParkingLots, transformToNUDMGeoJSON, type NUDMExportQuery } from "@/lib/nudm/schema-transformer"
import { checkRateLimit } from "@/lib/security/rate-limiter"

const nudmQuerySchema = z.object({
  city: z.string().optional(),
  ward_id: z.string().optional(),
  radius_km: z.number().positive().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

const API_KEY_HEADER = "X-API-Key"

/**
 * GET /api/nudm/parking
 * Secure open data export endpoint compliant with NUDM/IUDX specifications
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now()

  try {
    // Check API key authentication
    const apiKey = req.headers.get(API_KEY_HEADER)
    const isAuthenticated = await authenticateAPIKey(apiKey)

    if (!isAuthenticated) {
      // Apply rate limiting for public open-data tier
      const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
      const rateLimitResult = await checkRateLimit({
        key: `nudm_export_${ip}`,
        tier: "PUBLIC", // Use PUBLIC tier with 100 requests per minute
      })

      if (!rateLimitResult.allowed) {
        return NextResponse.json(
          {
            error: "Rate limit exceeded",
            retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
          },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": rateLimitResult.limit.toString(),
              "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
              "X-RateLimit-Reset": new Date(rateLimitResult.resetTime).toISOString(),
            },
          }
        )
      }
    }

    // Parse query parameters
    const searchParams = req.nextUrl.searchParams
    const validated = nudmQuerySchema.parse({
      city: searchParams.get("city") || undefined,
      ward_id: searchParams.get("ward_id") || undefined,
      radius_km: searchParams.get("radius_km") ? parseFloat(searchParams.get("radius_km")!) : undefined,
      lat: searchParams.get("lat") ? parseFloat(searchParams.get("lat")!) : undefined,
      lng: searchParams.get("lng") ? parseFloat(searchParams.get("lng")!) : undefined,
    })

    // Build query
    const query: NUDMExportQuery = {
      city: validated.city,
      wardId: validated.ward_id,
      radiusKm: validated.radius_km,
      lat: validated.lat,
      lng: validated.lng,
    }

    // Query parking lots by filters
    const lotIds = await queryParkingLots(query)

    if (lotIds.length === 0) {
      return NextResponse.json({
        type: "FeatureCollection",
        features: [],
        "@context": "https://nudm.gov.in/contexts/parking-v1.jsonld",
        metadata: {
          total: 0,
          query,
          timestamp: new Date().toISOString(),
          latency: Date.now() - startTime,
        },
      })
    }

    // Transform to NUDM GeoJSON
    const geoJSON = await transformToNUDMGeoJSON(lotIds)

    // Validate response latency (< 100ms target)
    const latency = Date.now() - startTime
    if (latency > 100) {
      console.warn(`NUDM export latency exceeded 100ms: ${latency}ms`)
    }

    // Return response with metadata
    return NextResponse.json({
      ...geoJSON,
      metadata: {
        total: lotIds.length,
        query,
        timestamp: new Date().toISOString(),
        latency,
        authenticated: isAuthenticated,
      },
    }, {
      headers: {
        "Cache-Control": "public, max-age=30", // 30-second cache for open data
        "X-Response-Time": latency.toString(),
      },
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.errors },
        { status: 400 }
      )
    }

    console.error("NUDM export error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * Authenticate API key
 */
async function authenticateAPIKey(apiKey: string | null): Promise<boolean> {
  if (!apiKey) {
    return false
  }

  // In production, validate against database
  // For now, check against environment variable
  const validKeys = (process.env.NUDM_API_KEYS || "").split(",").map(k => k.trim())
  return validKeys.includes(apiKey)
}