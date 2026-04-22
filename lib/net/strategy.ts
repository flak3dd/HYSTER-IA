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

/**
 * RotatingProxyStrategy - Stub for proxy rotation + evasion scaffolding.
 * 
 * Rotation reduces IP-based detection. Hooks ready for:
 * - Per-request fingerprint randomization
 * - CAPTCHA solving services 
 * - Anti-bot behavioral mimicry
 * 
 * RISK ASSESSMENT: Current impl (undici) has Node.js TLS/HTTP fingerprints.
 * Detectability: MEDIUM. Hysteria2 masks transport, rotation hides IPs, but no browser emulation.
 * High-volume traffic still risky without puppeteer + stealth plugins.
 */
export class RotatingProxyStrategy implements ProxyStrategy {
  readonly name = "rotating"

  private index = 0

  constructor(
    private readonly proxies: string[], 
    private readonly selection: "round-robin" | "random" = "round-robin"
  ) {}

  async resolve(_ctx: ProxyResolveContext): Promise<Dispatcher | null> {
    if (this.proxies.length === 0) return null

    // TODO: Dynamic proxy list from DB nodes (lib/db/nodes.ts), health-checked

    let proxyUrl: string
    switch (this.selection) {
      case "round-robin":
        proxyUrl = this.proxies[this.index++ % this.proxies.length]!
        break
      case "random":
        proxyUrl = this.proxies[Math.floor(Math.random() * this.proxies.length)]!
        break
    }

    const dispatcher = this.buildDispatcher(proxyUrl)

    // ===== EVASION HOOKS (plug-and-play) =====
    // await preRequestEvasion(ctx.target, ctx.purpose)  // Fingerprint + headers
    // await captchaSolverInterceptor()  // 403/429 → 2captcha
    // await antiBotJitter()  // Timing/behavioral

    return dispatcher
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





