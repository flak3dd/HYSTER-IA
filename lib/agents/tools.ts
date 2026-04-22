import { z } from "zod"
import { proxyFetch } from "@/lib/net/fetch"
import { withHostLimit } from "@/lib/agents/ratelimit"
import { listUsers } from "@/lib/db/users"
import { listNodes } from "@/lib/db/nodes"
import { getServerConfig } from "@/lib/db/server-config"
import { getStatus as getManagerStatus } from "@/lib/hysteria/manager"
import type { ChatToolDefinition } from "@/lib/agents/llm"

export type AgentToolContext = {
  signal: AbortSignal
  invokerUid: string
}

export type AgentTool<I, O> = {
  name: string
  description: string
  parameters: z.ZodType<I>
  jsonSchema: Record<string, unknown>
  run: (input: I, ctx: AgentToolContext) => Promise<O>
}

// ---------- web.fetch ----------

const WebFetchInput = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "HEAD"]).default("GET"),
  accept: z.string().optional(),
  maxBytes: z.number().int().min(1).max(2_000_000).default(200_000),
})

const webFetchTool: AgentTool<z.infer<typeof WebFetchInput>, {
  status: number
  contentType: string | null
  body: string
  truncated: boolean
}> = {
  name: "web_fetch",
  description:
    "Fetch a URL through the egress proxy and return response text (up to maxBytes). Honors HTTP rate limits — respects 429 and Retry-After. Use for reading public documentation or your own resources. Do not use to evade rate limits or anti-bot protections.",
  parameters: WebFetchInput,
  jsonSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Fully-qualified http(s) URL" },
      method: { type: "string", enum: ["GET", "HEAD"], default: "GET" },
      accept: { type: "string" },
      maxBytes: { type: "integer", minimum: 1, maximum: 2_000_000, default: 200_000 },
    },
    required: ["url"],
  },
  async run(input, ctx) {
    const url = new URL(input.url)
    return withHostLimit(url, async () => {
      const res = await proxyFetch(url, {
        method: input.method,
        purpose: "web",
        headers: input.accept ? { accept: input.accept } : undefined,
        signal: ctx.signal,
      })
      if (res.status === 429) {
        const ra = res.headers.get("retry-after")
        throw new Error(`rate limited by ${url.host} (Retry-After: ${ra ?? "unspecified"})`)
      }
      const contentType = res.headers.get("content-type")
      if (input.method === "HEAD") {
        return { status: res.status, contentType, body: "", truncated: false }
      }
      const buf = new Uint8Array(await res.arrayBuffer())
      const truncated = buf.byteLength > input.maxBytes
      const slice = truncated ? buf.subarray(0, input.maxBytes) : buf
      const body = new TextDecoder("utf-8", { fatal: false }).decode(slice)
      return { status: res.status, contentType, body, truncated }
    })
  },
}

// ---------- panel.read-only tools ----------

const NoInput = z.object({})

const panelListUsers: AgentTool<
  z.infer<typeof NoInput>,
  Array<{
    id: string
    displayName: string
    status: string
    usedBytes: number
    quotaBytes: number | null
    expiresAt: number | null
  }>
> = {
  name: "panel_list_users",
  description: "List registered Hysteria 2 client users (no auth tokens).",
  parameters: NoInput,
  jsonSchema: { type: "object", properties: {} },
  async run() {
    const users = await listUsers()
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      status: u.status,
      usedBytes: u.usedBytes ?? 0,
      quotaBytes: u.quotaBytes ?? null,
      expiresAt: u.expiresAt ?? null,
    }))
  },
}

const panelListNodes: AgentTool<
  z.infer<typeof NoInput>,
  Array<{ id: string; name: string; region: string | null; status: string }>
> = {
  name: "panel_list_nodes",
  description: "List Hysteria 2 proxy nodes managed by this panel.",
  parameters: NoInput,
  jsonSchema: { type: "object", properties: {} },
  async run() {
    const nodes = await listNodes()
    return nodes.map((n) => ({
      id: n.id,
      name: n.name,
      region: n.region ?? null,
      status: n.status,
    }))
  },
}

const panelServerStatus: AgentTool<
  z.infer<typeof NoInput>,
  {
    state: string
    pid: number | null
    startedAt: string | null
    lastExitCode: number | null
    lastError: string | null
    config: Record<string, unknown> | null
  }
> = {
  name: "panel_server_status",
  description: "Get the status of the managed Hysteria 2 server process and current config (no secrets).",
  parameters: NoInput,
  jsonSchema: { type: "object", properties: {} },
  async run() {
    const status = getManagerStatus()
    const config = await getServerConfig().catch(() => null)
    const safeConfig: Record<string, unknown> | null = config
      ? {
          listen: config.listen,
          obfs: config.obfs ? { type: "obfs" in config.obfs ? config.obfs.type : null } : null,
          bandwidth: config.bandwidth,
          trafficStats: config.trafficStats ? { listen: config.trafficStats.listen } : null,
          authBackendUrl: config.authBackendUrl,
          updatedAt: config.updatedAt,
        }
      : null
    return {
      state: status.state,
      pid: status.pid,
      startedAt: status.startedAt ? new Date(status.startedAt).toISOString() : null,
      lastExitCode: status.lastExitCode,
      lastError: status.lastError,
      config: safeConfig,
    }
  },
}

// ---------- registry ----------

export const TOOLS = {
  [webFetchTool.name]: webFetchTool,
  [panelListUsers.name]: panelListUsers,
  [panelListNodes.name]: panelListNodes,
  [panelServerStatus.name]: panelServerStatus,
} as const

export const DEFAULT_ALLOWED_TOOLS: string[] = [
  webFetchTool.name,
  panelListUsers.name,
  panelListNodes.name,
  panelServerStatus.name,
]

export function toolDefinitions(allowed: string[]): ChatToolDefinition[] {
  const registry = TOOLS as Record<string, AgentTool<unknown, unknown>>
  return allowed
    .filter((name) => Object.prototype.hasOwnProperty.call(registry, name))
    .map((name) => {
      const t = registry[name]
      return {
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.jsonSchema,
        },
      }
    })
}

export async function runTool(
  name: string,
  rawArgs: unknown,
  ctx: AgentToolContext,
): Promise<unknown> {
  const tool = (TOOLS as Record<string, AgentTool<unknown, unknown>>)[name]
  if (!tool) throw new Error(`unknown tool: ${name}`)
  const parsed = tool.parameters.safeParse(rawArgs)
  if (!parsed.success) {
    throw new Error(`invalid args for ${name}: ${parsed.error.message}`)
  }
  return tool.run(parsed.data, ctx)
}
