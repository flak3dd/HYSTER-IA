import { prisma } from "@/lib/db"
import logger from "@/lib/logger"

const proxyHealthLogger = logger.child({ component: 'proxy-health' })

export type ProxyHealthStatus = 'unknown' | 'healthy' | 'unhealthy' | 'checking'

export interface ProxyHealthCheck {
  nodeId: string
  nodeName: string
  proxyUrl: string
  status: ProxyHealthStatus
  responseTimeMs?: number
  lastChecked: Date
  error?: string
}

export interface ProxyConfig {
  nodeId: string
  nodeName: string
  socksProxyUrl?: string
  httpProxyUrl?: string
  priority: number
  healthStatus: ProxyHealthStatus
  responseTimeMs?: number
}

/**
 * Check health of a single proxy by making a simple request
 */
async function checkProxyHealth(proxyUrl: string): Promise<{ healthy: boolean; responseTimeMs?: number; error?: string }> {
  const startTime = Date.now()

  try {
    // Simple health check - try to fetch a fast endpoint
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

    const response = await fetch('https://www.google.com/generate_204', {
      // @ts-ignore - undici ProxyAgent types
      dispatcher: createProxyDispatcher(proxyUrl),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      const responseTimeMs = Date.now() - startTime
      return { healthy: true, responseTimeMs }
    } else {
      return { healthy: false, error: `HTTP ${response.status}` }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { healthy: false, error: errorMessage }
  }
}

/**
 * Create a proxy dispatcher for undici
 */
function createProxyDispatcher(proxyUrl: string) {
  const { ProxyAgent } = require('undici')
  const { SocksProxyAgent } = require('socks-proxy-agent')

  const url = new URL(proxyUrl)
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return new ProxyAgent({ uri: proxyUrl })
  } else if (url.protocol === 'socks5:' || url.protocol === 'socks5h:') {
    return new SocksProxyAgent(proxyUrl)
  }
  throw new Error(`Unsupported proxy protocol: ${url.protocol}`)
}

/**
 * Get all proxy configurations from database, sorted by priority and health
 */
export async function getHealthyProxies(): Promise<ProxyConfig[]> {
  const nodes = await prisma.hysteriaNode.findMany({
    where: {
      OR: [
        { socksProxyUrl: { not: null } },
        { httpProxyUrl: { not: null } },
      ],
    },
    orderBy: [
      { proxyPriority: 'asc' }, // Lower priority value = higher priority
      { proxyResponseTimeMs: 'asc' }, // Faster proxies preferred
    ],
  })

  return nodes
    .map(node => ({
      nodeId: node.id,
      nodeName: node.name,
      socksProxyUrl: node.socksProxyUrl || undefined,
      httpProxyUrl: node.httpProxyUrl || undefined,
      priority: node.proxyPriority,
      healthStatus: (node.proxyHealthStatus as ProxyHealthStatus) || 'unknown',
      responseTimeMs: node.proxyResponseTimeMs || undefined,
    }))
    .filter(proxy => proxy.healthStatus === 'healthy' || proxy.healthStatus === 'unknown')
}

/**
 * Get all proxy configurations (including unhealthy ones)
 */
export async function getAllProxies(): Promise<ProxyConfig[]> {
  const nodes = await prisma.hysteriaNode.findMany({
    where: {
      OR: [
        { socksProxyUrl: { not: null } },
        { httpProxyUrl: { not: null } },
      ],
    },
    orderBy: { proxyPriority: 'asc' },
  })

  return nodes.map(node => ({
    nodeId: node.id,
    nodeName: node.name,
    socksProxyUrl: node.socksProxyUrl || undefined,
    httpProxyUrl: node.httpProxyUrl || undefined,
    priority: node.proxyPriority,
    healthStatus: (node.proxyHealthStatus as ProxyHealthStatus) || 'unknown',
    responseTimeMs: node.proxyResponseTimeMs || undefined,
  }))
}

/**
 * Perform health check on a single node's proxy
 */
export async function checkNodeProxyHealth(nodeId: string): Promise<ProxyHealthCheck | null> {
  const node = await prisma.hysteriaNode.findUnique({
    where: { id: nodeId },
  })

  if (!node) {
    proxyHealthLogger.error(`Node ${nodeId} not found`)
    return null
  }

  const proxyUrl = node.socksProxyUrl || node.httpProxyUrl
  if (!proxyUrl) {
    proxyHealthLogger.warn(`Node ${node.name} has no proxy configured`)
    return null
  }

  // Update status to checking
  await prisma.hysteriaNode.update({
    where: { id: nodeId },
    data: { proxyHealthStatus: 'checking' },
  })

  const result = await checkProxyHealth(proxyUrl)

  // Update node with health check results
  const healthStatus: ProxyHealthStatus = result.healthy ? 'healthy' : 'unhealthy'
  await prisma.hysteriaNode.update({
    where: { id: nodeId },
    data: {
      proxyHealthStatus: healthStatus,
      lastHealthCheck: new Date(),
      proxyResponseTimeMs: result.responseTimeMs,
    },
  })

  const healthCheck: ProxyHealthCheck = {
    nodeId: node.id,
    nodeName: node.name,
    proxyUrl,
    status: healthStatus,
    responseTimeMs: result.responseTimeMs,
    lastChecked: new Date(),
    error: result.error,
  }

  proxyHealthLogger.info(`Proxy health check for ${node.name}: ${healthStatus} (${result.responseTimeMs}ms)`)

  return healthCheck
}

/**
 * Perform health checks on all configured proxies
 */
export async function checkAllProxyHealths(): Promise<ProxyHealthCheck[]> {
  const proxies = await getAllProxies()
  const results: ProxyHealthCheck[] = []

  for (const proxy of proxies) {
    const proxyUrl = proxy.socksProxyUrl || proxy.httpProxyUrl
    if (!proxyUrl) continue

    const result = await checkNodeProxyHealth(proxy.nodeId)
    if (result) {
      results.push(result)
    }
  }

  return results
}

/**
 * Get the best available proxy based on health and priority
 */
export async function getBestProxy(): Promise<ProxyConfig | null> {
  const healthyProxies = await getHealthyProxies()
  if (healthyProxies.length === 0) {
    proxyHealthLogger.warn('No healthy proxies available')
    return null
  }

  // Return the first (highest priority, fastest) proxy
  return healthyProxies[0]
}

/**
 * Update proxy priority
 */
export async function updateProxyPriority(nodeId: string, priority: number): Promise<boolean> {
  try {
    await prisma.hysteriaNode.update({
      where: { id: nodeId },
      data: { proxyPriority: priority },
    })
    proxyHealthLogger.info(`Updated proxy priority for node ${nodeId} to ${priority}`)
    return true
  } catch (error) {
    proxyHealthLogger.error(`Failed to update proxy priority: ${error}`)
    return false
  }
}

/**
 * Mark a proxy as unhealthy (manual override)
 */
export async function markProxyUnhealthy(nodeId: string): Promise<boolean> {
  try {
    await prisma.hysteriaNode.update({
      where: { id: nodeId },
      data: { proxyHealthStatus: 'unhealthy' },
    })
    proxyHealthLogger.info(`Manually marked proxy ${nodeId} as unhealthy`)
    return true
  } catch (error) {
    proxyHealthLogger.error(`Failed to mark proxy as unhealthy: ${error}`)
    return false
  }
}