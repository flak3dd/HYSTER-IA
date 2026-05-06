import { NextResponse } from "next/server"
import { getOrSet, CACHE_TTL } from "./cache"

/**
 * Wrap a route handler with response caching.
 *
 * @param key - Cache key (use a stable identifier per route+params)
 * @param handler - Function that produces the response data
 * @param ttlSeconds - Cache TTL in seconds (default 60)
 */
export async function cachedJson<T>(
  key: string,
  handler: () => Promise<T>,
  ttlSeconds: number = 60,
): Promise<NextResponse> {
  const data = await getOrSet(key, handler, ttlSeconds)
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": `private, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 2}`,
    },
  })
}

/**
 * Build a cache key from a path and parameters.
 */
export function buildCacheKey(prefix: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${JSON.stringify(params[k])}`)
    .join("&")
  return `${prefix}:${sorted}`
}

export { CACHE_TTL }
