import { fetchWithProxy } from './proxy-agent'
import { checkRateLimit } from './rate-limiter'
import { getOrSet, CACHE_TTL } from './cache'

interface HttpClientOptions extends RequestInit {
  rateLimitCategory?: 'osint' | 'threatIntel' | 'dns' | 'general'
  rateLimitIdentifier?: string
  useCache?: boolean
  cacheKey?: string
  cacheTtl?: number
  retries?: number
  timeout?: number
}

interface HttpResponse<T = unknown> {
  data: T
  status: number
  headers: Headers
  cached: boolean
}

/**
 * Enhanced HTTP client with proxy, rate limiting, caching, and retry logic
 */
export class HttpClient {
  private defaultIdentifier: string

  constructor(identifier: string = 'default') {
    this.defaultIdentifier = identifier
  }

  /**
   * Perform HTTP GET request with all features
   */
  async get<T = unknown>(
    url: string,
    options: HttpClientOptions = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'GET' })
  }

  /**
   * Perform HTTP POST request with all features
   */
  async post<T = unknown>(
    url: string,
    body?: unknown,
    options: HttpClientOptions = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  }

  /**
   * Perform HTTP request with all features
   */
  private async request<T = unknown>(
    url: string,
    options: HttpClientOptions = {}
  ): Promise<HttpResponse<T>> {
    const {
      rateLimitCategory = 'general',
      rateLimitIdentifier = this.defaultIdentifier,
      useCache = options.method === 'GET', // Only cache GET requests
      cacheKey,
      cacheTtl = CACHE_TTL.api,
      retries = 3,
      timeout = 30000,
      ...fetchOptions
    } = options

    // Check cache if enabled
    if (useCache) {
      const key = cacheKey || this.generateCacheKey(url, fetchOptions)
      const cached = await getOrSet(
        key,
        () => this.executeRequest<T>(url, fetchOptions, rateLimitCategory, rateLimitIdentifier, retries, timeout),
        cacheTtl
      )
      return {
        data: cached,
        status: 200,
        headers: new Headers(),
        cached: true,
      }
    }

    // Execute request without cache
    const data = await this.executeRequest<T>(
      url,
      fetchOptions,
      rateLimitCategory,
      rateLimitIdentifier,
      retries,
      timeout
    )

    return {
      data,
      status: 200,
      headers: new Headers(),
      cached: false,
    }
  }

  /**
   * Execute HTTP request with rate limiting and retry logic
   */
  private async executeRequest<T>(
    url: string,
    options: RequestInit,
    rateLimitCategory: HttpClientOptions['rateLimitCategory'],
    rateLimitIdentifier: string,
    retries: number,
    timeout: number
  ): Promise<T> {
    // Check rate limit
    if (rateLimitCategory) {
      await checkRateLimit(rateLimitCategory, rateLimitIdentifier)
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, {
          ...options,
          signal: AbortSignal.timeout(timeout),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        return data as T
      } catch (error) {
        lastError = error as Error
        
        // Don't retry on rate limits (429) or client errors (4xx)
        if (error instanceof Error && error.message.includes('429')) {
          throw error
        }

        // Don't retry on last attempt
        if (attempt === retries) {
          break
        }

        // Exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
      }
    }

    throw lastError || new Error('Request failed')
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    return fetchWithProxy(url, options)
  }

  /**
   * Generate cache key from URL and options
   */
  private generateCacheKey(url: string, options: RequestInit): string {
    const method = options.method || 'GET'
    const headers = JSON.stringify(options.headers || {})
    return `http:${method}:${url}:${headers}`
  }

  /**
   * Set default identifier for rate limiting
   */
  setIdentifier(identifier: string): void {
    this.defaultIdentifier = identifier
  }
}

// Create default HTTP client instance
export const httpClient = new HttpClient('default')

/**
 * Convenience function for GET requests
 */
export async function httpGet<T = unknown>(
  url: string,
  options: HttpClientOptions = {}
): Promise<HttpResponse<T>> {
  return httpClient.get<T>(url, options)
}

/**
 * Convenience function for POST requests
 */
export async function httpPost<T = unknown>(
  url: string,
  body?: unknown,
  options: HttpClientOptions = {}
): Promise<HttpResponse<T>> {
  return httpClient.post<T>(url, body, options)
}
