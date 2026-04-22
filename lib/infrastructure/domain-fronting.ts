import { z } from "zod"

export const DomainFrontingProvider = z.enum([
  "cloudflare",
  "aws-cloudfront", 
  "azure-frontdoor",
  "google-cloud-cdn",
  "fastly",
  "akamai"
])
export type DomainFrontingProvider = z.infer<typeof DomainFrontingProvider>

export const FrontingConfig = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: DomainFrontingProvider,
  domain: z.string().min(1),
  subdomain: z.string().min(1),
  targetHost: z.string().min(1),
  targetPort: z.number().int().min(1).max(65535),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1).max(10).default(5),
  healthCheckPath: z.string().default("/health"),
  customHeaders: z.record(z.string(), z.string()).optional(),
  rateLimit: z.object({
    requestsPerMinute: z.number().int().min(1).default(60),
    burstSize: z.number().int().min(1).default(10)
  }).optional(),
  geoRestrictions: z.object({
    allowedCountries: z.array(z.string()).optional(),
    blockedCountries: z.array(z.string()).optional()
  }).optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
})
export type FrontingConfig = z.infer<typeof FrontingConfig>

export class DomainFrontingManager {
  private configs: Map<string, FrontingConfig> = new Map()
  private healthStatus: Map<string, boolean> = new Map()

  /**
   * Add a new domain fronting configuration
   */
  addConfig(configData: Omit<FrontingConfig, "id" | "createdAt" | "updatedAt">): FrontingConfig {
    const config: FrontingConfig = {
      ...configData,
      id: `fronting-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    this.configs.set(config.id, config)
    this.performHealthCheck(config.id)
    
    return config
  }

  /**
   * Update domain fronting configuration
   */
  updateConfig(id: string, updates: Partial<FrontingConfig>): FrontingConfig | null {
    const config = this.configs.get(id)
    if (!config) return null

    const updatedConfig = { 
      ...config, 
      ...updates, 
      updatedAt: Date.now() 
    }
    
    this.configs.set(id, updatedConfig)
    return updatedConfig
  }

  /**
   * Remove domain fronting configuration
   */
  removeConfig(id: string): boolean {
    return this.configs.delete(id)
  }

  /**
   * Get the best domain fronting configuration for a request
   */
  selectConfig(targetCountry?: string, purpose: "c2" | "exfil" | "recon" = "c2"): FrontingConfig | null {
    const enabledConfigs = Array.from(this.configs.values())
      .filter(config => config.enabled)
      .filter(config => this.healthStatus.get(config.id) !== false)

    if (enabledConfigs.length === 0) return null

    // Filter by geographic restrictions
    let candidates = enabledConfigs
    if (targetCountry) {
      candidates = enabledConfigs.filter(config => {
        const geo = config.geoRestrictions
        if (!geo) return true
        
        if (geo.allowedCountries && !geo.allowedCountries.includes(targetCountry)) {
          return false
        }
        
        if (geo.blockedCountries && geo.blockedCountries.includes(targetCountry)) {
          return false
        }
        
        return true
      })
    }

    if (candidates.length === 0) return null

    // Sort by priority and return the best one
    candidates.sort((a, b) => b.priority - a.priority)
    return candidates[0]
  }

  /**
   * Generate Cloudflare Workers script for domain fronting
   */
  generateCloudflareWorker(config: FrontingConfig): string {
    return `
// Cloudflare Worker for Domain Fronting
// Generated for ${config.name}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Health check endpoint
  if (url.pathname === '${config.healthCheckPath}') {
    return new Response('OK', { status: 200 })
  }
  
  // Rate limiting check
  const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')
  if (await isRateLimited(clientIP)) {
    return new Response('Too Many Requests', { status: 429 })
  }
  
  // Geographic restrictions
  const country = request.cf?.country
  if (country && isGeoBlocked(country)) {
    return new Response('Forbidden', { status: 403 })
  }
  
  // Proxy request to target
  const targetUrl = \`https://${config.targetHost}:${config.targetPort}\${url.pathname}\${url.search}\`
  
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow'
  })
  
  // Add custom headers
  ${config.customHeaders ? Object.entries(config.customHeaders).map(([key, value]) => 
    `proxyRequest.headers.set('${key}', '${value}')`
  ).join('\n  ') : ''}
  
  try {
    const response = await fetch(proxyRequest)
    
    // Copy response but modify security headers
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
    
    // Add fronting headers
    newResponse.headers.set('X-Fronted-By', 'Cloudflare-Worker')
    newResponse.headers.set('X-Original-Host', config.targetHost)
    
    return newResponse
  } catch (error) {
    return new Response('Service Unavailable', { status: 503 })
  }
}

// Simple in-memory rate limiting (for production, use KV storage)
const rateLimitMap = new Map()

async function isRateLimited(clientIP) {
  if (!clientIP) return false
  
  const now = Date.now()
  const windowStart = now - 60000 // 1 minute window
  const key = clientIP
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, [])
  }
  
  const requests = rateLimitMap.get(key).filter(timestamp => timestamp > windowStart)
  
  if (requests.length >= ${config.rateLimit?.requestsPerMinute || 60}) {
    return true
  }
  
  requests.push(now)
  rateLimitMap.set(key, requests)
  
  // Clean up old entries
  setTimeout(() => {
    const oldRequests = rateLimitMap.get(key) || []
    const recentRequests = oldRequests.filter(timestamp => timestamp > windowStart)
    if (recentRequests.length === 0) {
      rateLimitMap.delete(key)
    } else {
      rateLimitMap.set(key, recentRequests)
    }
  }, 60000)
  
  return false
}

function isGeoBlocked(country) {
  const blockedCountries = ${config.geoRestrictions?.blockedCountries ? 
    JSON.stringify(config.geoRestrictions.blockedCountries) : '[]'}
  return blockedCountries.includes(country)
}
`
  }

  /**
   * Generate AWS CloudFront configuration
   */
  generateCloudFrontConfig(config: FrontingConfig) {
    return {
      DistributionConfig: {
        CallerReference: `${config.id}-${Date.now()}`,
        Comment: `Domain fronting for ${config.name}`,
        DefaultRootObject: "",
        Enabled: true,
        Origins: {
          Quantity: 1,
          Items: [{
            Id: "origin1",
            DomainName: `${config.targetHost}:${config.targetPort}`,
            CustomOriginConfig: {
              HTTPPort: config.targetPort,
              HTTPSPort: config.targetPort,
              OriginProtocolPolicy: "https-only"
            }
          }]
        },
        DefaultCacheBehavior: {
          TargetOriginId: "origin1",
          ViewerProtocolPolicy: "redirect-to-https",
          TrustedSigners: { Enabled: false, Quantity: 0 },
          ForwardedValues: {
            QueryString: true,
            Cookies: { Forward: "all" },
            Headers: {
              Quantity: config.customHeaders ? Object.keys(config.customHeaders).length : 0,
              Items: config.customHeaders ? Object.keys(config.customHeaders) : []
            }
          },
          MinTTL: 0,
          Compress: true
        },
        Aliases: {
          Quantity: 1,
          Items: [config.subdomain ? `${config.subdomain}.${config.domain}` : config.domain]
        },
        Restrictions: {
          GeoRestriction: {
            RestrictionType: config.geoRestrictions?.allowedCountries ? "whitelist" : "none",
            Quantity: config.geoRestrictions?.allowedCountries?.length || 0,
            Items: config.geoRestrictions?.allowedCountries || []
          }
        },
        ViewerCertificate: {
          CloudFrontDefaultCertificate: false,
          SSLSupportMethod: "sni-only",
          MinimumProtocolVersion: "TLSv1.2_2021"
        },
        PriceClass: "PriceClass_All"
      }
    }
  }

  /**
   * Perform health check on a domain fronting configuration
   */
  private async performHealthCheck(id: string): Promise<void> {
    const config = this.configs.get(id)
    if (!config) return

    try {
      const testUrl = `https://${config.subdomain ? `${config.subdomain}.${config.domain}` : config.domain}${config.healthCheckPath}`
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      
      const response = await fetch(testUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "DomainFronting-HealthCheck/1.0"
        }
      })
      
      clearTimeout(timeoutId)
      this.healthStatus.set(id, response.ok)
    } catch (error) {
      this.healthStatus.set(id, false)
    }
  }

  /**
   * Get all configurations
   */
  getAllConfigs(): FrontingConfig[] {
    return Array.from(this.configs.values())
  }

  /**
   * Get configurations by provider
   */
  getConfigsByProvider(provider: DomainFrontingProvider): FrontingConfig[] {
    return Array.from(this.configs.values()).filter(config => config.provider === provider)
  }

  /**
   * Get health status of all configurations
   */
  getHealthStatus(): Map<string, boolean> {
    return new Map(this.healthStatus)
  }

  /**
   * Perform health checks on all configurations
   */
  async performAllHealthChecks(): Promise<void> {
    const promises = Array.from(this.configs.keys()).map(id => this.performHealthCheck(id))
    await Promise.all(promises)
  }
}