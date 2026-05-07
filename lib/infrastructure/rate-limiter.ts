import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible'
import Redis from 'ioredis'

// Rate limit configuration
const RATE_LIMIT_CONFIG = {
  // OSINT API calls - 30 requests per minute
  osint: {
    points: 30,
    duration: 60, // seconds
  },
  // Threat Intel feeds - 60 requests per minute  
  threatIntel: {
    points: 60,
    duration: 60,
  },
  // DNS queries - 100 requests per minute
  dns: {
    points: 100,
    duration: 60,
  },
  // General API calls - 20 requests per minute
  general: {
    points: 20,
    duration: 60,
  },
}

// Redis client (optional - falls back to memory if not configured)
const gRL = globalThis as typeof globalThis & { __rateLimiterRedis?: Redis | null }
let redisClient: Redis | null = gRL.__rateLimiterRedis ?? null

if (!redisClient && process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    })
    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err)
      redisClient = null
      gRL.__rateLimiterRedis = null
    })
    gRL.__rateLimiterRedis = redisClient
  } catch {
    console.warn('Failed to connect to Redis, falling back to memory rate limiting')
    redisClient = null
    gRL.__rateLimiterRedis = null
  }
}

// Create rate limiters
const rateLimiters: Record<string, RateLimiterMemory | RateLimiterRedis> = {}

Object.entries(RATE_LIMIT_CONFIG).forEach(([key, config]) => {
  if (redisClient) {
    rateLimiters[key] = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: `rate_limit:${key}`,
      points: config.points,
      duration: config.duration,
    })
  } else {
    rateLimiters[key] = new RateLimiterMemory({
      points: config.points,
      duration: config.duration,
    })
  }
})

/**
 * Check rate limit for a given category and identifier
 * @param category - Rate limit category (osint, threatIntel, dns, general)
 * @param identifier - Unique identifier (IP address, user ID, etc.)
 * @throws Error if rate limit exceeded
 */
export async function checkRateLimit(
  category: keyof typeof RATE_LIMIT_CONFIG,
  identifier: string
): Promise<void> {
  const rateLimiter = rateLimiters[category]
  if (!rateLimiter) {
    throw new Error(`Unknown rate limit category: ${category}`)
  }

  try {
    await rateLimiter.consume(identifier)
  } catch (rateLimiterRes) {
    const result = rateLimiterRes as { remainingPoints?: number; msBeforeNext?: number }
    const remainingPoints = result.remainingPoints || 0
    const msBeforeNext = result.msBeforeNext || 0
    
    throw new Error(
      `Rate limit exceeded for ${category}. ${remainingPoints} points remaining. Try again in ${Math.ceil(msBeforeNext / 1000)} seconds.`
    )
  }
}

/**
 * Get rate limit info for a category and identifier
 * @param category - Rate limit category
 * @param identifier - Unique identifier
 * @returns Rate limit status
 */
export async function getRateLimitInfo(
  category: keyof typeof RATE_LIMIT_CONFIG,
  identifier: string
): Promise<{ remaining: number; resetTime: Date }> {
  const rateLimiter = rateLimiters[category]
  if (!rateLimiter) {
    throw new Error(`Unknown rate limit category: ${category}`)
  }

  const res = await rateLimiter.get(identifier)
  return {
    remaining: res?.remainingPoints || RATE_LIMIT_CONFIG[category].points,
    resetTime: new Date(Date.now() + (res?.msBeforeNext || 0)),
  }
}

/**
 * Reset rate limit for a category and identifier (admin only)
 * @param category - Rate limit category
 * @param identifier - Unique identifier
 */
export async function resetRateLimit(
  category: keyof typeof RATE_LIMIT_CONFIG,
  identifier: string
): Promise<void> {
  const rateLimiter = rateLimiters[category]
  if (!rateLimiter) {
    throw new Error(`Unknown rate limit category: ${category}`)
  }

  await rateLimiter.delete(identifier)
}

export { RATE_LIMIT_CONFIG }
