import Redis from "ioredis";
const REDIS_URL = process.env.REDIS_URL;
const IS_BUILD = process.env.NEXT_PHASE === 'phase-production-build';

let redisInstance: Redis | null = null;

export const getRedis = () => {
    if (redisInstance) return redisInstance;
    
    // During build or if no URL is provided, return a mock or handle gracefully
    if (IS_BUILD || !REDIS_URL) {
        console.warn("⚠️ Redis: Skipping connection (Build Mode or No REDIS_URL)");
        // Return a proxy that ignores calls to prevent crashing during build
        return new Proxy({}, {
            get: () => () => Promise.resolve(null)
        }) as unknown as Redis;
    }

    redisInstance = new Redis(REDIS_URL, {
        retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false, // Don't queue commands if disconnected
    });

    redisInstance.on("connect", () => {
        console.log("🟢 Redis connected");
    });

    redisInstance.on("error", (err) => {
        console.error("❌ Redis error:", err);
    });

    return redisInstance;
};

// For backwards compatibility with existing imports
export const redis = getRedis();

// Cache keys
export const CACHE_KEYS = {
  slotStatus: (lotSlug: string, slotNumber: number) => `slot:${lotSlug}:${slotNumber}`,
  lotSlots: (lotSlug: string) => `lot:${lotSlug}:slots`,
  slotBatch: "slot:batch:updates",
  slotPresence: (slotId: string) => `slot:${slotId}:presence`,
  lotPresence: (lotId: string) => `lot:${lotId}:presence`,
};

// Cache TTL in seconds
export const CACHE_TTL = {
  slotStatus: 10, // 10 seconds for individual slot
  lotSlots: 5,    // 5 seconds for lot data
  slotPresence: 300, // 5 minutes for slot presence data
  lotPresence: 300, // 5 minutes for lot presence data
};

export async function incrementRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ success: boolean, current: number }> {
    const current = await redis.incr(key);
    if (current === 1) {
        await redis.expire(key, windowSeconds);
    }
    return {
        success: current <= limit,
        current
    };
}

/**
 * Update slot presence in Redis for sensor fusion
 */
export async function updateSlotPresence(slotId: string, status: string, metadata?: Record<string, any>): Promise<void> {
    try {
        const key = CACHE_KEYS.slotPresence(slotId);
        const value = JSON.stringify({
            status,
            timestamp: new Date().toISOString(),
            ...metadata
        });
        await redis.setex(key, CACHE_TTL.slotPresence, value);
        console.log(`✅ Redis presence updated: slot ${slotId} -> ${status}`);
    } catch (error) {
        console.error(`❌ Failed to update Redis presence for slot ${slotId}:`, error);
        throw error;
    }
}

/**
 * Get slot presence from Redis
 */
export async function getSlotPresence(slotId: string): Promise<any | null> {
    try {
        const key = CACHE_KEYS.slotPresence(slotId);
        const value = await redis.get(key);
        if (value) {
            return JSON.parse(value);
        }
        return null;
    } catch (error) {
        console.error(`❌ Failed to get Redis presence for slot ${slotId}:`, error);
        return null;
    }
}

/**
 * Update lot presence in Redis for sensor fusion
 */
export async function updateLotPresence(lotId: string, activeSlots: number, totalSlots: number): Promise<void> {
    try {
        const key = CACHE_KEYS.lotPresence(lotId);
        const value = JSON.stringify({
            activeSlots,
            totalSlots,
            occupancyRate: activeSlots / totalSlots,
            timestamp: new Date().toISOString()
        });
        await redis.setex(key, CACHE_TTL.lotPresence, value);
        console.log(`✅ Redis lot presence updated: lot ${lotId} (${activeSlots}/${totalSlots})`);
    } catch (error) {
        console.error(`❌ Failed to update Redis presence for lot ${lotId}:`, error);
        throw error;
    }
}

/**
 * Get lot presence from Redis
 */
export async function getLotPresence(lotId: string): Promise<any | null> {
    try {
        const key = CACHE_KEYS.lotPresence(lotId);
        const value = await redis.get(key);
        if (value) {
            return JSON.parse(value);
        }
        return null;
    } catch (error) {
        console.error(`❌ Failed to get Redis presence for lot ${lotId}:`, error);
        return null;
    }
}

export default redis;
