const requestCache = new Map<string, Promise<any>>()
const responseCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30000 // 30 seconds

export async function optimizedFetch<T>(
  url: string,
  options?: RequestInit & { cache?: boolean; cacheTTL?: number }
): Promise<T> {
  const { cache = true, cacheTTL = CACHE_TTL, ...fetchOptions } = options || {}
  
  // Check cache
  if (cache) {
    const cached = responseCache.get(url)
    if (cached && Date.now() - cached.timestamp < cacheTTL) {
      return cached.data as T
    }
  }
  
  // Deduplicate concurrent requests
  const cacheKey = `${url}-${JSON.stringify(fetchOptions)}`
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey)
  }
  
  const request = fetch(url, fetchOptions)
    .then(res => res.json())
    .then(data => {
      if (cache) {
        responseCache.set(url, { data, timestamp: Date.now() })
      }
      requestCache.delete(cacheKey)
      return data
    })
    .catch(error => {
      requestCache.delete(cacheKey)
      throw error
    })
  
  requestCache.set(cacheKey, request)
  return request
}

export function clearCache() {
  responseCache.clear()
}

export function clearCacheEntry(url: string) {
  responseCache.delete(url)
}