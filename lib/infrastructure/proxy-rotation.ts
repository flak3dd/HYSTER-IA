/* eslint-disable @typescript-eslint/no-unused-vars */
import { EventEmitter } from "node:events"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { EgressNode } from "./egress-manager"

export const RotationStrategy = z.enum([
  "round-robin",
  "random",
  "weighted",
  "least-connections",
  "least-latency",
  "geographic",
  "adaptive",
  "sticky-session"
])
export type RotationStrategy = z.infer<typeof RotationStrategy>

export const RotationPolicy = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  strategy: RotationStrategy,
  nodePool: z.array(z.string()),
  weights: z.record(z.string(), z.number().min(0).max(1)).optional(),
  geographicPreferences: z.array(z.string()).optional(),
  healthCheckThreshold: z.number().min(0).max(1).default(0.8),
  maxRetries: z.number().int().min(1).default(3),
  backoffMultiplier: z.number().min(1).default(2),
  sessionAffinity: z.boolean().default(false),
  adaptiveThresholds: z.object({
    errorRate: z.number().min(0).max(1).default(0.1),
    latencyThreshold: z.number().int().default(5000),
    connectionThreshold: z.number().int().default(100)
  }).optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
})
export type RotationPolicy = z.infer<typeof RotationPolicy>

export interface ProxyRotationContext {
  sessionId?: string
  sourceCountry?: string
  targetHost?: string
  purpose: "llm" | "web" | "exfil" | "c2"
  timestamp: number
}

export interface RotationResult {
  nodeId: string
  policyId: string
  strategy: RotationStrategy
  selectedAt: number
  retryCount?: number
  metadata?: Record<string, unknown>
}

export class ProxyRotationEngine extends EventEmitter {
  private policies: Map<string, RotationPolicy> = new Map()
  private currentIndices: Map<string, number> = new Map()
  private sessionAffinity: Map<string, string> = new Map()
  private nodeStats: Map<string, {
    connections: number
    totalRequests: number
    failedRequests: number
    avgLatency: number
    lastUsed: number
    healthScore: number
  }> = new Map()

  constructor() {
    super()
    this.startStatsCleanup()
  }

  /**
   * Add a new rotation policy
   */
  addPolicy(policyData: Omit<RotationPolicy, "id" | "createdAt" | "updatedAt">): RotationPolicy {
    const policy: RotationPolicy = {
      ...policyData,
      id: randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    this.policies.set(policy.id, policy)
    this.currentIndices.set(policy.id, 0)
    
    // Initialize node stats
    for (const nodeId of policy.nodePool) {
      if (!this.nodeStats.has(nodeId)) {
        this.nodeStats.set(nodeId, {
          connections: 0,
          totalRequests: 0,
          failedRequests: 0,
          avgLatency: 0,
          lastUsed: 0,
          healthScore: 1.0
        })
      }
    }

    this.emit("policyAdded", policy)
    return policy
  }

  /**
   * Select the best proxy node based on rotation policy and context
   */
  selectProxy(
    policyId: string,
    context: ProxyRotationContext,
    availableNodes: EgressNode[]
  ): RotationResult | null {
    const policy = this.policies.get(policyId)
    if (!policy) {
      this.emit("error", { message: "Policy not found", policyId })
      return null
    }

    // Filter available nodes based on policy node pool
    const candidateNodes = availableNodes.filter(node => 
      policy.nodePool.includes(node.id) && node.status === "online"
    )

    if (candidateNodes.length === 0) {
      this.emit("error", { message: "No available nodes", policyId })
      return null
    }

    // Apply session affinity if enabled
    if (policy.sessionAffinity && context.sessionId) {
      const affinityNode = this.sessionAffinity.get(context.sessionId)
      if (affinityNode && candidateNodes.find(n => n.id === affinityNode)) {
        return {
          nodeId: affinityNode,
          policyId,
          strategy: policy.strategy,
          selectedAt: Date.now(),
          metadata: { source: "session-affinity" }
        }
      }
    }

    // Select node based on strategy
    const selectedNode = this.selectNodeByStrategy(policy, candidateNodes, context)
    if (!selectedNode) return null

    // Update session affinity
    if (policy.sessionAffinity && context.sessionId) {
      this.sessionAffinity.set(context.sessionId, selectedNode.id)
    }

    // Update node stats
    this.updateNodeStats(selectedNode.id, "selected")

    const result: RotationResult = {
      nodeId: selectedNode.id,
      policyId,
      strategy: policy.strategy,
      selectedAt: Date.now(),
      metadata: this.getSelectionMetadata(policy, selectedNode, context)
    }

    this.emit("proxySelected", result)
    return result
  }

  /**
   * Select node based on rotation strategy
   */
  private selectNodeByStrategy(
    policy: RotationPolicy,
    nodes: EgressNode[],
    context: ProxyRotationContext
  ): EgressNode | null {
    switch (policy.strategy) {
      case "round-robin":
        return this.selectRoundRobin(policy, nodes)
      case "random":
        return this.selectRandom(nodes)
      case "weighted":
        return this.selectWeighted(policy, nodes)
      case "least-connections":
        return this.selectLeastConnections(nodes)
      case "least-latency":
        return this.selectLeastLatency(nodes)
      case "geographic":
        return this.selectGeographic(policy, nodes, context.sourceCountry)
      case "adaptive":
        return this.selectAdaptive(policy, nodes, context)
      case "sticky-session":
        return this.selectStickySession(policy, nodes, context)
      default:
        return nodes[0]
    }
  }

  private selectRoundRobin(policy: RotationPolicy, nodes: EgressNode[]): EgressNode {
    const currentIndex = this.currentIndices.get(policy.id) || 0
    const selectedNode = nodes[currentIndex % nodes.length]
    this.currentIndices.set(policy.id, currentIndex + 1)
    return selectedNode
  }

  private selectRandom(nodes: EgressNode[]): EgressNode {
    return nodes[Math.floor(Math.random() * nodes.length)]
  }

  private selectWeighted(policy: RotationPolicy, nodes: EgressNode[]): EgressNode {
    const weights = policy.weights || {}
    const totalWeight = nodes.reduce((sum, node) => sum + (weights[node.id] || 1), 0)
    let random = Math.random() * totalWeight

    for (const node of nodes) {
      random -= weights[node.id] || 1
      if (random <= 0) return node
    }

    return nodes[0]
  }

  private selectLeastConnections(nodes: EgressNode[]): EgressNode {
    return nodes.reduce((best, node) => {
      const bestConnections = this.nodeStats.get(best.id)?.connections || 0
      const nodeConnections = this.nodeStats.get(node.id)?.connections || 0
      return nodeConnections < bestConnections ? node : best
    })
  }

  private selectLeastLatency(nodes: EgressNode[]): EgressNode {
    return nodes.reduce((best, node) => {
      const bestLatency = this.nodeStats.get(best.id)?.avgLatency || Infinity
      const nodeLatency = this.nodeStats.get(node.id)?.avgLatency || Infinity
      return nodeLatency < bestLatency ? node : best
    })
  }

  private selectGeographic(
    policy: RotationPolicy,
    nodes: EgressNode[],
    sourceCountry?: string
  ): EgressNode {
    if (!sourceCountry || !policy.geographicPreferences) {
      return this.selectRandom(nodes)
    }

    const preferredNodes = nodes.filter(node => 
      policy.geographicPreferences!.includes(node.region)
    )

    return preferredNodes.length > 0 ? this.selectRandom(preferredNodes) : this.selectRandom(nodes)
  }

  private selectAdaptive(
    policy: RotationPolicy,
    nodes: EgressNode[],
    context: ProxyRotationContext
  ): EgressNode {
    const thresholds = policy.adaptiveThresholds
    if (!thresholds) {
      return this.selectLeastLatency(nodes)
    }

    // Calculate health scores for each node
    const scoredNodes = nodes.map(node => {
      const stats = this.nodeStats.get(node.id) || {
        connections: 0, totalRequests: 0, failedRequests: 0,
        avgLatency: 0, lastUsed: 0, healthScore: 1.0
      }

      let score = 1.0

      // Error rate penalty
      if (stats.totalRequests > 0) {
        const errorRate = stats.failedRequests / stats.totalRequests
        if (errorRate > thresholds.errorRate) {
          score *= 0.5
        }
      }

      // Latency penalty
      if (stats.avgLatency > thresholds.latencyThreshold) {
        score *= 0.7
      }

      // Connection load penalty
      if (stats.connections > thresholds.connectionThreshold) {
        score *= 0.8
      }

      return { node, score }
    })

    // Select node with highest score
    scoredNodes.sort((a, b) => b.score - a.score)
    return scoredNodes[0].node
  }

  private selectStickySession(
    policy: RotationPolicy,
    nodes: EgressNode[],
    context: ProxyRotationContext
  ): EgressNode {
    if (context.sessionId) {
      const affinityNode = this.sessionAffinity.get(context.sessionId)
      const node = nodes.find(n => n.id === affinityNode)
      if (node) return node
    }

    // Fallback to round-robin for new sessions
    return this.selectRoundRobin(policy, nodes)
  }

  /**
   * Record request result for adaptive algorithms
   */
  recordResult(
    nodeId: string,
    success: boolean,
    latency?: number,
    error?: string
  ): void {
    const stats = this.nodeStats.get(nodeId)
    if (!stats) return

    stats.totalRequests++
    stats.lastUsed = Date.now()

    if (success) {
      if (latency) {
        // Update moving average latency
        stats.avgLatency = (stats.avgLatency * 0.9) + (latency * 0.1)
      }
    } else {
      stats.failedRequests++
    }

    // Update health score
    const errorRate = stats.failedRequests / stats.totalRequests
    stats.healthScore = Math.max(0.1, 1.0 - errorRate)

    this.emit("resultRecorded", { nodeId, success, latency, error, stats })
  }

  /**
   * Update node statistics
   */
  private updateNodeStats(nodeId: string, action: "selected" | "connected" | "disconnected"): void {
    const stats = this.nodeStats.get(nodeId)
    if (!stats) return

    switch (action) {
      case "selected":
        // Selection is already tracked in recordResult
        break
      case "connected":
        stats.connections++
        break
      case "disconnected":
        stats.connections = Math.max(0, stats.connections - 1)
        break
    }
  }

  /**
   * Get selection metadata
   */
  private getSelectionMetadata(
    policy: RotationPolicy,
    node: EgressNode,
    context: ProxyRotationContext
  ): Record<string, unknown> {
    const stats = this.nodeStats.get(node.id)
    
    return {
      nodeRegion: node.region,
      nodeProvider: node.provider,
      nodeHealthScore: stats?.healthScore || 1.0,
      nodeConnections: stats?.connections || 0,
      nodeAvgLatency: stats?.avgLatency || 0,
      sourceCountry: context.sourceCountry,
      purpose: context.purpose,
      timestamp: Date.now()
    }
  }

  /**
   * Get rotation statistics
   */
  getStatistics() {
    const policies = Array.from(this.policies.values())
    const totalNodes = this.nodeStats.size
    const totalConnections = Array.from(this.nodeStats.values())
      .reduce((sum, stats) => sum + stats.connections, 0)
    const totalRequests = Array.from(this.nodeStats.values())
      .reduce((sum, stats) => sum + stats.totalRequests, 0)
    const totalFailures = Array.from(this.nodeStats.values())
      .reduce((sum, stats) => sum + stats.failedRequests, 0)

    const avgHealthScore = Array.from(this.nodeStats.values())
      .reduce((sum, stats) => sum + stats.healthScore, 0) / totalNodes || 0

    const strategyCounts = policies.reduce((acc, policy) => {
      acc[policy.strategy] = (acc[policy.strategy] || 0) + 1
      return acc
    }, {} as Record<RotationStrategy, number>)

    return {
      totalPolicies: policies.length,
      totalNodes,
      totalConnections,
      totalRequests,
      totalFailures,
      errorRate: totalRequests > 0 ? totalFailures / totalRequests : 0,
      avgHealthScore,
      activeSessions: this.sessionAffinity.size,
      strategyCounts
    }
  }

  /**
   * Get node statistics
   */
  getNodeStats(nodeId?: string) {
    if (nodeId) {
      return this.nodeStats.get(nodeId) || null
    }
    
    return Object.fromEntries(this.nodeStats.entries())
  }

  /**
   * Clean up old session affinity data
   */
  private startStatsCleanup(): void {
    setInterval(() => {
      const now = Date.now()
      const maxAge = 30 * 60 * 1000 // 30 minutes

      // Clean up old session affinities
      for (const [sessionId, nodeId] of this.sessionAffinity.entries()) {
        const lastUsed = this.nodeStats.get(nodeId)?.lastUsed || 0
        if (now - lastUsed > maxAge) {
          this.sessionAffinity.delete(sessionId)
        }
      }

      // Clean up old node stats (nodes no longer in any policy)
      const activeNodes = new Set<string>()
      for (const policy of this.policies.values()) {
        for (const nodeId of policy.nodePool) {
          activeNodes.add(nodeId)
        }
      }

      for (const nodeId of this.nodeStats.keys()) {
        if (!activeNodes.has(nodeId)) {
          this.nodeStats.delete(nodeId)
        }
      }

      this.emit("cleanupCompleted")
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  /**
   * Reset all statistics
   */
  resetStatistics(): void {
    for (const stats of this.nodeStats.values()) {
      stats.connections = 0
      stats.totalRequests = 0
      stats.failedRequests = 0
      stats.avgLatency = 0
      stats.healthScore = 1.0
    }
    
    this.sessionAffinity.clear()
    this.currentIndices.clear()
    
    this.emit("statisticsReset")
  }
}