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

  async resolve(): Promise<Dispatcher | null> {
    return this.dispatcher
  }
}
