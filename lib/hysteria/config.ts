import { stringify as yamlStringify } from "yaml"
import type { ServerConfig } from "@/lib/db/schema"

type TlsYaml =
  | { tls: { cert: string; key: string } }
  | { acme: { domains: string[]; email: string } }

type AuthYaml = {
  auth: {
    type: "http"
    http: {
      url: string
      insecure: boolean
    }
  }
}

type TrafficYaml = {
  trafficStats: {
    listen: string
    secret: string
  }
}

type ObfsYaml = {
  obfs?: {
    type: "salamander"
    salamander: { password: string }
  }
}

type BandwidthYaml = {
  bandwidth?: {
    up?: string
    down?: string
  }
}

type MasqueradeYaml = {
  masquerade?: Record<string, unknown>
}

type ListenYaml = {
  listen: string
}

export type HysteriaYamlObject = ListenYaml &
  TlsYaml &
  AuthYaml &
  TrafficYaml &
  ObfsYaml &
  BandwidthYaml &
  MasqueradeYaml

function tlsSection(cfg: ServerConfig): TlsYaml {
  if (cfg.tls.mode === "manual") {
    return { tls: { cert: cfg.tls.certPath, key: cfg.tls.keyPath } }
  }
  return { acme: { domains: cfg.tls.domains, email: cfg.tls.email } }
}

function obfsSection(cfg: ServerConfig): ObfsYaml {
  if (!cfg.obfs) return {}
  return {
    obfs: {
      type: "salamander",
      salamander: { password: cfg.obfs.password },
    },
  }
}

function bandwidthSection(cfg: ServerConfig): BandwidthYaml {
  if (!cfg.bandwidth) return {}
  const bw: { up?: string; down?: string } = {}
  if (cfg.bandwidth.up) bw.up = cfg.bandwidth.up
  if (cfg.bandwidth.down) bw.down = cfg.bandwidth.down
  return { bandwidth: bw }
}

function masqueradeSection(cfg: ServerConfig): MasqueradeYaml {
  if (!cfg.masquerade) return {}
  const m = cfg.masquerade
  const base: Record<string, unknown> = { type: m.type }
  if (m.type === "proxy" && m.proxy) {
    base.proxy = { url: m.proxy.url, rewriteHost: m.proxy.rewriteHost }
  } else if (m.type === "file" && m.file) {
    base.file = { dir: m.file.dir }
  } else if (m.type === "string" && m.string) {
    base.string = {
      content: m.string.content,
      headers: m.string.headers,
      statusCode: m.string.statusCode,
    }
  }
  return { masquerade: base }
}

export function buildHysteriaYamlObject(cfg: ServerConfig): HysteriaYamlObject {
  return {
    listen: cfg.listen,
    ...tlsSection(cfg),
    auth: {
      type: "http",
      http: {
        url: cfg.authBackendUrl,
        insecure: cfg.authBackendInsecure,
      },
    },
    trafficStats: {
      listen: cfg.trafficStats.listen,
      secret: cfg.trafficStats.secret,
    },
    ...obfsSection(cfg),
    ...bandwidthSection(cfg),
    ...masqueradeSection(cfg),
  }
}

export function renderHysteriaYaml(cfg: ServerConfig): string {
  return yamlStringify(buildHysteriaYamlObject(cfg), { indent: 2, lineWidth: 0 })
}
