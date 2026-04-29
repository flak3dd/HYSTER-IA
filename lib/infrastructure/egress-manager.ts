/* eslint-disable @typescript-eslint/no-unused-vars */
import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { z } from "zod"

export const EgressNodeStatus = z.enum([
  "online",
  "offline", 
  "degraded",
  "maintenance",
  "banned"
])
export type EgressNodeStatus = z.infer<typeof EgressNodeStatus>

export const EgressNode = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hostname: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["socks5", "http", "socks5h"]),
  region: z.string().max(60),
  provider: z.string().max(120),
  bandwidth: z.object({
    up: z.string(),
    down: z.string()
  }),
  status: EgressNodeStatus.default("offline"),
  lastHealthCheck: z.number().int().nullable().default(null),
  latency: z.number().int().nullable().default(null),
  successRate: z.number().min(0).max(100).default(0),
  totalRequests: z.number().int().default(0),
  failedRequests: z.number().int().default(0),
  tags: z.array(z.string().max(40)).default([]),
  priority: z.number().int().min(1).max(10).default(5),
  maxConcurrent: z.number().int().min(1).default(100),
  currentLoad: z.number().int().default(0),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
})
export type EgressNode = z.infer<typeof EgressNode>

export const ProxyRotationStrategy = z.enum([
  "round-robin",
  "random",
  "weighted",
  "least-latency",
  "least-load",
  "geographic"
])
export type ProxyRotationStrategy = z.infer<typeof ProxyRotationStrategy>

export interface EgressManagerConfig {
  healthCheckInterval: number // milliseconds
  healthCheckTimeout: number  // milliseconds
  maxRetries: number
  rotationStrategy: ProxyRotationStrategy
  geographicPreferences: string[] // preferred regions
  bannedProviders: string[]
  loadBalancing: boolean
}

export class EgressManager extends EventEmitter {
  private nodes: Map<string, EgressNode> = new Map()
  private config: EgressManagerConfig
  private healthCheckTimer?: NodeJS.Timeout
  private requestCounts: Map<string, number> = new Map()

  constructor(config: EgressManagerConfig) {
    super()
    this.config = config
    this.startHealthChecks()
  }

  /**
   * Add a new egress node to the pool
   */
  addNode(nodeData: Omit<EgressNode, "id" | "createdAt" | "updatedAt">): EgressNode {
    const node: EgressNode = {
      ...nodeData,
      id: randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    this.nodes.set(node.id, node)
    this.emit("nodeAdded", node)
    this.performHealthCheck(node.id)
    
    return node
  }

  /**
   * Remove an egress node from the pool
   */
  removeNode(nodeId: string): boolean {
    const node = this.nodes.get(nodeId)
    if (!node) return false

    this.nodes.delete(nodeId)
    this.emit("nodeRemoved", node)
    return true
  }

  /**
   * Update node configuration
   */
  updateNode(nodeId: string, updates: Partial<EgressNode>): EgressNode | null {
    const node = this.nodes.get(nodeId)
    if (!node) return null

    const updatedNode = { 
      ...node, 
      ...updates, 
      updatedAt: Date.now() 
    }
    
    this.nodes.set(nodeId, updatedNode)
    this.emit("nodeUpdated", updatedNode)
    return updatedNode
  }

  /**
   * Get the best egress node based on current strategy
   */
  selectNode(purpose: "llm" | "web" | "exfil", targetRegion?: string): EgressNode | null {
    const availableNodes = Array.from(this.nodes.values())
      .filter(node => node.status === "online")
      .filter(node => node.currentLoad < node.maxConcurrent)
      .filter(node => !this.config.bannedProviders.includes(node.provider))

    if (availableNodes.length === 0) return null

    // Apply geographic preferences
    let candidates = availableNodes
    if (targetRegion && this.config.geographicPreferences.includes(targetRegion)) {
      const regionalNodes = availableNodes.filter(node => node.region === targetRegion)
      if (regionalNodes.length > 0) candidates = regionalNodes
    }

    // Apply rotation strategy
    switch (this.config.rotationStrategy) {
      case "round-robin":
        return this.selectRoundRobin(candidates)
      case "random":
        return this.selectRandom(candidates)
      case "weighted":
        return this.selectWeighted(candidates)
      case "least-latency":
        return this.selectLeastLatency(candidates)
      case "least-load":
        return this.selectLeastLoad(candidates)
      case "geographic":
        return this.selectGeographic(candidates, targetRegion)
      default:
        return candidates[0]
    }
  }

  private selectRoundRobin(nodes: EgressNode[]): EgressNode {
    const requestId = Date.now().toString()
    const index = parseInt(requestId, 10) % nodes.length
    return nodes[index]
  }

  private selectRandom(nodes: EgressNode[]): EgressNode {
    return nodes[Math.floor(Math.random() * nodes.length)]
  }

  private selectWeighted(nodes: EgressNode[]): EgressNode {
    const totalWeight = nodes.reduce((sum, node) => sum + node.priority, 0)
    let random = Math.random() * totalWeight
    
    for (const node of nodes) {
      random -= node.priority
      if (random <= 0) return node
    }
    
    return nodes[0]
  }

  private selectLeastLatency(nodes: EgressNode[]): EgressNode {
    return nodes.reduce((best, node) => {
      if (!best || (node.latency && best.latency && node.latency < best.latency)) {
        return node
      }
      return best
    })
  }

  private selectLeastLoad(nodes: EgressNode[]): EgressNode {
    return nodes.reduce((best, node) => {
      const loadPercent = (node.currentLoad / node.maxConcurrent) * 100
      const bestLoadPercent = (best.currentLoad / best.maxConcurrent) * 100
      
      if (loadPercent < bestLoadPercent) return node
      return best
    })
  }

  private selectGeographic(nodes: EgressNode[], targetRegion?: string): EgressNode {
    if (!targetRegion) return this.selectRandom(nodes)
    
    const regionalNodes = nodes.filter(node => node.region === targetRegion)
    if (regionalNodes.length > 0) return this.selectRandom(regionalNodes)
    
    return this.selectRandom(nodes)
  }

  /**
   * Record a request outcome for statistics
   */
  recordRequest(nodeId: string, success: boolean, latency?: number): void {
    const node = this.nodes.get(nodeId)
    if (!node) return

    const totalRequests = node.totalRequests + 1
    const failedRequests = success ? node.failedRequests : node.failedRequests + 1
    const successRate = ((totalRequests - failedRequests) / totalRequests) * 100

    this.updateNode(nodeId, {
      totalRequests,
      failedRequests,
      successRate,
      latency: latency || node.latency
    })

    // Update node status based on performance
    if (successRate < 50 && totalRequests > 10) {
      this.updateNode(nodeId, { status: "degraded" })
    } else if (successRate > 80 && node.status === "degraded") {
      this.updateNode(nodeId, { status: "online" })
    }
  }

  /**
   * Perform health check on a specific node
   */
  private async performHealthCheck(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId)
    if (!node) return

    try {
      const startTime = Date.now()
      
      // Simple connectivity test
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.healthCheckTimeout)
      
      const response = await fetch(`http://${node.hostname}:${node.port}/health`, {
        method: "GET",
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      const latency = Date.now() - startTime
      
      if (response.ok) {
        this.updateNode(nodeId, {
          status: "online",
          lastHealthCheck: Date.now(),
          latency
        })
      } else {
        this.updateNode(nodeId, {
          status: "degraded",
          lastHealthCheck: Date.now()
        })
      }
    } catch (error) {
      this.updateNode(nodeId, {
        status: "offline",
        lastHealthCheck: Date.now()
      })
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      for (const nodeId of this.nodes.keys()) {
        this.performHealthCheck(nodeId)
      }
    }, this.config.healthCheckInterval)
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = undefined
    }
  }

  /**
   * Get all nodes
   */
  getAllNodes(): EgressNode[] {
    return Array.from(this.nodes.values())
  }

  /**
   * Get nodes by status
   */
  getNodesByStatus(status: EgressNodeStatus): EgressNode[] {
    return Array.from(this.nodes.values()).filter(node => node.status === status)
  }

  /**
   * Get nodes by region
   */
  getNodesByRegion(region: string): EgressNode[] {
    return Array.from(this.nodes.values()).filter(node => node.region === region)
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const nodes = Array.from(this.nodes.values())
    const online = nodes.filter(n => n.status === "online").length
    const totalRequests = nodes.reduce((sum, n) => sum + n.totalRequests, 0)
    const avgSuccessRate = nodes.reduce((sum, n) => sum + n.successRate, 0) / nodes.length

    return {
      totalNodes: nodes.length,
      onlineNodes: online,
      offlineNodes: nodes.filter(n => n.status === "offline").length,
      degradedNodes: nodes.filter(n => n.status === "degraded").length,
      totalRequests,
      averageSuccessRate: isNaN(avgSuccessRate) ? 0 : avgSuccessRate,
      regions: [...new Set(nodes.map(n => n.region))],
      providers: [...new Set(nodes.map(n => n.provider))]
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopHealthChecks()
    this.removeAllListeners()
    this.nodes.clear()
    this.requestCounts.clear()
  }
}