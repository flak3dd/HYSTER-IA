/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Dispatcher } from "undici"

/**
 * Resolves the outbound network dispatcher for a given request context.
 *
 * A strategy picks *which* network path to use per request. The shipped
 * implementation always picks the same path (the configured Hysteria 2
 * egress). The interface exists to keep the network layer testable and to
 * support legitimate extensions like failover (primary down → try secondary)
 * or geo-routing (pick the region closest to the target).
 */
export interface ProxyStrategy {
  readonly name: string
  resolve(ctx: ProxyResolveContext): Promise<Dispatcher | null>
}

export type ProxyResolveContext = {
  readonly target: URL
  readonly purpose: ProxyPurpose
}

export type ProxyPurpose = "llm" | "web" | "panel"

/**
 * Always returns the same dispatcher. If `dispatcher` is null, egress is
 * direct (no proxy).
 */
export class SingleProxyStrategy implements ProxyStrategy {
  readonly name = "single"

  constructor(private readonly dispatcher: Dispatcher | null) {}

  async resolve(_ctx: ProxyResolveContext): Promise<Dispatcher | null> {
    return this.dispatcher
  }
}

import type { Socket } from "node:net"
import { Agent, ProxyAgent } from "undici"
import { SocksProxyAgent } from "socks-proxy-agent"
import { getHealthyProxies, getBestProxy, type ProxyConfig } from "@/lib/infrastructure/proxy-health"

/**
 * RotatingProxyStrategy - Dynamic proxy rotation with health checking.
 *
 * Rotation reduces IP-based detection. Now supports:
 * - Dynamic proxy loading from database nodes
 * - Health-checked proxy selection
 * - Automatic failover to healthy proxies
 * - Priority-based selection
 *
 * RISK ASSESSMENT: Current impl (undici) has Node.js TLS/HTTP fingerprints.
 * Detectability: MEDIUM. Hysteria2 masks transport, rotation hides IPs, but no browser emulation.
 * High-volume traffic still risky without puppeteer + stealth plugins.
 */
export class RotatingProxyStrategy implements ProxyStrategy {
  readonly name = "rotating"

  private index = 0
  private proxyCache: ProxyConfig[] = []
  private lastCacheUpdate: number = 0
  private readonly cacheTTL = 60000 // 1 minute cache TTL

  constructor(
    private readonly proxies?: string[], // Optional fallback to static list
    private readonly selection: "round-robin" | "random" | "dynamic" = "dynamic",
    private readonly useDatabase = true // Enable database proxy loading
  ) {}

  async resolve(_ctx: ProxyResolveContext): Promise<Dispatcher | null> {
    const now = Date.now()

    // Try to load proxies from database if enabled and cache is expired
    if (this.useDatabase && (now - this.lastCacheUpdate > this.cacheTTL || this.proxyCache.length === 0)) {
      try {
        const dbProxies = await getHealthyProxies()
        if (dbProxies.length > 0) {
          this.proxyCache = dbProxies
          this.lastCacheUpdate = now
        } else if (this.proxies && this.proxies.length > 0) {
          // Fallback to static proxies if no healthy DB proxies
          this.proxyCache = this.staticToProxyConfig(this.proxies)
        }
      } catch (error) {
        // If database fails, fallback to static proxies
        if (this.proxies && this.proxies.length > 0) {
          this.proxyCache = this.staticToProxyConfig(this.proxies)
        }
      }
    }

    // If no proxies available (dynamic loading failed or disabled), use static list
    if (this.proxyCache.length === 0 && this.proxies && this.proxies.length > 0) {
      this.proxyCache = this.staticToProxyConfig(this.proxies)
    }

    if (this.proxyCache.length === 0) {
      return null // No proxies available
    }

    let proxyConfig: ProxyConfig
    let proxyUrl: string

    switch (this.selection) {
      case "dynamic":
        // Use best proxy (health + priority + response time)
        const bestProxy = await getBestProxy()
        if (bestProxy) {
          proxyConfig = bestProxy
          proxyUrl = bestProxy.socksProxyUrl || bestProxy.httpProxyUrl!
        } else {
          // Fallback to round-robin if no best proxy
          proxyConfig = this.proxyCache[this.index++ % this.proxyCache.length]!
          proxyUrl = proxyConfig.socksProxyUrl || proxyConfig.httpProxyUrl!
        }
        break

      case "round-robin":
        proxyConfig = this.proxyCache[this.index++ % this.proxyCache.length]!
        proxyUrl = proxyConfig.socksProxyUrl || proxyConfig.httpProxyUrl!
        break

      case "random":
        proxyConfig = this.proxyCache[Math.floor(Math.random() * this.proxyCache.length)]!
        proxyUrl = proxyConfig.socksProxyUrl || proxyConfig.httpProxyUrl!
        break

      default:
        proxyConfig = this.proxyCache[0]!
        proxyUrl = proxyConfig.socksProxyUrl || proxyConfig.httpProxyUrl!
    }

    const dispatcher = this.buildDispatcher(proxyUrl)

    // ===== EVASION HOOKS (plug-and-play) =====
    // await preRequestEvasion(ctx.target, ctx.purpose)  // Fingerprint + headers
    // await captchaSolverInterceptor()  // 403/429 → 2captcha
    // await antiBotJitter()  // Timing/behavioral

    return dispatcher
  }

  /**
   * Convert static proxy URLs to ProxyConfig format
   */
  private staticToProxyConfig(proxies: string[]): ProxyConfig[] {
    return proxies.map((url, index) => ({
      nodeId: `static-${index}`,
      nodeName: `Static Proxy ${index}`,
      socksProxyUrl: url.startsWith('socks') ? url : undefined,
      httpProxyUrl: url.startsWith('http') ? url : undefined,
      priority: 100 + index, // Lower priority than DB proxies
      healthStatus: 'unknown' as const,
    }))
  }

  /**
   * Force refresh the proxy cache from database
   */
  async refreshProxyCache(): Promise<void> {
    this.lastCacheUpdate = 0 // Force cache refresh on next resolve
    this.proxyCache = []
  }

  private buildDispatcher(rawUrl: string): Dispatcher | null {
    const u = new URL(rawUrl)
    if (u.protocol === "http:" || u.protocol === "https:") {
      return new ProxyAgent({ uri: rawUrl })
    }
    if (u.protocol === "socks5:" || u.protocol === "socks5h:") {
      // For SOCKS5, use the SocksProxyAgent directly as the dispatcher
      // This avoids complex undici Agent connector type issues
      return new SocksProxyAgent(rawUrl) as unknown as Dispatcher
    }
    return null
  }
}





