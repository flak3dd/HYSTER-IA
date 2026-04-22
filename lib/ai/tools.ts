import { z } from "zod"
import type { AgentTool, AgentToolContext } from "@/lib/agents/tools"
import { chatComplete } from "@/lib/agents/llm"
import { listNodes } from "@/lib/db/nodes"
import { listUsers } from "@/lib/db/users"
import { listProfiles } from "@/lib/db/profiles"
import { getServerConfig } from "@/lib/db/server-config"
import { getStatus as getManagerStatus, getLogs } from "@/lib/hysteria/manager"
import { fetchTraffic, fetchOnline } from "@/lib/hysteria/traffic"

/* ------------------------------------------------------------------ */
/*  Tool: generate_config                                             */
/* ------------------------------------------------------------------ */

const GenerateConfigInput = z.object({
  description: z
    .string()
    .min(1)
    .max(4000)
    .describe("Natural language description of the desired Hysteria2 server config"),
})

const CONFIG_SYSTEM_PROMPT = `You are a Hysteria2 server configuration expert. Given a natural language description, generate a valid Hysteria2 server configuration in YAML format.

Key Hysteria2 server config fields:
- listen: address:port (default ":443")
- tls: { cert: path, key: path } OR acme: { domains: [...], email: ... }
- obfs: { type: "salamander", salamander: { password: "..." } }
- bandwidth: { up: "1 gbps", down: "1 gbps" }
- masquerade: { type: "proxy", proxy: { url: "https://example.com", rewriteHost: true } }
- trafficStats: { listen: ":25000", secret: "..." }
- auth: { type: "http", http: { url: "http://panel-url/api/hysteria/auth", insecure: false } }

Rules:
- Generate strong random passwords for obfs and trafficStats (16+ chars)
- Default to port 443 unless specified otherwise
- Include YAML comments explaining each section
- Output ONLY valid YAML`

export const generateConfigTool: AgentTool<
  z.infer<typeof GenerateConfigInput>,
  { yaml: string }
> = {
  name: "generate_config",
  description:
    "Generate a Hysteria2 server configuration YAML from a natural language description. Returns a preview config — the admin must review before applying.",
  parameters: GenerateConfigInput,
  jsonSchema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "Natural language description of the desired config",
      },
    },
    required: ["description"],
  },
  async run(input, ctx) {
    const result = await chatComplete({
      messages: [
        { role: "system", content: CONFIG_SYSTEM_PROMPT },
        { role: "user", content: input.description },
      ],
      temperature: 0.3,
      signal: ctx.signal,
    })
    return { yaml: result.content ?? "" }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: analyze_traffic                                             */
/* ------------------------------------------------------------------ */

const AnalyzeTrafficInput = z.object({
  includeStreams: z
    .boolean()
    .default(false)
    .describe("Whether to include per-stream detail (may be large)"),
})

export const analyzeTrafficTool: AgentTool<
  z.infer<typeof AnalyzeTrafficInput>,
  {
    summary: {
      totalUsers: number
      onlineCount: number
      totalTx: number
      totalRx: number
      topUsers: Array<{ id: string; tx: number; rx: number }>
    }
    anomalies: string[]
  }
> = {
  name: "analyze_traffic",
  description:
    "Analyze current Hysteria2 traffic stats. Returns a summary (total tx/rx, top users, online count) and detected anomalies (unusually high bandwidth, auth failures, etc.).",
  parameters: AnalyzeTrafficInput,
  jsonSchema: {
    type: "object",
    properties: {
      includeStreams: {
        type: "boolean",
        default: false,
        description: "Include per-stream detail",
      },
    },
  },
  async run() {
    let traffic: Record<string, { tx: number; rx: number }> = {}
    let online: Record<string, number> = {}

    try {
      traffic = await fetchTraffic(false)
    } catch {
      traffic = {}
    }
    try {
      online = await fetchOnline()
    } catch {
      online = {}
    }

    const users = await listUsers()
    const onlineCount = Object.keys(online).length
    let totalTx = 0
    let totalRx = 0
    const perUser: Array<{ id: string; tx: number; rx: number }> = []

    for (const [id, stats] of Object.entries(traffic)) {
      totalTx += stats.tx
      totalRx += stats.rx
      perUser.push({ id, tx: stats.tx, rx: stats.rx })
    }

    perUser.sort((a, b) => b.tx + b.rx - (a.tx + a.rx))
    const topUsers = perUser.slice(0, 10)

    const anomalies: string[] = []

    // High bandwidth users (>10GB in current window)
    const HIGH_BW = 10 * 1024 * 1024 * 1024
    for (const u of topUsers) {
      if (u.tx + u.rx > HIGH_BW) {
        anomalies.push(
          `User ${u.id} has transferred ${formatBytes(u.tx + u.rx)} — unusually high`,
        )
      }
    }

    // Expired or disabled users still online
    for (const id of Object.keys(online)) {
      const user = users.find((u) => u.authToken === id || u.id === id)
      if (user && user.status === "disabled") {
        anomalies.push(`Disabled user ${user.displayName} (${user.id}) is still online`)
      }
      if (user && user.status === "expired") {
        anomalies.push(`Expired user ${user.displayName} (${user.id}) is still online`)
      }
    }

    // More online users than registered
    if (onlineCount > users.length && users.length > 0) {
      anomalies.push(
        `${onlineCount} online connections but only ${users.length} registered users`,
      )
    }

    if (anomalies.length === 0) {
      anomalies.push("No anomalies detected")
    }

    return {
      summary: {
        totalUsers: users.length,
        onlineCount,
        totalTx,
        totalRx,
        topUsers,
      },
      anomalies,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: suggest_masquerade                                          */
/* ------------------------------------------------------------------ */

const SuggestMasqueradeInput = z.object({
  category: z
    .enum(["cdn", "video", "cloud", "general"])
    .default("general")
    .describe("Category of masquerade targets to suggest"),
})

const MASQUERADE_TARGETS: Record<string, Array<{ url: string; description: string }>> = {
  cdn: [
    { url: "https://cdn.jsdelivr.net", description: "jsDelivr CDN — common static asset CDN" },
    { url: "https://cdnjs.cloudflare.com", description: "Cloudflare CDNJS — widely used" },
    { url: "https://unpkg.com", description: "UNPKG — npm CDN" },
    { url: "https://ajax.googleapis.com", description: "Google Hosted Libraries" },
  ],
  video: [
    { url: "https://www.youtube.com", description: "YouTube — high traffic video platform" },
    { url: "https://www.twitch.tv", description: "Twitch — streaming platform" },
    { url: "https://vimeo.com", description: "Vimeo — video hosting" },
  ],
  cloud: [
    { url: "https://azure.microsoft.com", description: "Microsoft Azure portal" },
    { url: "https://cloud.google.com", description: "Google Cloud" },
    { url: "https://aws.amazon.com", description: "AWS" },
    { url: "https://www.cloudflare.com", description: "Cloudflare" },
  ],
  general: [
    { url: "https://www.google.com", description: "Google — ubiquitous" },
    { url: "https://www.bing.com", description: "Bing search" },
    { url: "https://www.wikipedia.org", description: "Wikipedia" },
    { url: "https://github.com", description: "GitHub" },
  ],
}

export const suggestMasqueradeTool: AgentTool<
  z.infer<typeof SuggestMasqueradeInput>,
  { targets: Array<{ url: string; description: string }>; recommendation: string }
> = {
  name: "suggest_masquerade",
  description:
    "Suggest generic masquerade proxy targets for Hysteria2 (CDN, video, cloud, or general). Returns popular public sites that carry high volumes of legitimate TLS traffic.",
  parameters: SuggestMasqueradeInput,
  jsonSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: ["cdn", "video", "cloud", "general"],
        default: "general",
        description: "Category of masquerade targets",
      },
    },
  },
  async run(input) {
    const category = input.category ?? "general"
    const targets = MASQUERADE_TARGETS[category] ?? MASQUERADE_TARGETS.general
    const recommendation =
      category === "cdn"
        ? "CDN endpoints are ideal — they serve static assets over TLS and generate high volumes of traffic that blends well."
        : category === "video"
          ? "Video streaming sites produce large, sustained TLS flows that match proxy traffic patterns."
          : category === "cloud"
            ? "Cloud provider portals have varied TLS traffic patterns suitable for masquerading."
            : "General high-traffic sites that generate significant TLS traffic."
    return { targets, recommendation }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: troubleshoot                                                */
/* ------------------------------------------------------------------ */

const TroubleshootInput = z.object({
  issue: z
    .enum(["tls", "throughput", "connectivity", "auth", "general"])
    .default("general")
    .describe("Category of issue to diagnose"),
})

export const troubleshootTool: AgentTool<
  z.infer<typeof TroubleshootInput>,
  {
    checks: Array<{ name: string; status: "ok" | "warning" | "error"; detail: string }>
    suggestions: string[]
  }
> = {
  name: "troubleshoot",
  description:
    "Run diagnostic checks on the Hysteria2 setup. Examines server status, config, TLS, connectivity, and auth. Returns check results and suggestions.",
  parameters: TroubleshootInput,
  jsonSchema: {
    type: "object",
    properties: {
      issue: {
        type: "string",
        enum: ["tls", "throughput", "connectivity", "auth", "general"],
        default: "general",
        description: "Category of issue to diagnose",
      },
    },
  },
  async run(input) {
    const checks: Array<{
      name: string
      status: "ok" | "warning" | "error"
      detail: string
    }> = []
    const suggestions: string[] = []

    // Server process status
    const manager = getManagerStatus()
    if (manager.state === "running") {
      checks.push({
        name: "Server process",
        status: "ok",
        detail: `Running (PID ${manager.pid})`,
      })
    } else if (manager.state === "errored") {
      checks.push({
        name: "Server process",
        status: "error",
        detail: `Errored: ${manager.lastError ?? "unknown"}`,
      })
      suggestions.push("Check server logs with the log tail viewer for error details")
    } else {
      checks.push({
        name: "Server process",
        status: "warning",
        detail: `State: ${manager.state}`,
      })
    }

    // Config check
    let config: Awaited<ReturnType<typeof getServerConfig>> | null = null
    try {
      config = await getServerConfig()
      if (config) {
        checks.push({ name: "Server config", status: "ok", detail: "Config loaded" })
      } else {
        checks.push({
          name: "Server config",
          status: "error",
          detail: "No serverConfig document in Firestore",
        })
        suggestions.push("Create a server config before starting the server")
      }
    } catch {
      checks.push({
        name: "Server config",
        status: "error",
        detail: "Failed to read config from Firestore",
      })
    }

    // TLS checks
    if (input.issue === "tls" || input.issue === "general") {
      if (config?.tls) {
        const mode = config.tls.mode
        checks.push({
          name: "TLS mode",
          status: "ok",
          detail: `Using ${mode}`,
        })
        if (mode === "acme" && "domains" in config.tls) {
          checks.push({
            name: "ACME domains",
            status: "ok",
            detail: config.tls.domains.join(", "),
          })
        }
      } else {
        checks.push({
          name: "TLS config",
          status: "warning",
          detail: "No TLS config found",
        })
        suggestions.push("Configure TLS (ACME recommended) for production use")
      }
    }

    // Throughput checks
    if (input.issue === "throughput" || input.issue === "general") {
      if (config?.bandwidth) {
        checks.push({
          name: "Bandwidth limits",
          status: "ok",
          detail: `Up: ${config.bandwidth.up ?? "unlimited"}, Down: ${config.bandwidth.down ?? "unlimited"}`,
        })
      } else {
        checks.push({
          name: "Bandwidth limits",
          status: "warning",
          detail: "No bandwidth limits set — clients may saturate the connection",
        })
        suggestions.push("Set bandwidth limits to prevent any single client from consuming all bandwidth")
      }
    }

    // Connectivity
    if (input.issue === "connectivity" || input.issue === "general") {
      try {
        const onlineMap = await fetchOnline()
        const onlineCount = Object.keys(onlineMap).length
        checks.push({
          name: "Online clients",
          status: onlineCount > 0 ? "ok" : "warning",
          detail: `${onlineCount} client(s) online`,
        })
      } catch {
        checks.push({
          name: "Traffic Stats API",
          status: "error",
          detail: "Cannot reach the Hysteria2 Traffic Stats API",
        })
        suggestions.push("Verify the Traffic Stats API is enabled and HYSTERIA_TRAFFIC_API_BASE_URL is correct")
      }
    }

    // Auth
    if (input.issue === "auth" || input.issue === "general") {
      if (config?.authBackendUrl) {
        checks.push({
          name: "Auth backend",
          status: "ok",
          detail: `URL: ${config.authBackendUrl}`,
        })
      } else {
        checks.push({
          name: "Auth backend",
          status: "warning",
          detail: "No auth backend URL configured",
        })
      }
    }

    // Nodes
    const nodes = await listNodes()
    const runningNodes = nodes.filter((n) => n.status === "running")
    checks.push({
      name: "Managed nodes",
      status: runningNodes.length > 0 ? "ok" : "warning",
      detail: `${runningNodes.length}/${nodes.length} nodes running`,
    })

    // Recent logs for errors
    const recentLogs = getLogs(50)
    const errorLogs = recentLogs.filter(
      (l) => l.includes("[err]") || l.toLowerCase().includes("error"),
    )
    if (errorLogs.length > 0) {
      checks.push({
        name: "Recent errors in logs",
        status: "warning",
        detail: `${errorLogs.length} error line(s) in recent logs`,
      })
      suggestions.push("Review server logs — recent errors detected")
    }

    if (suggestions.length === 0) {
      suggestions.push("All checks passed — no issues detected")
    }

    return { checks, suggestions }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: list_profiles                                               */
/* ------------------------------------------------------------------ */

const NoInput = z.object({})

export const listProfilesTool: AgentTool<
  z.infer<typeof NoInput>,
  Array<{
    id: string
    name: string
    type: string
    nodeCount: number
    tags: string[]
  }>
> = {
  name: "list_profiles",
  description: "List all configuration profiles. Each profile is a reusable config template that can be applied to nodes.",
  parameters: NoInput,
  jsonSchema: { type: "object", properties: {} },
  async run() {
    const profiles = await listProfiles()
    return profiles.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      nodeCount: p.nodeIds.length,
      tags: p.tags,
    }))
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: get_server_logs                                             */
/* ------------------------------------------------------------------ */

const GetLogsInput = z.object({
  tail: z.number().int().min(1).max(500).default(100),
})

export const getServerLogsTool: AgentTool<
  z.infer<typeof GetLogsInput>,
  { lines: string[]; count: number }
> = {
  name: "get_server_logs",
  description: "Get recent Hysteria2 server log lines (from the managed process).",
  parameters: GetLogsInput,
  jsonSchema: {
    type: "object",
    properties: {
      tail: { type: "integer", minimum: 1, maximum: 500, default: 100 },
    },
  },
  async run(input) {
    const lines = getLogs(input.tail)
    return { lines, count: lines.length }
  },
}

/* ------------------------------------------------------------------ */
/*  Registry of all AI chat tools                                     */
/* ------------------------------------------------------------------ */

export const AI_TOOLS = {
  [generateConfigTool.name]: generateConfigTool,
  [analyzeTrafficTool.name]: analyzeTrafficTool,
  [suggestMasqueradeTool.name]: suggestMasqueradeTool,
  [troubleshootTool.name]: troubleshootTool,
  [listProfilesTool.name]: listProfilesTool,
  [getServerLogsTool.name]: getServerLogsTool,
} as const

export const AI_TOOL_NAMES = Object.keys(AI_TOOLS)

export function aiToolDefinitions() {
  return Object.values(AI_TOOLS).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.jsonSchema,
    },
  }))
}

export async function runAiTool(
  name: string,
  rawArgs: unknown,
  ctx: AgentToolContext,
): Promise<unknown> {
  const tool = (AI_TOOLS as Record<string, AgentTool<unknown, unknown>>)[name]
  if (!tool) throw new Error(`unknown tool: ${name}`)
  const parsed = tool.parameters.safeParse(rawArgs)
  if (!parsed.success) {
    throw new Error(`invalid args for ${name}: ${parsed.error.message}`)
  }
  return tool.run(parsed.data, ctx)
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
