// In-memory sliding window rate limiter
// For production, this should use Redis/Upstash for distributed scenarios

interface RateLimitEntry {
  count: number
  resetTime: number
}

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map()
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Clean up expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 60000)
  }

  /**
   * Check if request is within rate limit
   * @param key - Unique identifier (IP address, user ID, etc.)
   * @param limit - Maximum requests allowed
   * @param windowSeconds - Time window in seconds
   */
  checkRateLimit({
    key,
    limit,
    windowSeconds,
  }: {
    key: string
    limit: number
    windowSeconds: number
  }): {
    allowed: boolean
    remaining: number
    resetTime: number
  } {
    const now = Date.now()
    const windowMs = windowSeconds * 1000
    const entry = this.store.get(key)

    if (!entry || now >= entry.resetTime) {
      // Create new entry or reset expired entry
      const newEntry: RateLimitEntry = {
        count: 1,
        resetTime: now + windowMs,
      }
      this.store.set(key, newEntry)
      return {
        allowed: true,
        remaining: limit - 1,
        resetTime: newEntry.resetTime,
      }
    }

    // Update existing entry
    if (entry.count < limit) {
      entry.count++
      this.store.set(key, entry)
      return {
        allowed: true,
        remaining: limit - entry.count,
        resetTime: entry.resetTime,
      }
    }

    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetTime) {
        this.store.delete(key)
      }
    }
  }

  /**
   * Reset rate limit for a specific key (for testing or admin override)
   */
  reset(key: string): void {
    this.store.delete(key)
  }

  /**
   * Get current status for a key
   */
  getStatus(key: string): RateLimitEntry | undefined {
    return this.store.get(key)
  }

  /**
   * Shutdown cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval)
    this.store.clear()
  }
}

// Singleton instance
const rateLimiter = new RateLimiter()

// Rate limit tiers
export const RATE_LIMIT_TIERS = {
  AUTH: { limit: 10, windowSeconds: 60 }, // 10 requests per minute
  BOOKING_PAYMENT: { limit: 30, windowSeconds: 60 }, // 30 requests per minute
  PUBLIC: { limit: 100, windowSeconds: 60 }, // 100 requests per minute
  HARDWARE_WEBHOOK: { limit: 1000, windowSeconds: 60 }, // High limit for IoT
  ADMIN: { limit: 200, windowSeconds: 60 }, // 200 requests per minute
} as const

/**
 * Check rate limit for a given key and tier
 */
export function checkRateLimit({
  key,
  tier,
}: {
  key: string
  tier: keyof typeof RATE_LIMIT_TIERS
}): {
  allowed: boolean
  remaining: number
  resetTime: number
  limit: number
  windowSeconds: number
} {
  const config = RATE_LIMIT_TIERS[tier]
  const result = rateLimiter.checkRateLimit({
    key,
    limit: config.limit,
    windowSeconds: config.windowSeconds,
  })

  return {
    ...result,
    limit: config.limit,
    windowSeconds: config.windowSeconds,
  }
}

/**
 * Generate rate limit headers for response
 */
export function getRateLimitHeaders(result: {
  limit: number
  remaining: number
  resetTime: number
}): {
  "X-RateLimit-Limit": string
  "X-RateLimit-Remaining": string
  "X-RateLimit-Reset": string
} {
  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": new Date(result.resetTime).toISOString(),
  }
}

/**
 * Middleware function to apply rate limiting
 */
export function applyRateLimit(
  req: Request,
  tier: keyof typeof RATE_LIMIT_TIERS
): {
  allowed: boolean
  headers?: Record<string, string>
  error?: { status: number; message: string }
} {
  // Get IP address from request
  const ip = req.headers.get("x-forwarded-for") || 
             req.headers.get("x-real-ip") || 
             "unknown"

  // Get user ID from header if available (for user-based limiting)
  const userId = req.headers.get("x-user-id")
  const key = userId ? `user:${userId}` : `ip:${ip}`

  const result = checkRateLimit({ key, tier })

  if (!result.allowed) {
    return {
      allowed: false,
      error: {
        status: 429,
        message: `Rate limit exceeded. Try again in ${Math.ceil((result.resetTime - Date.now()) / 1000)} seconds.`,
      },
    }
  }

  return {
    allowed: true,
    headers: getRateLimitHeaders(result),
  }
}

export { rateLimiter }