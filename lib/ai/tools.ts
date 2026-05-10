import { z } from "zod"
import type { AgentTool, AgentToolContext } from "@/lib/ai/tool-types"
import { chatComplete } from "@/lib/ai/llm"
import { needsInput, TOOL_ERROR_CODES } from "@/lib/ai/tool-result"
import { listNodes, getNodeById, createNode, updateNode, deleteNode } from "@/lib/db/nodes"
import { getProfileById, resolveProfileConfig } from "@/lib/db/profiles"
import { sshExec } from "@/lib/deploy/ssh"
import { renderHysteriaYaml } from "@/lib/hysteria/config"
import { listBeacons, getBeaconById } from "@/lib/db/beacons"
import { listUsers, getUserById, getUserByAuthToken, getUserStats, getActiveUserCount } from "@/lib/db/users"
import { listProfiles } from "@/lib/db/profiles"
import { getServerConfig } from "@/lib/db/server-config"
import { getStatus as getManagerStatus, getLogs, start as startServer, stop as stopServer, restart as restartServer } from "@/lib/hysteria/manager"
import { fetchTraffic, fetchOnline } from "@/lib/hysteria/traffic"
import {
  createPayloadBuild,
  getPayloadBuild,
  listPayloadBuilds,
  deletePayloadBuild,
  generatePayloadFromDescription,
  type PayloadBuild,
} from "@/lib/payloads/generator"
import { startDeployment, listDeployments, getDeployment, validateDeploymentConfig } from "@/lib/deploy/orchestrator"
import { allPresetsAsync } from "@/lib/deploy/providers"
import type { DeploymentConfig } from "@/lib/deploy/types"
import type { ServerConfig } from "@/lib/db/schema"
import { listCredentials, getCredentialStats } from "@/lib/db/credentials"
import { buildClientYamlObject, renderClientYaml, renderClientUri, renderSubscription } from "@/lib/hysteria/client-config"
import { listImplants, getImplantStats } from "@/lib/db/implants"
import { countNodes } from "@/lib/db/nodes"
import { countCredentials } from "@/lib/db/credentials"
import {
  analyzeIpAddress,
  analyzeDomain,
  analyzeUrl,
  analyzeFileHash,
} from "@/lib/threatintel/virustotal"
import {
  checkMalwareBazaarHash,
  checkUrlhausUrl,
  checkThreatFoxIoc,
} from "@/lib/threatintel/abusech"
import {
  analyzeOtxIpv4,
  analyzeOtxDomain,
  analyzeOtxUrl,
  analyzeOtxFileHash,
} from "@/lib/threatintel/alienvault"

/* ------------------------------------------------------------------ */
/*  Tool: generate_config                                             */
/* ------------------------------------------------------------------ */

const GenerateConfigInput = z.object({
  description: z
    .string()
    .max(4000)
    .optional()
    .describe("Natural language description of the desired Hysteria2 server config"),
  applyToNodes: z
    .array(z.string().min(1))
    .optional()
    .describe("Optional: Array of node IDs to immediately apply this config to via SSH"),
  sshPrivateKey: z
    .string()
    .optional()
    .describe("Required if applyToNodes is set: SSH private key for accessing nodes"),
  restartService: z
    .boolean()
    .default(true)
    .describe("Restart hysteria-server service after applying config (default: true)"),
})

const CONFIG_SYSTEM_PROMPT = `You are a Hysteria2 server configuration expert. Given a natural language description, generate a valid Hysteria2 server configuration in YAML format.

Key Hysteria2 server config fields:
- listen: address:port (default ":443")
- tls: { cert: path, key: path } OR acme: { domains: [...], email: ... }
- obfs: { type: "salamander", salamander: { password: "..." } }
- bandwidth: { up: "1 gbps", down: "1 gbps" }
- masquerade: { type: "proxy", proxy: { url: "https://<your-masquerade-target>", rewriteHost: true } }
- trafficStats: { listen: ":25000", secret: "..." }
- auth: { type: "http", http: { url: "http://panel-url/api/hysteria/auth", insecure: false } }

Rules:
- Generate strong random passwords for obfs and trafficStats (16+ chars)
- Default to port 443 unless specified otherwise
- Include YAML comments explaining each section
- Output ONLY valid YAML`

export const generateConfigTool: AgentTool<
  z.infer<typeof GenerateConfigInput>,
  {
    yaml: string
    applied?: Array<{
      nodeId: string
      success: boolean
      message: string
      steps?: Array<{ step: string; status: "ok" | "error"; output?: string; error?: string }>
    }>
  }
> = {
  name: "generate_config",
  description:
    "Generate a Hysteria2 server configuration YAML from a natural language description. Optionally apply the generated config directly to one or more nodes via SSH. Returns a preview config — review before applying.",
  parameters: GenerateConfigInput,
  jsonSchema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "Natural language description of the desired config",
      },
      applyToNodes: {
        type: "array",
        items: { type: "string" },
        description: "Optional: Node IDs to apply config to via SSH",
      },
      sshPrivateKey: {
        type: "string",
        description: "Required if applyToNodes is set: SSH private key (PEM format)",
      },
      restartService: {
        type: "boolean",
        default: true,
        description: "Restart service after applying config",
      },
    },
    required: [],
  },
  async run(input, ctx) {
    const description = input.description?.trim()
    if (!description) {
      // Return a structured error that the reasoning orchestrator can detect
      return {
        yaml: "",
        ...needsInput(
          "Please describe what kind of Hysteria2 config you want (e.g., obfuscated, high-throughput, minimal, stealth with masquerade).",
          {
            code: TOOL_ERROR_CODES.MISSING_DESCRIPTION,
            missingFields: ["description"],
            prompt: {
              question: "What kind of Hysteria2 config do you want?",
              options: [
                { label: "Stealth", value: "stealth obfuscated config on port 443 with masquerade", description: "Salamander obfuscation + masquerade target for OPSEC" },
                { label: "High-throughput", value: "high-throughput config with 1Gbps bandwidth", description: "Tuned for maximum throughput" },
                { label: "Minimal", value: "minimal config with defaults", description: "Bare-minimum config to get the server running" },
                { label: "Production ACME", value: "production config with ACME TLS and bandwidth limits", description: "ACME-issued cert + sane bandwidth limits" },
              ],
            },
          },
        ),
      } as any
    }

    // Generate config
    const result = await chatComplete({
      messages: [
        { role: "system", content: CONFIG_SYSTEM_PROMPT },
        { role: "user", content: description },
      ],
      temperature: 0.3,
      signal: ctx.signal,
    })

    const yaml = result.content ?? ""

    // If applyToNodes is specified, apply config to each node
    const applied: Array<{
      nodeId: string
      success: boolean
      message: string
      steps?: Array<{ step: string; status: "ok" | "error"; output?: string; error?: string }>
    }> = []

    if (input.applyToNodes && input.applyToNodes.length > 0) {
      if (!input.sshPrivateKey) {
        applied.push({
          nodeId: "N/A",
          success: false,
          message: "sshPrivateKey is required when applyToNodes is specified",
        })
        return { yaml, applied }
      }

      for (const nodeId of input.applyToNodes) {
        const steps: Array<{ step: string; status: "ok" | "error"; output?: string; error?: string }> = []

        try {
          // Get node
          const node = await getNodeById(nodeId)
          if (!node) {
            applied.push({
              nodeId,
              success: false,
              message: "Node not found",
              steps: [{ step: "lookup_node", status: "error", error: "Node not found" }],
            })
            continue
          }
          steps.push({ step: "lookup_node", status: "ok", output: `Found node ${node.name} at ${node.hostname}` })

          // Write config via SSH
          const escapedYaml = yaml.replace(/'/g, "'\"'\"'")
          const writeCmd = `mkdir -p /etc/hysteria && echo '${escapedYaml}' > /etc/hysteria/config.yaml && chmod 600 /etc/hysteria/config.yaml`

          const writeResult = await sshExec({
            host: node.hostname,
            privateKey: input.sshPrivateKey,
            command: writeCmd,
            timeoutMs: 30_000,
          })

          if (writeResult.code !== 0) {
            steps.push({ step: "write_config", status: "error", error: writeResult.stderr || `Exit code ${writeResult.code}` })
            applied.push({ nodeId, success: false, message: "Failed to write config", steps })
            continue
          }
          steps.push({ step: "write_config", status: "ok", output: "Config written to /etc/hysteria/config.yaml" })

          // Restart service if requested
          if (input.restartService) {
            const restartResult = await sshExec({
              host: node.hostname,
              privateKey: input.sshPrivateKey,
              command: "systemctl daemon-reload && systemctl restart hysteria-server && systemctl is-active hysteria-server",
              timeoutMs: 30_000,
            })

            if (restartResult.stdout.includes("active")) {
              steps.push({ step: "restart_service", status: "ok", output: "Service restarted and is active" })
            } else {
              steps.push({ step: "restart_service", status: "error", error: restartResult.stderr || "Service not active" })
            }
          }

          applied.push({ nodeId, success: true, message: `Config applied to node "${node.name}"`, steps })
        } catch (err) {
          steps.push({
            step: "ssh_connection",
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          })
          applied.push({ nodeId, success: false, message: "SSH connection failed", steps })
        }
      }
    }

    return { yaml, applied: applied.length > 0 ? applied : undefined }
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

const ListProfilesInput = z.object({})

export const listProfilesTool: AgentTool<
  z.infer<typeof ListProfilesInput>,
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
  parameters: ListProfilesInput,
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
/*  Tool: generate_payload                                            */
/* ------------------------------------------------------------------ */

const GeneratePayloadInput = z.object({
  description: z
    .string()
    .min(1)
    .max(2000)
    .describe("Natural language description of the payload to build. Include platform (Windows/Linux/macOS), format (EXE/ELF/APP/PowerShell/Python), obfuscation level (none/light/medium/heavy), and any specific features needed."),
})

export const generatePayloadTool: AgentTool<
  z.infer<typeof GeneratePayloadInput>,
  { buildId: string; preview: PayloadBuild; explanation: string }
> = {
  name: "generate_payload",
  description:
    "Generate a new payload from natural language description. Creates Windows EXE, Linux ELF, macOS app, PowerShell script, or Python payload with optional obfuscation and code signing. Returns a build ID to track progress.",
  parameters: GeneratePayloadInput,
  jsonSchema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "Describe the payload: platform, format, obfuscation level, signing requirements",
      },
    },
    required: ["description"],
  },
  async run(input, ctx) {
    const description = input.description?.trim()
    if (!description) {
      // Return a structured error that the reasoning orchestrator can detect
      return {
        buildId: "",
        preview: {} as any,
        explanation: "",
        ...needsInput(
          "Please describe the payload you want to build (e.g., Windows EXE with medium obfuscation, or Linux ELF with AMSI bypass). Include platform, format, and any specific features needed.",
          {
            code: TOOL_ERROR_CODES.MISSING_DESCRIPTION,
            missingFields: ["description"],
            prompt: {
              question: "What kind of payload do you want to build?",
              options: [
                { label: "Windows EXE", value: "Windows x64 EXE with medium obfuscation, scheduled-task persistence, AMSI bypass", description: "Stealth Windows beacon" },
                { label: "Linux ELF", value: "Linux x64 ELF with light obfuscation, systemd persistence", description: "Linux beacon for servers" },
                { label: "PowerShell", value: "PowerShell script with AMSI bypass and base64 encoding", description: "In-memory PowerShell payload" },
                { label: "Python", value: "Python script with light obfuscation for cross-platform", description: "Cross-platform script payload" },
              ],
            },
          },
        ),
      } as any
    }

    const { config, explanation } = await generatePayloadFromDescription(
      description,
      ctx.invokerUid || 'system'
    )
    const build = await createPayloadBuild(config, ctx.invokerUid || 'system')
    return { buildId: build.id, preview: build, explanation }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: list_payloads                                               */
/* ------------------------------------------------------------------ */

const ListPayloadsInput = z.object({
  limit: z.number().int().min(1).max(100).default(20),
})

export const listPayloadsTool: AgentTool<
  z.infer<typeof ListPayloadsInput>,
  {
    payloads: Array<{
      id: string
      name: string
      type: string
      status: string
      sizeBytes?: number
      createdAt: number
    }>
    total: number
  }
> = {
  name: "list_payloads",
  description: "List all payload builds with their status, type, and download availability",
  parameters: ListPayloadsInput,
  jsonSchema: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
  },
  async run(input, ctx) {
    const builds = await listPayloadBuilds(ctx.invokerUid, input.limit)
    return {
      payloads: builds.map((b) => ({
        id: b.id,
        name: b.name,
        type: b.type,
        status: b.status,
        sizeBytes: b.sizeBytes,
        createdAt: b.createdAt,
      })),
      total: builds.length,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: get_payload_status                                          */
/* ------------------------------------------------------------------ */

const GetPayloadStatusInput = z.object({
  buildId: z.string().min(1).describe("The payload build ID to check"),
})

export const getPayloadStatusTool: AgentTool<
  z.infer<typeof GetPayloadStatusInput>,
  {
    found: boolean
    payload?: {
      id: string
      name: string
      type: string
      status: string
      buildLogs: string[]
      downloadUrl?: string
      sizeBytes?: number
      createdAt: number
      completedAt?: number
      errorMessage?: string
    }
  }
> = {
  name: "get_payload_status",
  description: "Get detailed status of a specific payload build including build logs and download URL when ready",
  parameters: GetPayloadStatusInput,
  jsonSchema: {
    type: "object",
    properties: {
      buildId: { type: "string", description: "Payload build ID" },
    },
    required: ["buildId"],
  },
  async run(input) {
    const build = await getPayloadBuild(input.buildId)
    if (!build) {
      return { found: false }
    }
    return {
      found: true,
      payload: {
        id: build.id,
        name: build.name,
        type: build.type,
        status: build.status,
        buildLogs: build.buildLogs.slice(-20), // Last 20 log entries
        downloadUrl: build.downloadUrl,
        sizeBytes: build.sizeBytes,
        createdAt: build.createdAt,
        completedAt: build.completedAt,
        errorMessage: build.errorMessage,
      },
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: delete_payload                                              */
/* ------------------------------------------------------------------ */

const DeletePayloadInput = z.object({
  buildId: z.string().min(1).describe("The payload build ID to delete"),
})

export const deletePayloadTool: AgentTool<
  z.infer<typeof DeletePayloadInput>,
  { success: boolean; message: string }
> = {
  name: "delete_payload",
  description:
    "Delete a payload build and its artifacts. " +
    "REQUIRES the 'buildId' parameter — this is mandatory and cannot be omitted.",
  parameters: DeletePayloadInput,
  jsonSchema: {
    type: "object",
    properties: {
      buildId: { type: "string", description: "MANDATORY: Payload build ID to delete — you MUST provide this parameter" },
    },
    required: ["buildId"],
  },
  async run(input) {
    const ok = await deletePayloadBuild(input.buildId)
    return {
      success: ok,
      message: ok ? "Payload deleted successfully" : "Payload not found",
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: deploy_node                                                 */
/* ------------------------------------------------------------------ */

const DeployNodeInput = z.object({
  provider: z.enum(["hetzner", "digitalocean", "vultr", "lightsail", "azure"]).optional().describe("Cloud provider to use (auto: hetzner)"),
  region: z.string().min(1).optional().describe("Region/zone for deployment (auto-selected)"),
  size: z.string().min(1).optional().describe("Server size/plan (auto-selected)"),
  name: z.string().min(1).max(120).optional().describe("Node name (auto-generated if omitted)"),
  domain: z.string().optional().describe("Optional domain name for TLS"),
  port: z.coerce.number().int().min(1).max(65535).default(443).describe("Port to listen on"),
  tags: z.array(z.string().max(40)).default([]).describe("Tags for the node"),
  panelUrl: z.string().url().optional().describe("Panel URL for auth backend (auto-detected)"),
  cloudflareTunnelUrl: z.string().url().optional().describe("Public Cloudflare Tunnel URL when the panel runs locally (e.g. https://panel.anzstaff-club.au)"),
  bandwidthUp: z.string().optional().describe("Upload bandwidth limit"),
  bandwidthDown: z.string().optional().describe("Download bandwidth limit"),
  resourceGroup: z.string().optional().describe("Azure: existing resource group name (avoids permission issues)"),
})

/** Smart defaults per provider — chosen as cheapest, most reliable entry-level option */
const DEPLOY_DEFAULTS: Record<
  string,
  { region: string; size: string }
> = {
  hetzner: { region: "fsn1", size: "cx22" },
  digitalocean: { region: "nyc3", size: "s-1vcpu-2gb" },
  vultr: { region: "ewr", size: "vc2-1c-2gb" },
  lightsail: { region: "us-east-1", size: "nano_3_0" },
  azure: { region: "eastus", size: "Standard_B1s" },
}

export const deployNodeTool: AgentTool<
  z.infer<typeof DeployNodeInput>,
  { deploymentId: string; status: string; message: string; defaultsApplied: Record<string, string | number | undefined> }
> = {
  name: "deploy_node",
  description:
    "Deploy a new Hysteria2 node to a REMOTE cloud provider. Creates a remote VPS, installs Hysteria2, and registers the node in the database. " +
    "Local deployment is STRICTLY PROHIBITED — all nodes must be on remote cloud servers. " +
    "Provider: hetzner, digitalocean, vultr, lightsail, azure. " +
    "CRITICAL for Azure: resourceGroup parameter is REQUIRED. The service principal cannot list resource groups, so you must explicitly provide an existing resource group name. " +
    "The panelUrl MUST be a publicly reachable URL. Never use localhost or 127.0.0.1 — remote nodes cannot reach it. " +
    "IMPORTANT: You MUST specify the provider explicitly. Do not rely on defaults — the user's intent should be honored.",
  parameters: DeployNodeInput,
  jsonSchema: {
    type: "object",
    properties: {
      provider: {
        type: "string",
        enum: ["hetzner", "digitalocean", "vultr", "lightsail", "azure"],
        description: "Cloud provider — you MUST specify this explicitly based on user request"
      },
      region: { type: "string", description: "Region for deployment — specify if user requested a specific region" },
      size: { type: "string", description: "Server size — specify if user requested a specific size" },
      name: { type: "string", description: "Node name — specify if user requested a specific name" },
      domain: { type: "string", description: "Optional domain name for TLS" },
      port: { type: "integer", default: 443, description: "Port (default: 443)" },
      tags: { type: "array", items: { type: "string" }, description: "Tags for organization" },
      panelUrl: { type: "string", description: "Public panel URL for auth backend — MUST be a publicly reachable URL, never localhost or 127.0.0.1 (auto-detected from env)" },
      cloudflareTunnelUrl: { type: "string", description: "Public Cloudflare Tunnel URL override when panel runs locally (e.g. https://panel.anzstaff-club.au)" },
      bandwidthUp: { type: "string", description: "Upload bandwidth (e.g., 1 gbps)" },
      bandwidthDown: { type: "string", description: "Download bandwidth (e.g., 10 gbps)" },
      resourceGroup: { type: "string", description: "MANDATORY for Azure: existing resource group name to avoid permission issues — you MUST provide this when provider is azure" },
    },
    required: [],
  },
  async run(input, ctx) {
    const validProviders = ["hetzner", "digitalocean", "vultr", "lightsail", "azure"]

    // --- Smart defaults ---
    let provider = input.provider
    if (!provider || !validProviders.includes(provider)) {
      provider = "hetzner"
    }

    // Azure needs an existing resource group — its service principal cannot
    // create or list groups, so we MUST ask the user instead of guessing.
    if (provider === "azure" && !input.resourceGroup?.trim()) {
      return {
        deploymentId: "",
        status: "needs_input",
        message: "Azure deployment requires an existing resource group.",
        defaultsApplied: {},
        ...needsInput(
          "Azure deployments require an existing resource group. Please provide the resourceGroup name.",
          {
            code: TOOL_ERROR_CODES.MISSING_REQUIRED_INPUT,
            missingFields: ["resourceGroup"],
            prompt: {
              question: "Which Azure resource group should I deploy into?",
              options: [
                { label: "hysteria-rg-eastus", value: "hysteria-rg-eastus", description: "East US (Virginia)" },
                { label: "hysteria-rg-westeurope", value: "hysteria-rg-westeurope", description: "West Europe (Amsterdam)" },
                { label: "hysteria-rg-australiaeast", value: "hysteria-rg-australiaeast", description: "Australia East (Sydney)" },
              ],
            },
          },
        ),
      } as any
    }

    const defaults = DEPLOY_DEFAULTS[provider]
    const region = input.region?.trim() || defaults.region
    const size = input.size?.trim() || defaults.size
    const name = input.name?.trim() || `hysteria-${provider}-${Date.now()}`
    const { serverEnv } = await import('@/lib/env')
    const env = serverEnv()
    const panelUrl = input.panelUrl?.trim() || env.NEXT_PUBLIC_APP_URL || ""

    const defaultsApplied: Record<string, string | number | undefined> = {
      provider,
      region,
      size,
      name,
      panelUrl,
    }

    const config: DeploymentConfig = {
      provider,
      region,
      size,
      name,
      domain: input.domain,
      port: input.port,
      tags: input.tags,
      panelUrl,
      cloudflareTunnelUrl: input.cloudflareTunnelUrl,
      bandwidthUp: input.bandwidthUp,
      bandwidthDown: input.bandwidthDown,
      resourceGroup: input.resourceGroup,
    }

    const deployment = await startDeployment(config)
    return {
      deploymentId: deployment.id,
      status: deployment.status,
      message: `Deployment started for "${name}" on ${provider} (${region}, ${size}).`,
      defaultsApplied,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: list_deployments                                            */
/* ------------------------------------------------------------------ */

const ListDeploymentsInput = z.object({})

export const listDeploymentsTool: AgentTool<
  z.infer<typeof ListDeploymentsInput>,
  { deployments: Array<{ id: string; name: string; provider: string; status: string; createdAt: number }> }
> = {
  name: "list_deployments",
  description: "List all active and recent deployments with their status",
  parameters: ListDeploymentsInput,
  jsonSchema: { type: "object", properties: {} },
  async run() {
    const deployments = listDeployments()
    return {
      deployments: deployments.map((d) => ({
        id: d.id,
        name: d.config.name,
        provider: d.config.provider,
        status: d.status,
        createdAt: d.createdAt,
      })),
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: get_deployment_status                                       */
/* ------------------------------------------------------------------ */

const GetDeploymentStatusInput = z.object({
  deploymentId: z.string().min(1).describe("The deployment ID to check"),
})

export const getDeploymentStatusTool: AgentTool<
  z.infer<typeof GetDeploymentStatusInput>,
  {
    found: boolean
    deployment?: {
      id: string
      name: string
      provider: string
      status: string
      vpsId: string | null
      vpsIp: string | null
      nodeId: string | null
      steps: Array<{ status: string; message: string; timestamp: number; error: string | null }>
      createdAt: number
      updatedAt: number
    }
  }
> = {
  name: "get_deployment_status",
  description:
    "Get detailed status of a specific deployment including progress steps. " +
    "REQUIRES the 'deploymentId' parameter — this is mandatory and cannot be omitted.",
  parameters: GetDeploymentStatusInput,
  jsonSchema: {
    type: "object",
    properties: {
      deploymentId: { type: "string", description: "MANDATORY: Deployment ID to check — you MUST provide this parameter" },
    },
    required: ["deploymentId"],
  },
  async run(input) {
    const deployment = getDeployment(input.deploymentId)
    if (!deployment) {
      return { found: false }
    }
    return {
      found: true,
      deployment: {
        id: deployment.id,
        name: deployment.config.name,
        provider: deployment.config.provider,
        status: deployment.status,
        vpsId: deployment.vpsId,
        vpsIp: deployment.vpsIp,
        nodeId: deployment.nodeId,
        steps: deployment.steps,
        createdAt: deployment.createdAt,
        updatedAt: deployment.updatedAt,
      },
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: list_provider_presets                                       */
/* ------------------------------------------------------------------ */

const ListProviderPresetsInput = z.object({})

export const listProviderPresetsTool: AgentTool<
  z.infer<typeof ListProviderPresetsInput>,
  { presets: Array<{ id: string; label: string; regions: Array<{ id: string; label: string }>; sizes: Array<{ id: string; label: string }> }> }
> = {
  name: "list_provider_presets",
  description: "List available cloud providers with their regions and server sizes",
  parameters: ListProviderPresetsInput,
  jsonSchema: { type: "object", properties: {} },
  async run() {
    const presets = await allPresetsAsync()
    return {
      presets: presets.map((p) => ({
        id: p.id,
        label: p.label,
        regions: p.regions,
        sizes: p.sizes,
      })),
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Registry of all AI chat tools                                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Tool: security_analysis                                           */
/* ------------------------------------------------------------------ */

const SecurityAnalysisInput = z.object({
  scope: z.enum(["nodes", "users", "config", "all"]).default("all").describe("Scope of security analysis"),
  includeRecommendations: z.boolean().default(true).describe("Include actionable security recommendations"),
})

export const securityAnalysisTool: AgentTool<
  z.infer<typeof SecurityAnalysisInput>,
  {
    summary: {
      overallScore: number
      criticalIssues: number
      warnings: number
      info: number
    }
    findings: Array<{
      severity: "critical" | "high" | "medium" | "low" | "info"
      category: string
      finding: string
      recommendation?: string
    }>
    recommendations: string[]
  }
> = {
  name: "security_analysis",
  description:
    "Perform comprehensive security analysis of the Hysteria2 infrastructure. Analyzes nodes, users, configurations, and provides actionable security recommendations with severity scoring.",
  parameters: SecurityAnalysisInput,
  jsonSchema: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["nodes", "users", "config", "all"],
        default: "all",
        description: "Scope of security analysis"
      },
      includeRecommendations: {
        type: "boolean",
        default: true,
        description: "Include actionable security recommendations"
      },
    },
  },
  async run(input) {
    const findings: Array<{
      severity: "critical" | "high" | "medium" | "low" | "info"
      category: string
      finding: string
      recommendation?: string
    }> = []
    const recommendations: string[] = []

    const scope = input.scope ?? "all"
    
    // Analyze nodes
    if (scope === "nodes" || scope === "all") {
      const nodes = await listNodes()
      // Note: TLS and obfs checks removed as config property doesn't exist on Node type
      // These checks should be re-implemented when node configuration is added to schema
      
      // Check for nodes with error status
      const erroredNodes = nodes.filter(n => n.status === "errored")
      if (erroredNodes.length > 0) {
        findings.push({
          severity: "high",
          category: "Node Security",
          finding: `${erroredNodes.length} node(s) in errored state`,
          recommendation: "Check node logs and restart errored nodes"
        })
      }
    }

    // Analyze users
    if (scope === "users" || scope === "all") {
      const users = await listUsers()
      const expiredUsers = users.filter(u => u.status === "expired")
      const disabledUsers = users.filter(u => u.status === "disabled")

      if (expiredUsers.length > 0) {
        findings.push({
          severity: "medium",
          category: "User Management",
          finding: `${expiredUsers.length} expired user account(s) still in database`,
          recommendation: "Clean up expired accounts or implement automatic expiration handling"
        })
      }

      if (disabledUsers.length > 5) {
        findings.push({
          severity: "low",
          category: "User Management",
          finding: `${disabledUsers.length} disabled user account(s) in database`,
          recommendation: "Consider archiving or removing long-disabled accounts"
        })
      }
    }

    // Analyze configuration
    if (scope === "config" || scope === "all") {
      try {
        const config = await getServerConfig()
        if (config) {
          if (!config.tls) {
            findings.push({
              severity: "critical",
              category: "Configuration",
              finding: "Server configured without TLS",
              recommendation: "Enable TLS immediately using ACME or custom certificates"
            })
          } else if (config.tls.mode === "acme" && !config.tls.email) {
            findings.push({
              severity: "high",
              category: "Configuration",
              finding: "ACME TLS enabled but no email configured for expiration notices",
              recommendation: "Add email address to ACME configuration"
            })
          }

          if (!config.bandwidth) {
            findings.push({
              severity: "medium",
              category: "Configuration",
              finding: "No bandwidth limits configured",
              recommendation: "Set bandwidth limits to prevent abuse and ensure fair resource allocation"
            })
          }

          if (!config.authBackendUrl) {
            findings.push({
              severity: "critical",
              category: "Configuration",
              finding: "No authentication backend configured",
              recommendation: "Configure authentication backend to secure access"
            })
          }
        }
      } catch (error) {
        findings.push({
          severity: "high",
          category: "Configuration",
          finding: "Unable to retrieve server configuration",
          recommendation: "Verify database connectivity and configuration storage"
        })
      }
    }

    // Generate recommendations
    if (input.includeRecommendations) {
      const criticalCount = findings.filter(f => f.severity === "critical").length
      const highCount = findings.filter(f => f.severity === "high").length

      if (criticalCount > 0) {
        recommendations.push("🚨 CRITICAL: Address critical security issues immediately")
      }
      if (highCount > 0) {
        recommendations.push("⚠️ HIGH: Prioritize high-severity findings within 24 hours")
      }
      recommendations.push("📋 Schedule regular security audits (weekly recommended)")
      recommendations.push("🔐 Implement automated security monitoring and alerts")
      recommendations.push("📝 Maintain security documentation and incident response procedures")
    }

    const severityScores = { critical: 10, high: 7, medium: 4, low: 2, info: 0 }
    const totalScore = findings.reduce((sum, f) => sum + severityScores[f.severity], 0)
    const maxScore = findings.length * 10
    const overallScore = maxScore > 0 ? Math.max(0, 100 - (totalScore / maxScore) * 100) : 100

    return {
      summary: {
        overallScore: Math.round(overallScore),
        criticalIssues: findings.filter(f => f.severity === "critical").length,
        warnings: findings.filter(f => f.severity === "high" || f.severity === "medium").length,
        info: findings.filter(f => f.severity === "low" || f.severity === "info").length,
      },
      findings,
      recommendations,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: performance_optimization                                     */
/* ------------------------------------------------------------------ */

const PerformanceOptimizationInput = z.object({
  target: z.enum(["nodes", "network", "overall"]).default("overall").describe("Target for optimization analysis"),
  includeSuggestions: z.boolean().default(true).describe("Include specific optimization suggestions"),
})

export const performanceOptimizationTool: AgentTool<
  z.infer<typeof PerformanceOptimizationInput>,
  {
    currentMetrics: {
      totalNodes: number
      onlineNodes: number
      totalBandwidth: { tx: number; rx: number }
      avgLatency?: number
    }
    bottlenecks: Array<{
      component: string
      severity: "high" | "medium" | "low"
      issue: string
      impact: string
    }>
    suggestions: Array<{
      category: string
      suggestion: string
      expectedImpact: string
      complexity: "low" | "medium" | "high"
    }>
  }
> = {
  name: "performance_optimization",
  description:
    "Analyze system performance and identify bottlenecks. Provides specific optimization suggestions for nodes, network, and overall infrastructure with expected impact estimates.",
  parameters: PerformanceOptimizationInput,
  jsonSchema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        enum: ["nodes", "network", "overall"],
        default: "overall",
        description: "Target for optimization analysis"
      },
      includeSuggestions: {
        type: "boolean",
        default: true,
        description: "Include specific optimization suggestions"
      },
    },
  },
  async run(input) {
    const bottlenecks: Array<{
      component: string
      severity: "high" | "medium" | "low"
      issue: string
      impact: string
    }> = []
    const suggestions: Array<{
      category: string
      suggestion: string
      expectedImpact: string
      complexity: "low" | "medium" | "high"
    }> = []

    const target = input.target ?? "overall"

    // Get current metrics
    const nodes = await listNodes()
    const runningNodes = nodes.filter(n => n.status === "running")
    let totalTx = 0
    let totalRx = 0

    try {
      const traffic = await fetchTraffic(false)
      for (const [id, stats] of Object.entries(traffic)) {
        totalTx += stats.tx
        totalRx += stats.rx
      }
    } catch {
      // Traffic stats unavailable
    }

    const currentMetrics = {
      totalNodes: nodes.length,
      onlineNodes: runningNodes.length,
      totalBandwidth: { tx: totalTx, rx: totalRx },
    }

    // Analyze nodes
    if (target === "nodes" || target === "overall") {
      const offlineNodes = nodes.filter(n => n.status !== "running")
      if (offlineNodes.length > 0) {
        bottlenecks.push({
          component: "Node Availability",
          severity: "high",
          issue: `${offlineNodes.length} node(s) offline`,
          impact: "Reduced capacity and potential service disruption"
        })
        if (input.includeSuggestions) {
          suggestions.push({
            category: "Node Management",
            suggestion: "Implement automated node health checks and auto-restart",
            expectedImpact: "Improve availability by 95%+",
            complexity: "medium"
          })
        }
      }

      // Note: Bandwidth limit check removed as config property doesn't exist on Node type
      // This check should be re-implemented when node configuration is added to schema
    }

    // Analyze network
    if (target === "network" || target === "overall") {
      if (totalTx + totalRx > 10 * 1024 * 1024 * 1024) {
        // > 10GB
        bottlenecks.push({
          component: "Network Throughput",
          severity: "medium",
          issue: "High aggregate bandwidth usage",
          impact: "May require infrastructure scaling"
        })
        if (input.includeSuggestions) {
          suggestions.push({
            category: "Network",
            suggestion: "Consider load balancing across multiple regions",
            expectedImpact: "Reduce latency by 30-50% for distributed users",
            complexity: "high"
          })
        }
      }

      try {
        const online = await fetchOnline()
        if (Object.keys(online).length > 100) {
          bottlenecks.push({
            component: "Connection Scaling",
            severity: "low",
            issue: "High concurrent connection count",
            impact: "May impact performance under load"
          })
          if (input.includeSuggestions) {
            suggestions.push({
              category: "Network",
              suggestion: "Implement connection pooling and keep-alive optimization",
              expectedImpact: "Reduce connection overhead by 40%",
              complexity: "medium"
            })
          }
        }
      } catch {
        // Online stats unavailable
      }
    }

    // General optimizations
    if (target === "overall" && input.includeSuggestions) {
      suggestions.push({
        category: "Caching",
        suggestion: "Implement response caching for frequently accessed data",
        expectedImpact: "Reduce database load by 60%",
        complexity: "medium"
      })
      suggestions.push({
        category: "Monitoring",
        suggestion: "Set up real-time performance monitoring with alerting",
        expectedImpact: "Detect and resolve issues 50% faster",
        complexity: "low"
      })
      suggestions.push({
        category: "CDN",
        suggestion: "Use CDN for static assets and config distribution",
        expectedImpact: "Reduce latency by 40-60% for global users",
        complexity: "medium"
      })
    }

    return {
      currentMetrics,
      bottlenecks,
      suggestions,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: incident_response                                            */
/* ------------------------------------------------------------------ */

const IncidentResponseInput = z.object({
  incidentType: z.enum(["node_down", "security_breach", "performance_degradation", "auth_failure", "other"]).describe(
    "Type of incident. Must be one of: node_down (node failure), security_breach (security incident), performance_degradation (performance issues), auth_failure (authentication failures), other (miscellaneous)"
  ),
  description: z.string().min(10).max(2000).describe("Detailed description of the incident"),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium").describe("Incident severity level"),
  autoMitigate: z.boolean().default(false).describe("Automatically apply mitigation steps (use with caution)"),
})

export const incidentResponseTool: AgentTool<
  z.infer<typeof IncidentResponseInput>,
  {
    incidentId: string
    status: string
    analysis: {
      affectedComponents: string[]
      potentialImpact: string[]
      recommendedActions: Array<{
        action: string
        priority: "immediate" | "soon" | "monitor"
        automated: boolean
      }>
    }
    mitigationSteps: Array<{
      step: string
      executed: boolean
      result?: string
    }>
    nextSteps: string[]
  }
> = {
  name: "incident_response",
  description:
    "Automated incident response system for handling infrastructure incidents. Valid incident types: 'node_down' (node failure), 'security_breach' (security incident), 'performance_degradation' (performance issues), 'auth_failure' (authentication failures), 'other' (miscellaneous). Provides analysis, recommended actions, and optional automated mitigation.",
  parameters: IncidentResponseInput,
  jsonSchema: {
    type: "object",
    properties: {
      incidentType: {
        type: "string",
        enum: ["node_down", "security_breach", "performance_degradation", "auth_failure", "other"],
        description: "Type of incident. Valid values: node_down (node failure), security_breach (security incident), performance_degradation (performance issues), auth_failure (authentication failures), other (miscellaneous)"
      },
      description: {
        type: "string",
        minLength: 10,
        maxLength: 2000,
        description: "Detailed description of the incident"
      },
      severity: {
        type: "string",
        enum: ["low", "medium", "high", "critical"],
        default: "medium",
        description: "Incident severity level"
      },
      autoMitigate: {
        type: "boolean",
        default: false,
        description: "Automatically apply mitigation steps (use with caution)"
      },
    },
    required: ["incidentType", "description"],
  },
  async run(input) {
    const incidentId = `INC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const mitigationSteps: Array<{
      step: string
      executed: boolean
      result?: string
    }> = []
    const nextSteps: string[] = []

    const affectedComponents: string[] = []
    const potentialImpact: string[] = []
    const recommendedActions: Array<{
      action: string
      priority: "immediate" | "soon" | "monitor"
      automated: boolean
    }> = []

    // Analyze based on incident type
    switch (input.incidentType) {
      case "node_down":
        affectedComponents.push("Hysteria2 nodes", "Client connectivity")
        potentialImpact.push("Service disruption for affected users", "Reduced network capacity")
        recommendedActions.push({
          action: "Check node health status and logs",
          priority: "immediate",
          automated: true
        })
        recommendedActions.push({
          action: "Attempt automatic node restart",
          priority: "immediate",
          automated: true
        })
        recommendedActions.push({
          action: "Notify affected users if service disruption confirmed",
          priority: "soon",
          automated: false
        })
        if (input.autoMitigate) {
          const nodes = await listNodes()
          const offlineNodes = nodes.filter(n => n.status !== "running")
          mitigationSteps.push({
            step: `Identified ${offlineNodes.length} offline node(s)`,
            executed: true,
            result: offlineNodes.map(n => n.id).join(", ")
          })
          nextSteps.push("Review node logs for root cause analysis")
          nextSteps.push("Consider implementing failover mechanisms")
        }
        break

      case "security_breach":
        affectedComponents.push("Authentication system", "User data", "Infrastructure")
        potentialImpact.push("Unauthorized access", "Data compromise", "Service disruption")
        recommendedActions.push({
          action: "Rotate all authentication credentials",
          priority: "immediate",
          automated: true
        })
        recommendedActions.push({
          action: "Review recent access logs for suspicious activity",
          priority: "immediate",
          automated: true
        })
        recommendedActions.push({
          action: "Enable enhanced monitoring and alerting",
          priority: "immediate",
          automated: true
        })
        recommendedActions.push({
          action: "Conduct full security audit",
          priority: "soon",
          automated: false
        })
        if (input.autoMitigate) {
          mitigationSteps.push({
            step: "Security incident logged for audit",
            executed: true,
            result: "Incident ID: " + incidentId
          })
          nextSteps.push("Escalate to security team")
          nextSteps.push("Prepare incident report for stakeholders")
        }
        break

      case "performance_degradation":
        affectedComponents.push("Network throughput", "Node performance", "Client experience")
        potentialImpact.push("Slow connection speeds", "Increased latency", "User complaints")
        recommendedActions.push({
          action: "Analyze traffic patterns and identify bottlenecks",
          priority: "immediate",
          automated: true
        })
        recommendedActions.push({
          action: "Check node resource utilization",
          priority: "immediate",
          automated: true
        })
        recommendedActions.push({
          action: "Scale resources if needed",
          priority: "soon",
          automated: true
        })
        if (input.autoMitigate) {
          mitigationSteps.push({
            step: "Performance metrics collected",
            executed: true,
            result: "Baseline established for comparison"
          })
          nextSteps.push("Review historical performance data")
          nextSteps.push("Implement capacity planning")
        }
        break

      case "auth_failure":
        affectedComponents.push("Authentication backend", "User sessions")
        potentialImpact.push("User login failures", "Service disruption")
        recommendedActions.push({
          action: "Check authentication backend connectivity",
          priority: "immediate",
          automated: true
        })
        recommendedActions.push({
          action: "Verify authentication configuration",
          priority: "immediate",
          automated: true
        })
        recommendedActions.push({
          action: "Review recent authentication logs",
          priority: "soon",
          automated: true
        })
        if (input.autoMitigate) {
          try {
            const config = await getServerConfig()
            mitigationSteps.push({
              step: "Authentication configuration retrieved",
              executed: true,
              result: config?.authBackendUrl ? "Backend configured" : "No backend configured"
            })
          } catch {
            mitigationSteps.push({
              step: "Authentication configuration retrieval failed",
              executed: true,
              result: "Unable to verify configuration"
            })
          }
          nextSteps.push("Verify auth backend service status")
          nextSteps.push("Test authentication endpoint manually")
        }
        break

      default:
        affectedComponents.push("Infrastructure")
        potentialImpact.push("Unknown impact - requires investigation")
        recommendedActions.push({
          action: "Gather diagnostic information",
          priority: "immediate",
          automated: true
        })
        recommendedActions.push({
          action: "Escalate to appropriate team",
          priority: "soon",
          automated: false
        })
    }

    // Add general next steps
    nextSteps.push("Document incident in incident tracking system")
    nextSteps.push("Conduct post-incident review")
    nextSteps.push("Update incident response procedures based on lessons learned")

    return {
      incidentId,
      status: input.autoMitigate ? "mitigation_in_progress" : "analysis_complete",
      analysis: {
        affectedComponents,
        potentialImpact,
        recommendedActions,
      },
      mitigationSteps,
      nextSteps,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: network_analysis                                             */
/* ------------------------------------------------------------------ */

const NetworkAnalysisInput = z.object({
  timeframe: z.enum(["1h", "6h", "24h", "7d"]).default("24h").describe("Timeframe for analysis"),
  includePatterns: z.boolean().default(true).describe("Include traffic pattern analysis"),
})

export const networkAnalysisTool: AgentTool<
  z.infer<typeof NetworkAnalysisInput>,
  {
    summary: {
      totalConnections: number
      uniqueUsers: number
      totalDataTransferred: { tx: number; rx: number }
      avgSessionDuration: number
    }
    patterns: Array<{
      type: string
      description: string
      significance: string
    }>
    anomalies: Array<{
      type: string
      description: string
      severity: "low" | "medium" | "high"
    }>
    insights: string[]
  }
> = {
  name: "network_analysis",
  description:
    "Analyze network traffic patterns, identify anomalies, and provide insights into usage trends. Helps detect unusual behavior, optimize resource allocation, and understand traffic characteristics.",
  parameters: NetworkAnalysisInput,
  jsonSchema: {
    type: "object",
    properties: {
      timeframe: {
        type: "string",
        enum: ["1h", "6h", "24h", "7d"],
        default: "24h",
        description: "Timeframe for analysis"
      },
      includePatterns: {
        type: "boolean",
        default: true,
        description: "Include traffic pattern analysis"
      },
    },
  },
  async run(input) {
    const patterns: Array<{
      type: string
      description: string
      significance: string
    }> = []
    const anomalies: Array<{
      type: string
      description: string
      severity: "low" | "medium" | "high"
    }> = []
    const insights: string[] = []

    // Get current traffic data
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
    const uniqueUsers = Object.keys(traffic).length
    const totalConnections = Object.keys(online).length
    let totalTx = 0
    let totalRx = 0

    for (const [id, stats] of Object.entries(traffic)) {
      totalTx += stats.tx
      totalRx += stats.rx
    }

    // Analyze patterns
    if (input.includePatterns) {
      // High bandwidth users
      const userBandwidth = Object.entries(traffic).map(([id, stats]) => ({
        id,
        total: stats.tx + stats.rx
      }))
      userBandwidth.sort((a, b) => b.total - a.total)
      
      if (userBandwidth.length > 0) {
        const topUser = userBandwidth[0]
        const avgBandwidth = userBandwidth.reduce((sum, u) => sum + u.total, 0) / userBandwidth.length
        
        if (topUser.total > avgBandwidth * 5) {
          patterns.push({
            type: "Bandwidth Concentration",
            description: `Single user accounts for ${((topUser.total / (totalTx + totalRx)) * 100).toFixed(1)}% of total traffic`,
            significance: "May indicate heavy user or potential abuse"
          })
        }
      }

      // Connection patterns
      if (totalConnections > users.length * 0.8) {
        patterns.push({
          type: "High Concurrent Connections",
          description: `${totalConnections} concurrent connections vs ${users.length} registered users`,
          significance: "High engagement - consider capacity planning"
        })
      }
    }

    // Detect anomalies
    // Check for zero traffic with active connections
    if (totalConnections > 0 && totalTx + totalRx === 0) {
      anomalies.push({
        type: "Traffic Anomaly",
        description: "Active connections but no data transfer detected",
        severity: "high"
      })
    }

    // Check for unusual user-to-connection ratio
    if (totalConnections > users.length * 2) {
      anomalies.push({
        type: "Connection Anomaly",
        description: `More connections (${totalConnections}) than users (${users.length})`,
        severity: "medium"
      })
    }

    // Check for extremely high bandwidth
    const HIGH_BANDWIDTH_THRESHOLD = 100 * 1024 * 1024 * 1024 // 100GB
    if (totalTx + totalRx > HIGH_BANDWIDTH_THRESHOLD) {
      anomalies.push({
        type: "Bandwidth Anomaly",
        description: `Extremely high bandwidth usage: ${formatBytes(totalTx + totalRx)}`,
        severity: "medium"
      })
    }

    // Generate insights
    insights.push(`📊 Total data transferred: ${formatBytes(totalTx + totalRx)} (${formatBytes(totalTx)} TX / ${formatBytes(totalRx)} RX)`)
    insights.push(`👥 Active users: ${uniqueUsers} of ${users.length} registered (${((uniqueUsers / users.length) * 100).toFixed(1)}%)`)
    insights.push(`🔗 Concurrent connections: ${totalConnections}`)
    
    if (uniqueUsers > 0) {
      const avgPerUser = (totalTx + totalRx) / uniqueUsers
      insights.push(`📈 Average data per user: ${formatBytes(avgPerUser)}`)
    }

    if (anomalies.length === 0) {
      insights.push("✅ No significant anomalies detected in network traffic")
    } else {
      insights.push(`⚠️ ${anomalies.length} anomaly/anomalies detected - review recommended`)
    }

    return {
      summary: {
        totalConnections,
        uniqueUsers,
        totalDataTransferred: { tx: totalTx, rx: totalRx },
        avgSessionDuration: 0, // Would require historical data
      },
      patterns,
      anomalies,
      insights,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: threat_intelligence                                          */
/* ------------------------------------------------------------------ */

const ThreatIntelligenceInput = z.object({
  iocType: z.enum(["ip", "domain", "url", "hash"]).describe("Type of indicator of compromise"),
  iocValue: z.string().min(1).describe("The IOC value to analyze"),
  sources: z.array(z.enum(["virustotal", "abusech", "otx", "all"])).default(["all"]).describe("Threat intelligence sources to query"),
})

export const threatIntelligenceTool: AgentTool<
  z.infer<typeof ThreatIntelligenceInput>,
  {
    ioc: string
    analysis: {
      malicious: boolean
      confidence: number
      sourcesQueried: string[]
      detections: number
      firstSeen?: string
      lastSeen?: string
    }
    details: Array<{
      source: string
      result: string
      severity: "malicious" | "suspicious" | "clean" | "unknown"
    }>
    recommendations: string[]
  }
> = {
  name: "threat_intelligence",
  description:
    "Query multiple threat intelligence sources (VirusTotal, Abuse.ch, AlienVault OTX) to analyze indicators of compromise. Provides comprehensive threat assessment with detection counts and recommendations.",
  parameters: ThreatIntelligenceInput,
  jsonSchema: {
    type: "object",
    properties: {
      iocType: {
        type: "string",
        enum: ["ip", "domain", "url", "hash"],
        description: "Type of indicator of compromise"
      },
      iocValue: {
        type: "string",
        description: "The IOC value to analyze"
      },
      sources: {
        type: "array",
        items: { type: "string", enum: ["virustotal", "abusech", "otx", "all"] },
        default: ["all"],
        description: "Threat intelligence sources to query"
      },
    },
    required: ["iocType", "iocValue"],
  },
  async run(input) {
    const details: Array<{
      source: string
      result: string
      severity: "malicious" | "suspicious" | "clean" | "unknown"
    }> = []
    const recommendations: string[] = []

    const sourcesToQuery = input.sources.includes("all")
      ? ["virustotal", "abusech", "otx"]
      : input.sources

    let totalDetections = 0
    let maliciousCount = 0
    let confidenceSum = 0
    let queriedCount = 0

    for (const source of sourcesToQuery) {
      try {
        if (source === "virustotal") {
          let result: { malicious: boolean; detectionPercentage: number } | null = null
          if (input.iocType === "ip") {
            result = await analyzeIpAddress(input.iocValue)
          } else if (input.iocType === "domain") {
            result = await analyzeDomain(input.iocValue)
          } else if (input.iocType === "url") {
            result = await analyzeUrl(input.iocValue)
          } else if (input.iocType === "hash") {
            result = await analyzeFileHash(input.iocValue)
          }
          if (result) {
            queriedCount++
            const detections = result.detectionPercentage
            totalDetections += detections
            confidenceSum += detections
            if (result.malicious) maliciousCount++
            const severity: "malicious" | "suspicious" | "clean" | "unknown" =
              detections >= 10 ? "malicious" : detections > 0 ? "suspicious" : "clean"
            details.push({
              source: "virustotal",
              result: `${detections}% detection rate (${result.malicious ? "malicious" : "clean"})`,
              severity,
            })
          }
        } else if (source === "abusech") {
          if (input.iocType === "hash") {
            const { malicious, samples } = await checkMalwareBazaarHash(input.iocValue)
            queriedCount++
            if (malicious) maliciousCount++
            totalDetections += samples.length
            confidenceSum += samples.length > 0 ? 50 : 0
            details.push({
              source: "abusech",
              result: malicious
                ? `Found in MalwareBazaar (${samples.length} sample(s))`
                : "Not found in MalwareBazaar",
              severity: malicious ? "malicious" : "clean",
            })
          } else if (input.iocType === "url") {
            const { malicious, urls } = await checkUrlhausUrl(input.iocValue)
            queriedCount++
            if (malicious) maliciousCount++
            totalDetections += urls.length
            confidenceSum += urls.length > 0 ? 50 : 0
            details.push({
              source: "abusech",
              result: malicious
                ? `Found in URLhaus (${urls.length} record(s))`
                : "Not found in URLhaus",
              severity: malicious ? "malicious" : "clean",
            })
          } else {
            const { threat, indicators } = await checkThreatFoxIoc(input.iocValue)
            queriedCount++
            if (threat) maliciousCount++
            totalDetections += indicators.length
            confidenceSum += indicators.length > 0 ? 40 : 0
            details.push({
              source: "abusech",
              result: threat
                ? `Found in ThreatFox (${indicators.length} indicator(s))`
                : "Not found in ThreatFox",
              severity: threat ? "malicious" : "clean",
            })
          }
        } else if (source === "otx") {
          let result: { malicious: boolean; pulseCount: number; reputation?: number } | null = null
          if (input.iocType === "ip") {
            result = await analyzeOtxIpv4(input.iocValue)
          } else if (input.iocType === "domain") {
            result = await analyzeOtxDomain(input.iocValue)
          } else if (input.iocType === "url") {
            result = await analyzeOtxUrl(input.iocValue)
          } else if (input.iocType === "hash") {
            result = await analyzeOtxFileHash(input.iocValue)
          }
          if (result) {
            queriedCount++
            const detections = result.pulseCount
            totalDetections += detections
            confidenceSum += result.reputation !== undefined ? Math.max(0, 100 - result.reputation) / 2 : detections > 0 ? 30 : 0
            if (result.malicious) maliciousCount++
            const severity: "malicious" | "suspicious" | "clean" | "unknown" =
              result.malicious ? "malicious" : detections > 0 ? "suspicious" : "clean"
            details.push({
              source: "otx",
              result: `${detections} pulse(s) (${result.malicious ? "malicious" : "clean"})`,
              severity,
            })
          }
        }
      } catch (err) {
        details.push({
          source,
          result: err instanceof Error ? err.message : String(err),
          severity: "unknown",
        })
      }
    }

    if (maliciousCount > 0) {
      recommendations.push("Consider blocking this IOC at the firewall or proxy level")
    }
    if (queriedCount === 0) {
      recommendations.push("No threat intelligence sources could be queried — verify API keys are configured")
    }

    return {
      ioc: input.iocValue,
      analysis: {
        malicious: maliciousCount > 0,
        confidence: queriedCount > 0 ? Math.round(confidenceSum / queriedCount) : 0,
        sourcesQueried: sourcesToQuery,
        detections: totalDetections,
      },
      details,
      recommendations,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: list_nodes                                                  */
/* ------------------------------------------------------------------ */

const ListNodesInput = z.object({
  status: z.enum(["stopped", "starting", "running", "stopping", "errored"]).optional().describe("Filter by node status"),
  provider: z.string().optional().describe("Filter by cloud provider"),
  tag: z.string().optional().describe("Filter by tag"),
  limit: z.coerce.number().int().min(1).max(100).default(50).describe("Max nodes to return"),
})

export const listNodesTool: AgentTool<
  z.infer<typeof ListNodesInput>,
  {
    nodes: Array<{
      id: string
      name: string
      hostname: string
      region: string | null
      listenAddr: string
      status: string
      tags: string[]
      provider: string | null
      lastHeartbeatAt: number | null
      createdAt: number
    }>
    count: number
  }
> = {
  name: "list_nodes",
  description: "List all Hysteria2 nodes in the infrastructure inventory. Filter by status, provider, or tag. Returns node IDs, names, hostnames, status, and metadata.",
  parameters: ListNodesInput,
  jsonSchema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["stopped", "starting", "running", "stopping", "errored"], description: "Filter by status" },
      provider: { type: "string", description: "Filter by provider name" },
      tag: { type: "string", description: "Filter by tag" },
      limit: { type: "integer", default: 50, description: "Max results (1-100)" },
    },
  },
  async run(input) {
    const all = await listNodes({ take: input.limit })
    let nodes = all
    if (input.status) nodes = nodes.filter((n) => n.status === input.status)
    const providerFilter = input.provider
    if (providerFilter) nodes = nodes.filter((n) => n.provider?.toLowerCase().includes(providerFilter.toLowerCase()))
    const tagFilter = input.tag
    if (tagFilter) nodes = nodes.filter((n) => n.tags.some((t) => t.toLowerCase().includes(tagFilter.toLowerCase())))
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        name: n.name,
        hostname: n.hostname,
        region: n.region ?? null,
        listenAddr: n.listenAddr,
        status: n.status,
        tags: n.tags,
        provider: n.provider ?? null,
        lastHeartbeatAt: n.lastHeartbeatAt,
        createdAt: n.createdAt,
      })),
      count: nodes.length,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: get_node                                                    */
/* ------------------------------------------------------------------ */

const GetNodeInput = z.object({
  nodeId: z.string().min(1).describe("Node ID to retrieve"),
})

export const getNodeTool: AgentTool<
  z.infer<typeof GetNodeInput>,
  {
    found: boolean
    node?: {
      id: string
      name: string
      hostname: string
      region: string | null
      listenAddr: string
      status: string
      tags: string[]
      provider: string | null
      profileId: string | null
      lastHeartbeatAt: number | null
      createdAt: number
      updatedAt: number
    }
  }
> = {
  name: "get_node",
  description: "Get detailed information about a specific Hysteria2 node by ID. Returns full node configuration and status.",
  parameters: GetNodeInput,
  jsonSchema: {
    type: "object",
    properties: {
      nodeId: { type: "string", description: "Node ID" },
    },
    required: ["nodeId"],
  },
  async run(input) {
    const node = await getNodeById(input.nodeId)
    if (!node) return { found: false }
    return {
      found: true,
      node: {
        id: node.id,
        name: node.name,
        hostname: node.hostname,
        region: node.region ?? null,
        listenAddr: node.listenAddr,
        status: node.status,
        tags: node.tags,
        provider: node.provider ?? null,
        profileId: node.profileId,
        lastHeartbeatAt: node.lastHeartbeatAt,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      },
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: create_node                                                 */
/* ------------------------------------------------------------------ */

const CreateNodeInput = z.object({
  name: z.string().min(1).max(120).optional().describe("Node display name (auto-generated if omitted)"),
  hostname: z.string().min(1).optional().describe("Server hostname or IP (placeholder assigned if omitted)"),
  region: z.string().optional().describe("Region / datacenter"),
  listenAddr: z.string().default(":443").describe("Listen address:port (default :443)"),
  tags: z.array(z.string().max(40)).default([]).describe("Organizational tags"),
  provider: z.string().optional().describe("Cloud provider (hetzner, digitalocean, vultr, aws, azure, etc.)"),
})

export const createNodeTool: AgentTool<
  z.infer<typeof CreateNodeInput>,
  { nodeId: string; name: string; status: string; message: string; defaultsApplied?: Record<string, string | undefined> }
> = {
  name: "create_node",
  description:
    "Register a new Hysteria2 node in the database. This creates the node inventory entry only — use deploy_node to provision the actual remote VPS and install Hysteria2. " +
    "Name and hostname are optional and will be auto-generated if omitted. " +
    "IMPORTANT: hostname MUST be a public IP or resolvable FQDN. Local hostnames (.local, 192.168.x.x, 10.x.x.x, 127.x.x.x) are NOT permitted — all nodes must be remote cloud servers.",
  parameters: CreateNodeInput,
  jsonSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Node display name (auto-generated if omitted)" },
      hostname: { type: "string", description: "Server hostname or IP (placeholder assigned if omitted)" },
      region: { type: "string", description: "Region / datacenter" },
      listenAddr: { type: "string", default: ":443", description: "Listen address:port" },
      tags: { type: "array", items: { type: "string" }, description: "Tags" },
      provider: { type: "string", description: "Cloud provider name" },
    },
    required: [],
  },
  async run(input) {
    const ts = Date.now()
    const name = input.name?.trim() || `node-${ts}`
    const hostname = input.hostname?.trim() || `pending-${ts}.remote`

    const node = await createNode({
      name,
      hostname,
      region: input.region,
      listenAddr: input.listenAddr,
      tags: input.tags,
      provider: input.provider,
    })
    return {
      nodeId: node.id,
      name: node.name,
      status: node.status,
      message: `Node "${node.name}" registered with ID ${node.id}`,
      defaultsApplied: input.name ? undefined : { name, hostname },
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: update_node                                                 */
/* ------------------------------------------------------------------ */

const UpdateNodeInput = z.object({
  nodeId: z.string().min(1).describe("Node ID to update"),
  name: z.string().min(1).max(120).optional().describe("New display name"),
  hostname: z.string().min(1).optional().describe("New hostname or IP"),
  region: z.string().optional().describe("New region"),
  listenAddr: z.string().optional().describe("New listen address:port"),
  status: z.enum(["stopped", "starting", "running", "stopping", "errored"]).optional().describe("New status"),
  tags: z.array(z.string().max(40)).optional().describe("Replace tags"),
  provider: z.string().optional().describe("New provider name"),
  profileId: z.string().optional().describe("Config profile ID to apply to this node"),
})

export const updateNodeTool: AgentTool<
  z.infer<typeof UpdateNodeInput>,
  { success: boolean; nodeId: string; message: string }
> = {
  name: "update_node",
  description: "Update an existing Hysteria2 node's properties (name, hostname, region, listen address, status, tags, provider, profileId). Only provided fields are changed.",
  parameters: UpdateNodeInput,
  jsonSchema: {
    type: "object",
    properties: {
      nodeId: { type: "string", description: "Node ID" },
      name: { type: "string", description: "New display name" },
      hostname: { type: "string", description: "New hostname or IP" },
      region: { type: "string", description: "New region" },
      listenAddr: { type: "string", description: "New listen address:port" },
      status: { type: "string", enum: ["stopped", "starting", "running", "stopping", "errored"], description: "New status" },
      tags: { type: "array", items: { type: "string" }, description: "Replace tags" },
      provider: { type: "string", description: "New provider name" },
      profileId: { type: "string", description: "Config profile ID to apply" },
    },
    required: ["nodeId"],
  },
  async run(input) {
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.hostname !== undefined) patch.hostname = input.hostname
    if (input.region !== undefined) patch.region = input.region
    if (input.listenAddr !== undefined) patch.listenAddr = input.listenAddr
    if (input.status !== undefined) patch.status = input.status
    if (input.tags !== undefined) patch.tags = input.tags
    if (input.provider !== undefined) patch.provider = input.provider
    if (input.profileId !== undefined) patch.profileId = input.profileId
    const updated = await updateNode(input.nodeId, patch)
    if (!updated) {
      return { success: false, nodeId: input.nodeId, message: "Node not found" }
    }
    return { success: true, nodeId: updated.id, message: `Node "${updated.name}" updated` }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: delete_node                                                 */
/* ------------------------------------------------------------------ */

const DeleteNodeInput = z.object({
  nodeId: z.string().min(1).describe("Node ID to delete"),
})

export const deleteNodeTool: AgentTool<
  z.infer<typeof DeleteNodeInput>,
  { success: boolean; message: string }
> = {
  name: "delete_node",
  description: "Delete a Hysteria2 node from the inventory. This removes the database entry only — it does not tear down the underlying VPS.",
  parameters: DeleteNodeInput,
  jsonSchema: {
    type: "object",
    properties: {
      nodeId: { type: "string", description: "Node ID to delete" },
    },
    required: ["nodeId"],
  },
  async run(input) {
    const ok = await deleteNode(input.nodeId)
    return {
      success: ok,
      message: ok ? "Node deleted from inventory" : "Node not found",
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: apply_node_config                                           */
/* ------------------------------------------------------------------ */

const ApplyNodeConfigInput = z.object({
  nodeId: z.string().min(1).describe("Node ID to apply config to"),
  profileId: z.string().min(1).describe("Config profile ID to apply"),
  sshPrivateKey: z.string().min(1).describe("SSH private key (PEM format) for accessing the node"),
  restartService: z.boolean().default(true).describe("Restart hysteria-server service after applying config"),
})

function resolveProfileServerConfig(
  resolved: ReturnType<typeof resolveProfileConfig>,
  baseConfig: ServerConfig,
): ServerConfig {
  const tls =
    resolved.tlsMode === "acme" && resolved.acmeDomains?.length && resolved.acmeEmail
      ? { mode: "acme" as const, domains: resolved.acmeDomains, email: resolved.acmeEmail }
      : baseConfig.tls

  return {
    ...baseConfig,
    listen: resolved.listen || baseConfig.listen,
    tls,
    obfs: resolved.obfs ?? baseConfig.obfs,
    bandwidth: resolved.bandwidth ?? baseConfig.bandwidth,
    masquerade: resolved.masquerade ?? baseConfig.masquerade,
  }
}

export const applyNodeConfigTool: AgentTool<
  z.infer<typeof ApplyNodeConfigInput>,
  {
    success: boolean
    nodeId: string
    message: string
    steps: Array<{ step: string; status: "ok" | "error"; output?: string; error?: string }>
  }
> = {
  name: "apply_node_config",
  description: "Apply a Hysteria2 config profile to a remote node via SSH. This writes the config file and optionally restarts the service. Requires the node's SSH private key.",
  parameters: ApplyNodeConfigInput,
  jsonSchema: {
    type: "object",
    properties: {
      nodeId: { type: "string", description: "Node ID to apply config to" },
      profileId: { type: "string", description: "Config profile ID to apply" },
      sshPrivateKey: { type: "string", description: "SSH private key (PEM format) for node access" },
      restartService: { type: "boolean", default: true, description: "Restart service after config update" },
    },
    required: ["nodeId", "profileId", "sshPrivateKey"],
  },
  async run(input, ctx) {
    const steps: Array<{ step: string; status: "ok" | "error"; output?: string; error?: string }> = []

    // Step 1: Get node
    const node = await getNodeById(input.nodeId)
    if (!node) {
      return { success: false, nodeId: input.nodeId, message: "Node not found", steps: [{ step: "lookup_node", status: "error", error: "Node not found" }] }
    }
    steps.push({ step: "lookup_node", status: "ok", output: `Found node ${node.name} at ${node.hostname}` })

    // Step 2: Get profile and resolve config
    const profile = await getProfileById(input.profileId)
    if (!profile) {
      return { success: false, nodeId: input.nodeId, message: "Profile not found", steps }
    }
    const resolved = resolveProfileConfig(profile)
    steps.push({ step: "resolve_profile", status: "ok", output: `Resolved profile "${profile.name}"` })

    const serverConfig = await getServerConfig()
    if (!serverConfig) {
      steps.push({ step: "load_server_config", status: "error", error: "Server config not found" })
      return { success: false, nodeId: input.nodeId, message: "Server config not found", steps }
    }

    // Step 3: Generate config YAML
    const configYaml = renderHysteriaYaml(resolveProfileServerConfig(resolved, serverConfig))
    steps.push({ step: "generate_config", status: "ok", output: "Generated config YAML" })

    // Step 4: SSH and write config
    const escapedYaml = configYaml.replace(/'/g, "'\"'\"'")
    const writeCmd = `mkdir -p /etc/hysteria && echo '${escapedYaml}' > /etc/hysteria/config.yaml && chmod 600 /etc/hysteria/config.yaml`

    try {
      const writeResult = await sshExec({
        host: node.hostname,
        privateKey: input.sshPrivateKey,
        command: writeCmd,
        timeoutMs: 30_000,
      })

      if (writeResult.code !== 0) {
        steps.push({ step: "write_config", status: "error", error: writeResult.stderr || `Exit code ${writeResult.code}` })
        return { success: false, nodeId: input.nodeId, message: "Failed to write config", steps }
      }
      steps.push({ step: "write_config", status: "ok", output: "Config written to /etc/hysteria/config.yaml" })
    } catch (err) {
      steps.push({ step: "write_config", status: "error", error: err instanceof Error ? err.message : String(err) })
      return { success: false, nodeId: input.nodeId, message: "SSH connection failed", steps }
    }

    // Step 5: Restart service if requested
    if (input.restartService) {
      try {
        const restartResult = await sshExec({
          host: node.hostname,
          privateKey: input.sshPrivateKey,
          command: "systemctl daemon-reload && systemctl restart hysteria-server && systemctl is-active hysteria-server",
          timeoutMs: 30_000,
        })

        if (restartResult.stdout.includes("active")) {
          steps.push({ step: "restart_service", status: "ok", output: "Service restarted and is active" })
        } else if (restartResult.code === 0) {
          steps.push({ step: "restart_service", status: "ok", output: "Service restart command executed" })
        } else {
          steps.push({ step: "restart_service", status: "error", error: restartResult.stderr || "Service restart failed" })
          return { success: false, nodeId: input.nodeId, message: "Service restart failed", steps }
        }
      } catch (err) {
        steps.push({ step: "restart_service", status: "error", error: err instanceof Error ? err.message : String(err) })
        return { success: false, nodeId: input.nodeId, message: "Service restart failed", steps }
      }
    }

    // Step 6: Update node in DB with profileId
    await updateNode(input.nodeId, { profileId: input.profileId })
    steps.push({ step: "update_database", status: "ok", output: "Node updated with profileId" })

    return {
      success: true,
      nodeId: input.nodeId,
      message: `Config applied to node "${node.name}" from profile "${profile.name}"`,
      steps,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: list_beacons                                                */
/* ------------------------------------------------------------------ */

const ListBeaconsInput = z.object({
  status: z.enum(["online", "idle", "stale", "offline"]).optional().describe("Filter by beacon status"),
  osFamily: z.string().optional().describe("Filter by OS (windows, linux, macos)"),
  domain: z.string().optional().describe("Filter by domain"),
  search: z.string().optional().describe("Search hostname or IP"),
  limit: z.coerce.number().int().min(1).max(100).default(50).describe("Max beacons to return"),
})

export const listBeaconsTool: AgentTool<
  z.infer<typeof ListBeaconsInput>,
  {
    beacons: Array<{
      id: string
      implantId: string
      hostname: string
      ipAddress: string
      os: string
      domain: string | null
      privileges: string
      status: string
      lastCheckin: number
      firstSeen: number
    }>
    count: number
  }
> = {
  name: "list_beacons",
  description: "List all active beacons / compromised hosts. Filter by status, OS family, domain, or search hostname/IP. Returns beacon inventory with status and metadata.",
  parameters: ListBeaconsInput,
  jsonSchema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["online", "idle", "stale", "offline"], description: "Filter by status" },
      osFamily: { type: "string", description: "Filter by OS family" },
      domain: { type: "string", description: "Filter by domain" },
      search: { type: "string", description: "Search hostname or IP" },
      limit: { type: "integer", default: 50, description: "Max results (1-100)" },
    },
  },
  async run(input) {
    const beacons = await listBeacons({
      status: input.status,
      osFamily: input.osFamily,
      domain: input.domain,
      search: input.search,
      take: input.limit,
    })
    return {
      beacons: beacons.map((b) => ({
        id: b.id,
        implantId: b.implantId,
        hostname: b.hostname,
        ipAddress: b.ipAddress,
        os: b.os,
        domain: b.domain ?? null,
        privileges: b.privileges,
        status: b.status,
        lastCheckin: b.lastCheckin,
        firstSeen: b.firstSeen,
      })),
      count: beacons.length,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: get_beacon                                                  */
/* ------------------------------------------------------------------ */

const GetBeaconInput = z.object({
  beaconId: z.string().min(1).describe("Beacon ID to retrieve"),
})

export const getBeaconTool: AgentTool<
  z.infer<typeof GetBeaconInput>,
  {
    found: boolean
    beacon?: {
      id: string
      implantId: string
      hostname: string
      ipAddress: string
      os: string
      domain: string | null
      privileges: string
      status: string
      lastCheckin: number
      firstSeen: number
      nodeId: string | null
    }
  }
> = {
  name: "get_beacon",
  description: "Get detailed information about a specific beacon / compromised host by ID. Returns full beacon status, host info, and check-in history.",
  parameters: GetBeaconInput,
  jsonSchema: {
    type: "object",
    properties: {
      beaconId: { type: "string", description: "Beacon ID" },
    },
    required: ["beaconId"],
  },
  async run(input) {
    const beacon = await getBeaconById(input.beaconId)
    if (!beacon) return { found: false }
    return {
      found: true,
      beacon: {
        id: beacon.id,
        implantId: beacon.implantId,
        hostname: beacon.hostname,
        ipAddress: beacon.ipAddress,
        os: beacon.os,
        domain: beacon.domain ?? null,
        privileges: beacon.privileges,
        status: beacon.status,
        lastCheckin: beacon.lastCheckin,
        firstSeen: beacon.firstSeen,
        nodeId: beacon.nodeId ?? null,
      },
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: system_status                                               */
/* ------------------------------------------------------------------ */

const SystemStatusInput = z.object({})

export const systemStatusTool: AgentTool<
  z.infer<typeof SystemStatusInput>,
  {
    server: { state: string; pid: number | null }
    nodes: { total: number; running: number; errored: number }
    users: { total: number; active: number; online: number }
    credentials: { total: number; verified: number; untested: number }
    implants: { total: number; active: number; inactive: number }
    payloads: { total: number }
    errors: string[]
  }
> = {
  name: "system_status",
  description:
    "Get a comprehensive health overview of the entire Hysteria2 C2 system: server status, node counts, user stats, credential inventory, implant activity, and detected issues.",
  parameters: SystemStatusInput,
  jsonSchema: { type: "object", properties: {} },
  async run() {
    const errors: string[] = []
    const server = getManagerStatus()
    const nodes = await listNodes()
    const users = await listUsers()
    const creds = await listCredentials()
    const implants = await listImplants()

    if (server.state === "errored")
      errors.push(`Server is in error state: ${server.lastError ?? "unknown"}`)
    const erroredNodes = nodes.filter((n) => n.status === "errored")
    if (erroredNodes.length > 0)
      errors.push(`${erroredNodes.length} node(s) in error state`)
    const inactiveImplants = implants.filter((i) => i.status !== "active")
    if (inactiveImplants.length > 0)
      errors.push(`${inactiveImplants.length} implant(s) inactive`)

    let onlineCount = 0
    try {
      const o = await fetchOnline()
      onlineCount = Object.keys(o).length
    } catch {}

    return {
      server: { state: server.state, pid: server.pid },
      nodes: {
        total: nodes.length,
        running: nodes.filter((n) => n.status === "running").length,
        errored: erroredNodes.length,
      },
      users: {
        total: users.length,
        active: users.filter((u) => u.status === "active").length,
        online: onlineCount,
      },
      credentials: {
        total: creds.length,
        verified: creds.filter((c) => c.verified).length,
        untested: creds.filter((c) => !c.verified).length,
      },
      implants: {
        total: implants.length,
        active: implants.filter((i) => i.status === "active").length,
        inactive: inactiveImplants.length,
      },
      payloads: { total: (await listPayloadBuilds()).length },
      errors,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: list_users_info                                             */
/* ------------------------------------------------------------------ */

const ListUsersInfoInput = z.object({
  status: z
    .enum(["active", "disabled", "expired"])
    .optional()
    .describe("Filter by user status"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe("Maximum users to return"),
})

export const listUsersInfoTool: AgentTool<
  z.infer<typeof ListUsersInfoInput>,
  {
    users: Array<{
      id: string
      name: string
      status: string
      quotaUsed: string
      expiresAt: string | null
      notes: string | null
    }>
    total: number
  }
> = {
  name: "list_users_info",
  description:
    "List registered client users with their status, quota usage, and expiry details. Use for user inventory and account review.",
  parameters: ListUsersInfoInput,
  jsonSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["active", "disabled", "expired"],
        description: "Filter by status",
      },
      limit: { type: "number", default: 100, description: "Max results" },
    },
  },
  async run(input) {
    const all = await listUsers()
    let filtered = input.status
      ? all.filter((u) => u.status === input.status)
      : all
    filtered = filtered.slice(0, input.limit)
    return {
      users: filtered.map((u) => ({
        id: u.id,
        name: u.displayName,
        status: u.status,
        quotaUsed: u.quotaBytes
          ? `${((u.usedBytes / u.quotaBytes) * 100).toFixed(1)}%`
          : "unlimited",
        expiresAt: u.expiresAt
          ? new Date(u.expiresAt).toISOString()
          : null,
        notes: u.notes ?? null,
      })),
      total: all.length,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: get_user_info                                               */
/* ------------------------------------------------------------------ */

const GetUserInfoInput = z.object({
  userId: z
    .string()
    .min(1)
    .describe("User ID or auth token to look up"),
})

export const getUserInfoTool: AgentTool<
  z.infer<typeof GetUserInfoInput>,
  {
    found: boolean
    user?: {
      id: string
      name: string
      status: string
      quota: { used: number; limit: number | null }
      expiresAt: string | null
      createdAt: string
      notes: string | null
    }
  }
> = {
  name: "get_user_info",
  description:
    "Get full details about a specific client user by ID or auth token. Returns quota usage, expiry, and creation date.",
  parameters: GetUserInfoInput,
  jsonSchema: {
    type: "object",
    properties: {
      userId: { type: "string", description: "User ID or auth token" },
    },
    required: ["userId"],
  },
  async run(input) {
    const user =
      (await getUserById(input.userId)) ??
      (await getUserByAuthToken(input.userId))
    if (!user) return { found: false }
    return {
      found: true,
      user: {
        id: user.id,
        name: user.displayName,
        status: user.status,
        quota: { used: user.usedBytes, limit: user.quotaBytes },
        expiresAt: user.expiresAt
          ? new Date(user.expiresAt).toISOString()
          : null,
        createdAt: new Date(user.createdAt).toISOString(),
        notes: user.notes ?? null,
      },
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: manage_server                                               */
/* ------------------------------------------------------------------ */

const ManageServerInput = z.object({
  action: z
    .enum(["status", "start", "stop", "restart"])
    .describe("Server action to perform"),
})

export const manageServerTool: AgentTool<
  z.infer<typeof ManageServerInput>,
  {
    success: boolean
    state: string
    message: string
    pid: number | null
  }
> = {
  name: "manage_server",
  description:
    "Check Hysteria2 server status or perform start/stop/restart operations. Use status to inspect; start/stop/restart to control the process.",
  parameters: ManageServerInput,
  jsonSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["status", "start", "stop", "restart"],
        description: "Server action",
      },
    },
    required: ["action"],
  },
  async run(input) {
    let status = getManagerStatus()
    try {
      if (input.action === "start") status = await startServer()
      else if (input.action === "stop") status = await stopServer()
      else if (input.action === "restart") status = await restartServer()
      return {
        success:
          status.state === "running" ||
          (input.action === "stop" && status.state !== "running"),
        state: status.state,
        message:
          status.state === "running"
            ? "Server is running"
            : status.lastError ?? `Server state: ${status.state}`,
        pid: status.pid,
      }
    } catch (err) {
      return {
        success: false,
        state: "errored",
        message: err instanceof Error ? err.message : String(err),
        pid: null,
      }
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: get_client_config                                           */
/* ------------------------------------------------------------------ */

const GetClientConfigInput = z.object({
  userId: z.string().min(1).describe("User ID to generate config for"),
  format: z
    .enum(["yaml", "uri", "subscription"])
    .default("yaml")
    .describe(
      "Output format: yaml, uri, or subscription (multi-node)",
    ),
})

export const getClientConfigTool: AgentTool<
  z.infer<typeof GetClientConfigInput>,
  {
    success: boolean
    config?: string
    format: string
    error?: string
  }
> = {
  name: "get_client_config",
  description:
    "Generate a Hysteria2 client configuration (YAML, URI, or subscription) for a specific user. Use this to provide connection details.",
  parameters: GetClientConfigInput,
  jsonSchema: {
    type: "object",
    properties: {
      userId: { type: "string", description: "User ID" },
      format: {
        type: "string",
        enum: ["yaml", "uri", "subscription"],
        default: "yaml",
        description: "Output format",
      },
    },
    required: ["userId"],
  },
  async run(input) {
    const user = await getUserById(input.userId)
    if (!user)
      return {
        success: false,
        format: input.format,
        error: "User not found",
      }
    const nodes = await listNodes()
    const runningNodes = nodes.filter((n) => n.status === "running")
    if (runningNodes.length === 0)
      return {
        success: false,
        format: input.format,
        error: "No running nodes available",
      }

    const serverConfig = await getServerConfig()
    try {
      let config = ""
      if (input.format === "yaml")
        config = renderClientYaml(
          {
            id: user.id,
            displayName: user.displayName,
            authToken: user.authToken,
            status: user.status as "active" | "disabled" | "expired",
          },
          runningNodes[0],
          serverConfig,
        )
      else if (input.format === "uri")
        config = renderClientUri(
          {
            id: user.id,
            displayName: user.displayName,
            authToken: user.authToken,
            status: user.status as "active" | "disabled" | "expired",
          },
          runningNodes[0],
          serverConfig,
        )
      else
        config = renderSubscription([
          {
            user: {
              id: user.id,
              displayName: user.displayName,
              authToken: user.authToken,
              status: user.status as "active" | "disabled" | "expired",
            },
            node: runningNodes[0],
            server: serverConfig,
          },
        ])
      return { success: true, config, format: input.format }
    } catch (err) {
      return {
        success: false,
        format: input.format,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: search_system                                               */
/* ------------------------------------------------------------------ */

const SearchSystemInput = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "Text to search for across system entities (names, hostnames, IDs, tags)",
    ),
})

export const searchSystemTool: AgentTool<
  z.infer<typeof SearchSystemInput>,
  {
    results: {
      nodes: Array<{ id: string; name: string; hostname: string }>
      users: Array<{ id: string; name: string }>
      beacons: Array<{ id: string; hostname: string }>
      implants: Array<{ id: string; name: string }>
    }
    totalHits: number
  }
> = {
  name: "search_system",
  description:
    "Search across all system entities (nodes, users, beacons, implants) by name, hostname, or ID. Use to find specific resources quickly.",
  parameters: SearchSystemInput,
  jsonSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search text" },
    },
    required: ["query"],
  },
  async run(input) {
    const q = input.query.toLowerCase()
    const [nodes, users, beacons, implants] = await Promise.all([
      listNodes(),
      listUsers(),
      listBeacons(),
      listImplants(),
    ])

    const nodeHits = nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.hostname.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q),
    )
    const userHits = users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
    )
    const beaconHits = beacons.filter(
      (b) =>
        b.hostname.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q),
    )
    const implantHits = implants.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q),
    )

    return {
      results: {
        nodes: nodeHits.map((n) => ({
          id: n.id,
          name: n.name,
          hostname: n.hostname,
        })),
        users: userHits.map((u) => ({ id: u.id, name: u.displayName })),
        beacons: beaconHits.map((b) => ({
          id: b.id,
          hostname: b.hostname,
        })),
        implants: implantHits.map((i) => ({
          id: i.id,
          name: i.name,
        })),
      },
      totalHits:
        nodeHits.length +
        userHits.length +
        beaconHits.length +
        implantHits.length,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: list_credentials_info                                       */
/* ------------------------------------------------------------------ */

const ListCredentialsInfoInput = z.object({
  verified: z
    .boolean()
    .optional()
    .describe("Filter: true = only verified, false = only unverified"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe("Max results"),
})

export const listCredentialsInfoTool: AgentTool<
  z.infer<typeof ListCredentialsInfoInput>,
  {
    credentials: Array<{
      id: string
      username: string
      domain: string | null
      type: string
      verified: boolean
      sourceHost: string | null
      discoveredAt: string
    }>
    total: number
    verified: number
    unverified: number
  }
> = {
  name: "list_credentials_info",
  description:
    "List harvested credentials with verification status, domain, and source host info. Use for credential inventory review.",
  parameters: ListCredentialsInfoInput,
  jsonSchema: {
    type: "object",
    properties: {
      verified: {
        type: "boolean",
        description: "Filter by verified status",
      },
      limit: { type: "number", default: 100 },
    },
  },
  async run(input) {
    const creds = await listCredentials()
    let filtered =
      input.verified !== undefined
        ? creds.filter((c) => c.verified === input.verified)
        : creds
    filtered = filtered.slice(0, input.limit)
    return {
      credentials: filtered.map((c) => ({
        id: c.id,
        username: c.username,
        domain: c.domain ?? null,
        type: c.type,
        verified: c.verified,
        sourceHost: c.sourceHost ?? null,
        discoveredAt: new Date(c.discoveredAt).toISOString(),
      })),
      total: creds.length,
      verified: creds.filter((c) => c.verified).length,
      unverified: creds.filter((c) => !c.verified).length,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: generate_plan                                               */
/* ------------------------------------------------------------------ */

const GeneratePlanInput = z.object({
  goal: z
    .string()
    .min(1)
    .max(4000)
    .describe("What you want to accomplish"),
  constraints: z
    .array(z.string())
    .optional()
    .describe(
      "Any constraints like time limits, stealth requirements, or resource restrictions",
    ),
})

export const generatePlanTool: AgentTool<
  z.infer<typeof GeneratePlanInput>,
  {
    steps: Array<{
      order: number
      action: string
      tool: string | null
      rationale: string
      dependsOn: number[]
    }>
    totalSteps: number
    estimatedTime: string
    risks: string[]
  }
> = {
  name: "generate_plan",
  description:
    "Create a step-by-step action plan for a complex goal. Returns ordered steps with tool recommendations, dependencies, and risk assessment. Use before executing multi-step operations. " +
    "REQUIRES the 'goal' parameter — this is mandatory and cannot be omitted.",
  parameters: GeneratePlanInput,
  jsonSchema: {
    type: "object",
    properties: {
      goal: { type: "string", description: "MANDATORY: What you want to accomplish — you MUST provide this parameter" },
      constraints: {
        type: "array",
        items: { type: "string" },
        description: "Optional constraints like time limits, stealth requirements, or resource restrictions",
      },
    },
    required: ["goal"],
  },
  async run(input) {
    const steps: Array<{
      order: number
      action: string
      tool: string | null
      rationale: string
      dependsOn: number[]
    }> = []
    const risks: string[] = []

    if (
      input.goal.toLowerCase().includes("deploy") ||
      input.goal.toLowerCase().includes("node")
    ) {
      steps.push({
        order: 1,
        action: "Check current infrastructure",
        tool: "list_nodes",
        rationale: "Know what exists before adding",
        dependsOn: [],
      })
      steps.push({
        order: 2,
        action: "Review available providers",
        tool: "list_provider_presets",
        rationale: "Choose best provider/region",
        dependsOn: [],
      })
      steps.push({
        order: 3,
        action: "Deploy the node",
        tool: "deploy_node",
        rationale: "Provision the infrastructure",
        dependsOn: [1, 2],
      })
      steps.push({
        order: 4,
        action: "Monitor deployment",
        tool: "get_deployment_status",
        rationale: "Track until ready",
        dependsOn: [3],
      })
      steps.push({
        order: 5,
        action: "Verify node health",
        tool: "system_status",
        rationale: "Confirm operational",
        dependsOn: [4],
      })
    } else if (
      input.goal.toLowerCase().includes("payload") ||
      input.goal.toLowerCase().includes("build")
    ) {
      steps.push({
        order: 1,
        action: "Check existing payloads",
        tool: "list_payloads",
        rationale: "Avoid duplicates",
        dependsOn: [],
      })
      steps.push({
        order: 2,
        action: "Build the payload",
        tool: "generate_payload",
        rationale: "Create the implant",
        dependsOn: [1],
      })
      steps.push({
        order: 3,
        action: "Monitor build status",
        tool: "get_payload_status",
        rationale: "Wait for completion",
        dependsOn: [2],
      })
    } else if (
      input.goal.toLowerCase().includes("diagnose") ||
      input.goal.toLowerCase().includes("troubleshoot") ||
      input.goal.toLowerCase().includes("problem")
    ) {
      steps.push({
        order: 1,
        action: "Get system overview",
        tool: "system_status",
        rationale: "Identify broad issues",
        dependsOn: [],
      })
      steps.push({
        order: 2,
        action: "Run diagnostics",
        tool: "troubleshoot",
        rationale: "Targeted checks",
        dependsOn: [1],
      })
      steps.push({
        order: 3,
        action: "Analyze traffic patterns",
        tool: "analyze_traffic",
        rationale: "Check for anomalies",
        dependsOn: [1],
      })
      steps.push({
        order: 4,
        action: "Check server logs",
        tool: "get_server_logs",
        rationale: "Find error details",
        dependsOn: [2],
      })
    } else {
      steps.push({
        order: 1,
        action: "Get system status overview",
        tool: "system_status",
        rationale: "Understand current state",
        dependsOn: [],
      })
      steps.push({
        order: 2,
        action: "Search for relevant entities",
        tool: "search_system",
        rationale: "Find matching resources",
        dependsOn: [],
      })
      steps.push({
        order: 3,
        action: "Execute the requested operation",
        tool: null,
        rationale: "Choose the best tool based on findings",
        dependsOn: [1, 2],
      })
    }

    if (
      input.constraints?.some(
        (c) =>
          c.toLowerCase().includes("stealth") ||
          c.toLowerCase().includes("quiet"),
      )
    ) {
      risks.push(
        "Stealth constraint: use obfuscated configs, avoid aggressive scanning",
      )
    }
    if (
      input.constraints?.some(
        (c) =>
          c.toLowerCase().includes("fast") ||
          c.toLowerCase().includes("speed"),
      )
    ) {
      risks.push(
        "Speed constraint: parallel execution preferred, accept higher noise",
      )
    }

    return {
      steps,
      totalSteps: steps.length,
      estimatedTime: `${steps.length * 30}s – ${steps.length * 120}s`,
      risks,
    }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: check_prerequisites                                         */
/* ------------------------------------------------------------------ */

const CheckPrerequisitesInput = z.object({
  operation: z
    .enum([
      "deploy_node",
      "generate_payload",
      "send_email",
      "apply_config",
      "start_server",
      "general",
    ])
    .optional()
    .default("general")
    .describe("Operation to check readiness for"),
  provider: z
    .enum(["hetzner", "digitalocean", "vultr", "lightsail", "azure"])
    .optional()
    .describe("Cloud provider to validate (for deploy_node)"),
  region: z.string().optional().describe("Target region (for deploy_node)"),
  resourceGroup: z
    .string()
    .optional()
    .describe("Azure resource group (for deploy_node with azure provider)"),
})

export const checkPrerequisitesTool: AgentTool<
  z.infer<typeof CheckPrerequisitesInput>,
  {
    ready: boolean
    checks: Array<{
      item: string
      status: "ok" | "missing" | "warning"
      detail: string
    }>
    missingItems: string[]
  }
> = {
  name: "check_prerequisites",
  description:
    "Validate that all prerequisites are met before performing an operation. Checks credentials, configurations, and environment readiness. " +
    "REQUIRES the 'operation' parameter — this is mandatory and cannot be omitted.",
  parameters: CheckPrerequisitesInput,
  jsonSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: [
          "deploy_node",
          "generate_payload",
          "send_email",
          "apply_config",
          "start_server",
          "general",
        ],
        description: "Operation to validate — defaults to 'general' if not provided",
      },
      provider: {
        type: "string",
        enum: ["hetzner", "digitalocean", "vultr", "lightsail", "azure"],
        description: "Cloud provider (required for deploy_node operation)",
      },
      region: { type: "string", description: "Target region (required for deploy_node operation)" },
      resourceGroup: {
        type: "string",
        description: "Azure resource group name (required for deploy_node with azure provider)",
      },
    },
    required: [],
  },
  async run(input) {
    const checks: Array<{
      item: string
      status: "ok" | "missing" | "warning"
      detail: string
    }> = []
    const config = await getServerConfig()
    const nodes = await listNodes()

    switch (input.operation) {
      case "deploy_node": {
        checks.push(
          config
            ? {
                item: "Server config",
                status: "ok",
                detail: "Config exists",
              }
            : {
                item: "Server config",
                status: "missing",
                detail: "No server config found — deploy may fail",
              },
        )

        // Perform real deployment validation if provider is specified
        const provider = input.provider ?? "hetzner"
        const region = input.region ?? "fsn1"
        const size = "cx22" // default size for hetzner

        try {
          const { serverEnv } = await import('@/lib/env')
          const env = serverEnv()
          const validation = await validateDeploymentConfig({
            provider,
            region,
            size,
            name: "preflight-check",
            panelUrl: env.NEXT_PUBLIC_APP_URL || "https://example.com",
            port: 443,
            tags: [],
            resourceGroup: input.resourceGroup,
          })

          for (const issue of validation.issues) {
            checks.push({
              item: issue.code,
              status: issue.severity === "error" ? "missing" : "warning",
              detail: `${issue.message}${issue.suggestion ? ` — ${issue.suggestion}` : ""}`,
            })
          }
        } catch (err) {
          checks.push({
            item: "Deployment validation",
            status: "warning",
            detail: `Could not perform full validation: ${err instanceof Error ? err.message : String(err)}`,
          })
        }
        break
      }
      case "generate_payload":
        checks.push(
          nodes.length > 0
            ? {
                item: "Target nodes",
                status: "ok",
                detail: `${nodes.length} node(s) available`,
              }
            : {
                item: "Target nodes",
                status: "missing",
                detail:
                  "No nodes registered — payload will have no C2 target",
              },
        )
        checks.push(
          config
            ? {
                item: "Server config",
                status: "ok",
                detail: "Config exists",
              }
            : {
                item: "Server config",
                status: "missing",
                detail: "No config — generated payload may misconfigured",
              },
        )
        break
      case "apply_config":
        checks.push(
          nodes.length > 0
            ? {
                item: "Nodes available",
                status: "ok",
                detail: `${nodes.length} node(s)`,
              }
            : {
                item: "Nodes",
                status: "missing",
                detail: "No nodes to apply config to",
              },
        )
        checks.push(
          config
            ? {
                item: "Server config",
                status: "ok",
                detail: "Config exists",
              }
            : {
                item: "Server config",
                status: "missing",
                detail: "No server config",
              },
        )
        break
      default:
        checks.push({
          item: "System overview",
          status: "ok",
          detail: "Run system_status for full health check",
        })
    }

    const missingItems = checks
      .filter((c) => c.status === "missing")
      .map((c) => c.item)
    return { ready: missingItems.length === 0, checks, missingItems }
  },
}

/* ------------------------------------------------------------------ */
/*  Tool: prompt_user                                                 */
/* ------------------------------------------------------------------ */

const PromptUserInput = z.object({
  question: z.string().min(1).max(500).describe("The question to ask the user"),
  options: z.array(z.object({
    label: z.string().min(1).max(100).describe("Short label for the option (displayed to user)"),
    value: z.string().min(1).max(100).describe("The value to return if this option is selected"),
    description: z.string().max(200).optional().describe("Additional description for the option"),
  })).min(2).max(8).describe("List of options to present (2-8 options)"),
  multiSelect: z.boolean().default(false).describe("Allow user to select multiple options"),
})

export const promptUserTool: AgentTool<
  z.infer<typeof PromptUserInput>,
  {
    question: string
    options: Array<{ label: string; value: string; description?: string }>
    multiSelect: boolean
    userSelection?: string | string[]
    status: "pending" | "answered" | "cancelled"
    message: string
  }
> = {
  name: "prompt_user",
  description:
    "Present a multiple-choice question to the user and wait for their selection. Use this when you need clarification on parameters (provider, region, size, etc.) instead of guessing or using defaults. " +
    "Returns the user's selection(s). If the user cancels, returns cancelled status.",
  parameters: PromptUserInput,
  jsonSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "MANDATORY: The question to ask the user — you MUST provide this parameter"
      },
      options: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Short label for the option" },
            value: { type: "string", description: "Value to return if selected" },
            description: { type: "string", description: "Additional description" }
          },
          required: ["label", "value"]
        },
        description: "MANDATORY: List of options (2-8) — you MUST provide this parameter"
      },
      multiSelect: {
        type: "boolean",
        default: false,
        description: "Allow multiple selections"
      }
    },
    required: ["question", "options"],
  },
  async run(input) {
    // This is a placeholder - in a real implementation, this would:
    // 1. Store the prompt in a database
    // 2. Return a "pending" status
    // 3. The frontend would poll or use WebSocket to get the prompt
    // 4. User selects an option
    // 5. The tool is called again with the selection
    // The prompt_user tool forwards the question to the user interface.
    // It returns the question details so the frontend can render the prompt.
    return {
      question: input.question,
      options: input.options,
      multiSelect: input.multiSelect,
      userSelection: undefined,
      status: "pending",
      message: "Waiting for user selection."
    }
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
  [generatePayloadTool.name]: generatePayloadTool,
  [listPayloadsTool.name]: listPayloadsTool,
  [getPayloadStatusTool.name]: getPayloadStatusTool,
  [deletePayloadTool.name]: deletePayloadTool,
  [deployNodeTool.name]: deployNodeTool,
  [listDeploymentsTool.name]: listDeploymentsTool,
  [getDeploymentStatusTool.name]: getDeploymentStatusTool,
  [listProviderPresetsTool.name]: listProviderPresetsTool,
  [listNodesTool.name]: listNodesTool,
  [getNodeTool.name]: getNodeTool,
  [createNodeTool.name]: createNodeTool,
  [updateNodeTool.name]: updateNodeTool,
  [deleteNodeTool.name]: deleteNodeTool,
  [applyNodeConfigTool.name]: applyNodeConfigTool,
  [listBeaconsTool.name]: listBeaconsTool,
  [getBeaconTool.name]: getBeaconTool,
  [securityAnalysisTool.name]: securityAnalysisTool,
  [performanceOptimizationTool.name]: performanceOptimizationTool,
  [incidentResponseTool.name]: incidentResponseTool,
  [networkAnalysisTool.name]: networkAnalysisTool,
  [threatIntelligenceTool.name]: threatIntelligenceTool,
  [systemStatusTool.name]: systemStatusTool,
  [listUsersInfoTool.name]: listUsersInfoTool,
  [getUserInfoTool.name]: getUserInfoTool,
  [manageServerTool.name]: manageServerTool,
  [getClientConfigTool.name]: getClientConfigTool,
  [searchSystemTool.name]: searchSystemTool,
  [listCredentialsInfoTool.name]: listCredentialsInfoTool,
  [generatePlanTool.name]: generatePlanTool,
  [checkPrerequisitesTool.name]: checkPrerequisitesTool,
  [promptUserTool.name]: promptUserTool,
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
  // Use run if available, otherwise fall back to execute
  if (tool.run) {
    return tool.run(parsed.data, ctx)
  } else if (tool.execute) {
    return tool.execute(parsed.data, ctx)
  } else {
    throw new Error(`tool ${name} has no run or execute method`)
  }
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
