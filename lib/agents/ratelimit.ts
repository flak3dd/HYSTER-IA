import { serverEnv } from "@/lib/env"

type DomainState = {
  inFlight: number
  queue: Array<() => void>
}

const globalKey = "__agents_domain_limiter__"
type Limiter = { domains: Map<string, DomainState> }
const g = globalThis as unknown as { [globalKey]?: Limiter }
if (!g[globalKey]) g[globalKey] = { domains: new Map() }
const state = g[globalKey]

function getDomain(url: URL): string {
  return url.hostname.toLowerCase()
}

/**
 * Waits until the host has capacity, runs `fn`, and releases. Keeps the agent
 * polite toward any given host; does not implement rotation.
 */
export async function withHostLimit<T>(url: URL, fn: () => Promise<T>): Promise<T> {
  const env = serverEnv()
  const max = env.AGENT_MAX_CONCURRENCY_PER_DOMAIN
  const key = getDomain(url)
  let domain = state.domains.get(key)
  if (!domain) {
    domain = { inFlight: 0, queue: [] }
    state.domains.set(key, domain)
  }
  if (domain.inFlight >= max) {
    await new Promise<void>((resolve) => domain!.queue.push(resolve))
  }
  domain.inFlight++
  try {
    return await fn()
  } finally {
    domain.inFlight--
    const next = domain.queue.shift()
    if (next) next()
  }
}
