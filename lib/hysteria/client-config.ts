import { stringify as yamlStringify } from "yaml"
import type { ClientUser, Node, ServerConfig } from "@/lib/db/schema"
import type { ResolvedProfileConfig } from "@/lib/db/profiles"

export type ClientConfigOptions = {
  // serverHost:port — defaults to node.hostname + node.listenAddr port
  serverAddr?: string
  // when true, enable lazy connect (client connects on first packet, not on startup)
  lazy?: boolean
  // optional per-client bandwidth cap (defaults to node's server config bandwidth)
  bandwidth?: { up?: string; down?: string }
  // generate SOCKS5 + HTTP proxy client listen ports (useful for egress proxy pattern)
  socks5Listen?: string
  httpListen?: string
  // resolved profile config — takes precedence over global ServerConfig for
  // obfs, bandwidth, and client-side settings
  profileConfig?: ResolvedProfileConfig
}

export type ClientConfigYamlObject = {
  server: string
  auth: string
  tls?: { sni?: string; insecure?: boolean }
  obfs?: { type: "salamander"; salamander: { password: string } }
  bandwidth?: { up?: string; down?: string }
  lazy?: boolean
  socks5?: { listen: string }
  http?: { listen: string }
}

function parseListenPort(listenAddr: string): number | null {
  // supports ":443", "0.0.0.0:443", "[::]:443"
  const m = listenAddr.match(/:(\d+)$/)
  return m ? Number.parseInt(m[1], 10) : null
}

export function buildClientYamlObject(
  user: ClientUser,
  node: Node,
  server: ServerConfig | null,
  opts: ClientConfigOptions = {},
): ClientConfigYamlObject {
  const port = parseListenPort(node.listenAddr) ?? parseListenPort(server?.listen ?? "") ?? 443
  const serverAddr = opts.serverAddr ?? `${node.hostname}:${port}`
  const pc = opts.profileConfig

  const obj: ClientConfigYamlObject = {
    server: serverAddr,
    auth: user.authToken,
  }

  // Infer TLS SNI from node hostname (common case). Insecure flag false by default.
  obj.tls = { sni: node.hostname, insecure: false }

  // Obfuscation: profile config takes precedence over global server config
  if (pc?.obfs) {
    obj.obfs = {
      type: "salamander",
      salamander: { password: pc.obfs.password },
    }
  } else if (server?.obfs) {
    obj.obfs = {
      type: "salamander",
      salamander: { password: server.obfs.password },
    }
  }

  // Bandwidth: explicit opts > profile config > global server config
  const bandwidth = opts.bandwidth ?? pc?.bandwidth ?? (server?.bandwidth ?? undefined)
  if (bandwidth && (bandwidth.up || bandwidth.down)) {
    const bw: { up?: string; down?: string } = {}
    if (bandwidth.up) bw.up = bandwidth.up
    if (bandwidth.down) bw.down = bandwidth.down
    obj.bandwidth = bw
  }

  // Lazy: explicit opts > profile config
  if (opts.lazy || pc?.lazyStart) obj.lazy = true

  // SOCKS5: explicit opts > profile config
  const socks = opts.socks5Listen ?? pc?.socksListen
  if (socks) obj.socks5 = { listen: socks }

  if (opts.httpListen) obj.http = { listen: opts.httpListen }

  return obj
}

export function renderClientYaml(
  user: ClientUser,
  node: Node,
  server: ServerConfig | null,
  opts: ClientConfigOptions = {},
): string {
  return yamlStringify(buildClientYamlObject(user, node, server, opts), {
    indent: 2,
    lineWidth: 0,
  })
}

/**
 * Render a hysteria2:// subscription URI as documented in
 * https://v2.hysteria.network/docs/advanced/URI-Scheme/
 *
 *   hysteria2://<auth>@<host>:<port>?sni=<host>&insecure=0&obfs=salamander&obfs-password=<pw>#<name>
 *
 * Panels commonly base64-encode a newline-separated list of these URIs and
 * expose the result as a single subscription endpoint.
 */
export function renderClientUri(
  user: ClientUser,
  node: Node,
  server: ServerConfig | null,
  profileConfig?: ResolvedProfileConfig,
): string {
  const port = parseListenPort(node.listenAddr) ?? parseListenPort(server?.listen ?? "") ?? 443
  const qs = new URLSearchParams()
  qs.set("sni", node.hostname)
  qs.set("insecure", "0")
  const obfs = profileConfig?.obfs ?? server?.obfs
  if (obfs) {
    qs.set("obfs", "salamander")
    qs.set("obfs-password", obfs.password)
  }
  const bw = profileConfig?.bandwidth ?? server?.bandwidth
  if (bw?.up) qs.set("upmbps", bandwidthToMbps(bw.up))
  if (bw?.down) qs.set("downmbps", bandwidthToMbps(bw.down))
  const label = encodeURIComponent(`${node.name} · ${user.displayName}`)
  return `hysteria2://${encodeURIComponent(user.authToken)}@${node.hostname}:${port}?${qs.toString()}#${label}`
}

function bandwidthToMbps(raw: string): string {
  // Accept "100 mbps", "1 gbps", "500kbps", returns a bare number string in mbps
  const m = raw.trim().toLowerCase().match(/^([\d.]+)\s*(kbps|mbps|gbps|k|m|g)?$/)
  if (!m) return raw
  const n = Number.parseFloat(m[1])
  const unit = m[2] ?? "mbps"
  if (unit === "kbps" || unit === "k") return String(Math.round(n / 1000))
  if (unit === "gbps" || unit === "g") return String(Math.round(n * 1000))
  return String(Math.round(n))
}

/**
 * Build a base64-encoded subscription blob containing multiple hysteria2:// URIs,
 * one per (user, node) pair. Compatible with subscription loaders in v2rayN, Nekoray, etc.
 */
export function renderSubscription(
  entries: Array<{ user: ClientUser; node: Node; server: ServerConfig | null; profileConfig?: ResolvedProfileConfig }>,
): string {
  const lines = entries.map((e) => renderClientUri(e.user, e.node, e.server, e.profileConfig))
  // subscription blobs are base64-encoded UTF-8 text, NOT URL-encoded
  return Buffer.from(lines.join("\n"), "utf-8").toString("base64")
}

/* ------------------------------------------------------------------ */
/*  Clash Meta (mihomo) format                                        */
/* ------------------------------------------------------------------ */

export type ClashMetaProxy = {
  name: string
  type: "hysteria2"
  server: string
  port: number
  password: string
  sni?: string
  "skip-cert-verify"?: boolean
  obfs?: string
  "obfs-password"?: string
  up?: string
  down?: string
}

function buildClashMetaProxy(
  user: ClientUser,
  node: Node,
  server: ServerConfig | null,
  profileConfig?: ResolvedProfileConfig,
): ClashMetaProxy {
  const port = parseListenPort(node.listenAddr) ?? parseListenPort(server?.listen ?? "") ?? 443
  const p: ClashMetaProxy = {
    name: `${node.name} · ${user.displayName}`,
    type: "hysteria2",
    server: node.hostname,
    port,
    password: user.authToken,
    sni: node.hostname,
    "skip-cert-verify": false,
  }
  const obfs = profileConfig?.obfs ?? server?.obfs
  if (obfs) {
    p.obfs = "salamander"
    p["obfs-password"] = obfs.password
  }
  const bw = profileConfig?.bandwidth ?? server?.bandwidth
  if (bw?.up) p.up = bw.up
  if (bw?.down) p.down = bw.down
  return p
}

export function renderClashMetaYaml(
  entries: Array<{ user: ClientUser; node: Node; server: ServerConfig | null; profileConfig?: ResolvedProfileConfig }>,
): string {
  const proxies = entries.map((e) => buildClashMetaProxy(e.user, e.node, e.server, e.profileConfig))
  const names = proxies.map((p) => p.name)
  const doc = {
    proxies,
    "proxy-groups": [
      {
        name: "Hysteria2",
        type: "select",
        proxies: names,
      },
      {
        name: "Auto",
        type: "url-test",
        proxies: names,
        url: "http://www.gstatic.com/generate_204",
        interval: 300,
      },
    ],
    rules: ["MATCH,Hysteria2"],
  }
  return yamlStringify(doc, { indent: 2, lineWidth: 0 })
}

/* ------------------------------------------------------------------ */
/*  sing-box format                                                   */
/* ------------------------------------------------------------------ */

export type SingBoxOutbound = {
  type: "hysteria2"
  tag: string
  server: string
  server_port: number
  password: string
  tls: { enabled: true; server_name: string; insecure: boolean }
  obfs?: { type: "salamander"; password: string }
  up_mbps?: number
  down_mbps?: number
}

function buildSingBoxOutbound(
  user: ClientUser,
  node: Node,
  server: ServerConfig | null,
  profileConfig?: ResolvedProfileConfig,
): SingBoxOutbound {
  const port = parseListenPort(node.listenAddr) ?? parseListenPort(server?.listen ?? "") ?? 443
  const ob: SingBoxOutbound = {
    type: "hysteria2",
    tag: `${node.name}-${user.displayName}`,
    server: node.hostname,
    server_port: port,
    password: user.authToken,
    tls: { enabled: true, server_name: node.hostname, insecure: false },
  }
  const obfs = profileConfig?.obfs ?? server?.obfs
  if (obfs) {
    ob.obfs = { type: "salamander", password: obfs.password }
  }
  const bw = profileConfig?.bandwidth ?? server?.bandwidth
  if (bw?.up) {
    const mbps = Number.parseInt(bandwidthToMbps(bw.up), 10)
    if (!Number.isNaN(mbps)) ob.up_mbps = mbps
  }
  if (bw?.down) {
    const mbps = Number.parseInt(bandwidthToMbps(bw.down), 10)
    if (!Number.isNaN(mbps)) ob.down_mbps = mbps
  }
  return ob
}

export function renderSingBoxJson(
  entries: Array<{ user: ClientUser; node: Node; server: ServerConfig | null; profileConfig?: ResolvedProfileConfig }>,
): string {
  const outbounds = entries.map((e) => buildSingBoxOutbound(e.user, e.node, e.server, e.profileConfig))
  const tags = outbounds.map((o) => o.tag)
  const doc = {
    outbounds: [
      ...outbounds,
      {
        type: "selector",
        tag: "proxy",
        outbounds: tags,
        default: tags[0],
      },
      { type: "direct", tag: "direct" },
    ],
  }
  return JSON.stringify(doc, null, 2)
}
