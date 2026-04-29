// Simple in-memory cache with TTL support
// Can be upgraded to Redis for production

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class MemoryCache {
  private cache: Map<string, CacheEntry<unknown>>
  private cleanupInterval: NodeJS.Timeout | null

  constructor() {
    this.cache = new Map()
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  /**
   * Set a value in the cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlSeconds - Time to live in seconds (default: 300 = 5 minutes)
   */
  set<T>(key: string, value: T, ttlSeconds: number = 300): void {
    const expiresAt = Date.now() + ttlSeconds * 1000
    this.cache.set(key, { data: value, expiresAt })
  }

  /**
   * Get a value from the cache
   * @param key - Cache key
   * @returns Cached value or null if not found/expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) {
      return null
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  /**
   * Check if a key exists and is not expired
   * @param key - Cache key
   * @returns True if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) {
      return false
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  /**
   * Delete a key from the cache
   * @param key - Cache key
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    }
  }

  /**
   * Destroy the cache and cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.cache.clear()
  }
}

// Global cache instance
const globalCache = new MemoryCache()

// Cache TTL configurations (in seconds)
export const CACHE_TTL = {
  // OSINT data - cache for 15 minutes
  osint: 15 * 60,
  // DNS records - cache for 5 minutes  
  dns: 5 * 60,
  // Threat intel - cache for 30 minutes
  threatIntel: 30 * 60,
  // WHOIS data - cache for 1 hour
  whois: 60 * 60,
  // Subdomain data - cache for 10 minutes
  subdomains: 10 * 60,
  // API responses - cache for 2 minutes
  api: 2 * 60,
}

/**
 * Get or set cached value with factory function
 * @param key - Cache key
 * @param factory - Function to generate value if not cached
 * @param ttl - Time to live in seconds
 * @returns Cached or newly generated value
 */
export async function getOrSet<T>(
  key: string,
  factory: () => Promise<T>,
  ttl: number = CACHE_TTL.api
): Promise<T> {
  const cached = globalCache.get<T>(key)
  if (cached !== null) {
    return cached
  }

  const value = await factory()
  globalCache.set(key, value, ttl)
  return value
}

/**
 * Set a value in the cache
 */
export function setCache<T>(key: string, value: T, ttl: number = CACHE_TTL.api): void {
  globalCache.set(key, value, ttl)
}

/**
 * Get a value from the cache
 */
export function getCache<T>(key: string): T | null {
  return globalCache.get<T>(key)
}

/**
 * Check if a key exists in cache
 */
export function hasCache(key: string): boolean {
  return globalCache.has(key)
}

/**
 * Delete a key from cache
 */
export function deleteCache(key: string): void {
  globalCache.delete(key)
}

/**
 * Clear all cache
 */
export function clearCache(): void {
  globalCache.clear()
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return globalCache.getStats()
}

/**
 * Invalidate cache by pattern
 * @param pattern - Pattern to match (simple string inclusion)
 */
export function invalidateCachePattern(pattern: string): void {
  const stats = globalCache.getStats()
  stats.keys.forEach(key => {
    if (key.includes(pattern)) {
      globalCache.delete(key)
    }
  })
}

export { globalCache }