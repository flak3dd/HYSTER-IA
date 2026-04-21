import { Agent, ProxyAgent, type Dispatcher } from "undici"
import { SocksProxyAgent } from "socks-proxy-agent"
import type { Socket } from "node:net"
import { serverEnv } from "@/lib/env"
import { SingleProxyStrategy, type ProxyStrategy } from "@/lib/net/strategy"

let cachedDispatcher: Dispatcher | null | undefined
let cachedStrategy: ProxyStrategy | null = null

function buildDispatcher(rawUrl: string | undefined): Dispatcher | null {
  if (!rawUrl) return null
  const u = new URL(rawUrl)
  if (u.protocol === "http:" || u.protocol === "https:") {
    return new ProxyAgent({ uri: rawUrl })
  }
  if (u.protocol === "socks5:" || u.protocol === "socks5h:") {
    // `undici.ProxyAgent` only supports HTTP CONNECT. For SOCKS5 we provide a
    // custom `connect` that delegates to `socks-proxy-agent`'s `createConnection`.
    const socks = new SocksProxyAgent(rawUrl)
    type ConnectOpts = { hostname: string; port: number | string }
    type ConnectCb = (err: Error | null, socket: Socket | null) => void
    const agentWithCreate = socks as unknown as {
      createConnection: (opts: ConnectOpts, cb: ConnectCb) => void
    }
    return new Agent({
      connect: (opts, callback) => {
        agentWithCreate.createConnection(
          { hostname: opts.hostname, port: opts.port ?? 443 },
          (err, socket) => {
            if (err) {
              ;(callback as (e: Error, s: null) => void)(err, null)
              return
            }
            if (!socket) {
              ;(callback as (e: Error, s: null) => void)(
                new Error("socks connect returned no socket"),
                null,
              )
              return
            }
            ;(callback as (e: null, s: Socket) => void)(null, socket)
          },
        )
      },
    })
  }
  throw new Error(`Unsupported proxy scheme: ${u.protocol}`)
}

export function egressDispatcher(): Dispatcher | null {
  if (cachedDispatcher !== undefined) return cachedDispatcher
  const env = serverEnv()
  cachedDispatcher = buildDispatcher(env.HYSTERIA_EGRESS_PROXY_URL)
  return cachedDispatcher
}

export function egressStrategy(): ProxyStrategy {
  if (cachedStrategy) return cachedStrategy
  cachedStrategy = new SingleProxyStrategy(egressDispatcher())
  return cachedStrategy
}

/** Test-only: drop cached dispatcher + strategy. */
export function resetEgressCache(): void {
  cachedDispatcher = undefined
  cachedStrategy = null
}
