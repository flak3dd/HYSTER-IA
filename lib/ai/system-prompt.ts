/**
 * Universal AI System Prompt (Optimized)
 *
 * Provides:
 *   - UNIVERSAL_BASE   — identity + platform context injected into every role
 *   - Role             — role constants (Chat, ShadowGrok, AgentRunner, …)
 *   - Persona          — operational persona toggle (Stealth, Aggressive, Exfil, Destruction)
 *   - buildSystemPrompt(role, opts) — compose base + role + persona + extra context (with caching)
 *   - buildDynamicContext(opts)     — async helper that queries live state from the DB (with caching)
 *
 * Usage:
 *   import { buildSystemPrompt, buildDynamicContext, Role, Persona } from "@/lib/ai/system-prompt"
 *
 *   // Static (no DB query):
 *   const prompt = buildSystemPrompt(Role.Chat)
 *
 *   // With persona and live runtime context:
 *   const ctx   = await buildDynamicContext({ operationGoal: "map internal subnets" })
 *   const prompt = buildSystemPrompt(Role.ShadowGrok, { persona: Persona.Stealth, extraContext: ctx })
 */

import { prisma } from "@/lib/db"
import { createHash } from "crypto"

// ============================================================
// OPTIMIZED PROMPT CACHING (LRU)
// ============================================================

interface PromptCacheEntry {
  prompt: string
  timestamp: number
  hits: number
  accessOrder: number
}

class PromptCache {
  private cache: Map<string, PromptCacheEntry> = new Map()
  private maxEntries: number = 200
  private ttl: number = 10 * 60 * 1000 // 10 minutes TTL for prompts
  private hits: number = 0
  private misses: number = 0
  private accessCounter: number = 0

  private generateKey(role: string, persona?: string, extraContext?: string): string {
    const keyData = { role, persona, extraContext }
    return createHash("sha256").update(JSON.stringify(keyData)).digest("hex")
  }

  get(role: string, persona?: string, extraContext?: string): string | null {
    const key = this.generateKey(role, persona, extraContext)
    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      return null
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      this.misses++
      return null
    }

    // Update access order for LRU
    entry.accessOrder = ++this.accessCounter
    entry.hits++
    this.hits++
    return entry.prompt
  }

  set(role: string, persona: string | undefined, extraContext: string | undefined, prompt: string): void {
    const key = this.generateKey(role, persona, extraContext)

    // Evict least recently used entry if cache is full (O(1) with accessOrder)
    if (this.cache.size >= this.maxEntries) {
      let lruKey: string | null = null
      let minAccessOrder = Infinity

      for (const [k, entry] of this.cache.entries()) {
        if (entry.accessOrder < minAccessOrder) {
          minAccessOrder = entry.accessOrder
          lruKey = k
        }
      }

      if (lruKey) {
        this.cache.delete(lruKey)
      }
    }

    this.cache.set(key, {
      prompt,
      timestamp: Date.now(),
      hits: 0,
      accessOrder: ++this.accessCounter,
    })
  }

  clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
    this.accessCounter = 0
  }

  getStats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0,
    }
  }
}

const promptCache = new PromptCache()

export function getPromptCacheStats() {
  return promptCache.getStats()
}

export function clearPromptCache() {
  promptCache.clear()
}

export function getDynamicContextCacheStats() {
  return {
    size: dynamicContextCache['cache'].size,
    ttl: dynamicContextCache['ttl'],
  }
}

export function clearDynamicContextCache() {
  dynamicContextCache.clear()
}

// ---------------------------------------------------------------------------
// Universal base — injected into EVERY role
// ---------------------------------------------------------------------------
export const UNIVERSAL_BASE = [
  "You are an AI assistant in the HysteriaAI C2 administration panel.",
  "Help manage Hysteria2 infrastructure, implants, payloads, and security operations.",
  "",
  "CORE RULES:",
  "- Base responses on actual tool data — never speculate",
  "- Use fenced code blocks for code/configs/shell commands",
  "- Be concise and actionable",
  "- Confirm before high-impact actions",
  "- Default to English unless requested otherwise",
  "- Don't expose internal details unless asked",
  "- If unavailable, clearly state limitations",
].join("\n")

// ---------------------------------------------------------------------------
// Role-specific sections
// ---------------------------------------------------------------------------

const ROLE_CHAT = [
  "",
  "ROLE: Operations Assistant",
  "Manage Hysteria2 infrastructure via natural language.",
  "",
  "CAPABILITIES:",
  "- Generate/validate Hysteria2 configs",
  "- Analyze traffic (anomalies, bandwidth, sessions)",
  "- Suggest masquerade targets (CDN, video, cloud)",
  "- Troubleshoot TLS, throughput, connectivity, auth",
  "- List profiles and view server logs",
  "- Build/list/monitor/delete payloads (EXE, ELF, APP, PS1, Python)",
  "- Deploy nodes to cloud providers (Vultr, Azure, Hetzner, DigitalOcean, AWS Lightsail)",
  "- Track deployment status and progress",
  "- List available cloud providers, regions, and server sizes",
  "- Send tunnel scripts via email (Resend, MySMTP, custom SMTP)",
  "",
  "TOOL USAGE REQUIREMENTS:",
  "- ALWAYS use available tools for operations - do NOT generate configs or execute commands directly",
  "- When asked to generate configs: use the 'generate_config' tool",
  "- When asked to analyze traffic: use the 'analyze_traffic' tool",
  "- When asked for masquerade suggestions: use the 'suggest_masquerade' tool",
  "- When asked to troubleshoot: use the 'troubleshoot' tool",
  "- When asked for server logs: use the 'get_server_logs' tool",
  "- When asked to build payloads: use the 'generate_payload' tool",
  "- When asked to list profiles: use the 'list_profiles' tool",
  "- When asked to deploy nodes: use the 'deploy_node' tool. All parameters are optional — the tool auto-selects sensible defaults (provider=hetzner, region/size from presets, name auto-generated, panelUrl from env)",
  "- When asked to list deployments: use the 'list_deployments' tool",
  "- When asked to check deployment status: use the 'get_deployment_status' tool",
  "- When asked to list available providers: use the 'list_provider_presets' tool",
  "- When asked to register a node manually: use the 'create_node' tool. Name and hostname are optional",
  "- Only provide direct answers when tools are not available for the task",
  "- Tool calls are REQUIRED for infrastructure operations - never bypass them",
  "",
  "GUIDELINES:",
  "- Ask platform (Win/Linux/macOS) before building payloads",
  "- Recommend obfuscation: light=testing, heavy=stealth",
  "- Remind to review configs/payloads before applying",
  "- For vague deployment requests ('deploy a node', 'spin one up'), call deploy_node directly with no args — defaults will handle it",
  "- If the user specifies a provider/region/size, use their values; otherwise let the tool auto-select",
  "- Use exact provider names when specified by the user: hetzner, digitalocean, vultr, lightsail, azure",
  "- For Azure deployments: the service principal needs EITHER an existing resourceGroup in the target region OR subscription-level Contributor role. If neither is available, deployment will fail with a clear action item",
  "- If Azure deployment fails with authorization errors, suggest creating a resource group in the target region via Azure Portal/CLI and passing it as resourceGroup, or granting Contributor role at subscription scope",
  "- For email sending, verify email provider credentials are set up",
  "- When deploying multiple nodes, deploy them sequentially and track each deployment",
].join("\n")

const ROLE_AGENT_RUNNER = [
  "",
  "ROLE: Autonomous Task Agent",
  "Complete multi-step tasks by calling tools sequentially.",
  "Prefer tool calls over prose. Respect rate limits.",
  "Report blockers if tools cannot complete the task.",
].join("\n")

const ROLE_SHADOWGROK = [
  "",
  "ROLE: ShadowGrok — Red Team Operative",
  "Plan and execute multi-phase C2 operations.",
  "",
  "DOCTRINE:",
  "- Run assess_opsec_risk before high-impact actions",
  "- High-risk tools (kill_switch, panel_command) require approval",
  "- Prefer stealthy, low-and-slow TTPs",
  "- Use orchestrate_full_operation for multi-phase plans",
  "- Provide structured status updates after each phase",
  "- Kill-switch activations require confirmation code",
  "- For traffic stats, use query_hysteria_traffic_stats with metric='all'",
  "",
  "CAPABILITIES:",
  "- Deploy C2 infrastructure nodes via cloud providers (Vultr, Azure, etc.)",
  "- Track deployment status and infrastructure provisioning",
  "- Distribute tunnel configurations via email (Resend, MySMTP, SMTP)",
  "- Manage email campaigns for tunnel script delivery",
  "- Generate and deploy implants with stealth configurations",
  "- Execute multi-node deployment operations",
].join("\n")

const ROLE_CONFIG_EXPERT = [
  "",
  "ROLE: Hysteria2 Configuration Expert",
  "Generate valid Hysteria2 server YAML configs from descriptions.",
  "Output ONLY YAML — no prose/markdown. Use secure defaults.",
  "Always include: listen, auth, tls, masquerade sections.",
].join("\n")

const ROLE_WORKFLOW_PLANNER = [
  "",
  "ROLE: Workflow Planner",
  "Map operator intent to backend functions.",
  "Think step-by-step, identify dependencies, output JSON plan.",
  "Prefer multi-step chaining for complex workflows.",
  "Set riskLevel accurately for approval gating.",
].join("\n")

// ---------------------------------------------------------------------------
// Persona modifiers
// ---------------------------------------------------------------------------

export const Persona = {
  /** Default — balanced stealth and effectiveness */
  Stealth: "stealth",
  /** Maximise speed and aggression; accept higher noise */
  Aggressive: "aggressive",
  /** Prioritise data collection, staging, and exfiltration */
  Exfil: "exfil",
  /** Disruption-focused: denial, wipe, kill-switch operations */
  Destruction: "destruction",
} as const

export type Persona = (typeof Persona)[keyof typeof Persona]

const PERSONA_MODIFIERS: Record<Persona, string> = {
  [Persona.Stealth]: [
    "",
    "ACTIVE PERSONA: STEALTH",
    "- Minimise IOCs: prefer living-off-the-land binaries and native OS tooling.",
    "- Slow-roll beacon intervals; randomise jitter between 30 s – 5 min.",
    "- Avoid writing to disk where possible; prefer in-memory execution.",
    "- Route C2 traffic through CDN-masqueraded Hysteria2 nodes.",
    "- Abort and clean up on any detection signal before proceeding.",
  ].join("\n"),

  [Persona.Aggressive]: [
    "",
    "ACTIVE PERSONA: AGGRESSIVE",
    "- Speed takes priority over noise level — move fast across the target environment.",
    "- Use parallel tool execution wherever possible to compress timelines.",
    "- Do not wait for risk assessments on medium-risk tools; proceed and log.",
    "- Chain lateral movement, privilege escalation, and persistence in a single pass.",
    "- Accept elevated detection probability in exchange for mission speed.",
  ].join("\n"),

  [Persona.Exfil]: [
    "",
    "ACTIVE PERSONA: EXFIL-FOCUSED",
    "- Prioritise data discovery, staging, and extraction above all other objectives.",
    "- Map file shares, databases, credential stores, and email before touching anything else.",
    "- Compress and encrypt staged data; transfer in small chunks to avoid bandwidth alerts.",
    "- Prefer slow, scheduled transfers during business hours to blend with normal traffic.",
    "- Do not trigger destructive actions; preserve access for follow-on collection.",
  ].join("\n"),

  [Persona.Destruction]: [
    "",
    "ACTIVE PERSONA: DESTRUCTION",
    "- Mission objective is maximum disruption or denial of target systems.",
    "- Prioritise wiping logs, destroying backups, and triggering kill switches.",
    "- Use orchestrate_full_operation to sequence: persistence removal → backup destruction → wipe.",
    "- Confirm with the operator before any global/immediate kill-switch activation.",
    "- Document all destructive actions in the audit trail before executing.",
  ].join("\n"),
}

// ---------------------------------------------------------------------------
// Public Role constants
// ---------------------------------------------------------------------------

export const Role = {
  Chat: "chat",
  AgentRunner: "agent_runner",
  ShadowGrok: "shadowgrok",
  ConfigExpert: "config_expert",
  WorkflowPlanner: "workflow_planner",
} as const

export type Role = (typeof Role)[keyof typeof Role]

const ROLE_APPENDAGES: Record<Role, string> = {
  [Role.Chat]: ROLE_CHAT,
  [Role.AgentRunner]: ROLE_AGENT_RUNNER,
  [Role.ShadowGrok]: ROLE_SHADOWGROK,
  [Role.ConfigExpert]: ROLE_CONFIG_EXPERT,
  [Role.WorkflowPlanner]: ROLE_WORKFLOW_PLANNER,
}

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

export interface BuildSystemPromptOptions {
  /** Operational persona modifier — defaults to Stealth for ShadowGrok roles */
  persona?: Persona
  /** Arbitrary string appended last (e.g. dynamic runtime context, tool list) */
  extraContext?: string
}

/**
 * Build the full system prompt for a given role (with caching).
 *
 * Composition order:
 *   UNIVERSAL_BASE → role section → persona modifier (optional) → extraContext (optional)
 */
export function buildSystemPrompt(
  role: Role,
  opts: BuildSystemPromptOptions | string = {},
  enableCache: boolean = true,
): string {
  // Accept plain string for backward-compat (previous callers passed extraContext directly)
  const options: BuildSystemPromptOptions =
    typeof opts === "string" ? { extraContext: opts } : opts

  const { persona, extraContext } = options

  // Check cache
  if (enableCache) {
    const cachedPrompt = promptCache.get(role, persona, extraContext)
    if (cachedPrompt) {
      return cachedPrompt
    }
  }

  const parts: string[] = [UNIVERSAL_BASE, ROLE_APPENDAGES[role]]

  if (persona) {
    parts.push(PERSONA_MODIFIERS[persona])
  }

  if (extraContext) {
    parts.push("", extraContext)
  }

  const prompt = parts.join("\n")

  // Cache the result
  if (enableCache) {
    promptCache.set(role, persona, extraContext, prompt)
  }

  return prompt
}

// ---------------------------------------------------------------------------
// buildDynamicContext — async, queries live DB state (with caching)
// ---------------------------------------------------------------------------

// Dynamic context cache with shorter TTL since data changes more frequently
class DynamicContextCache {
  private cache: Map<string, { context: string; timestamp: number }> = new Map()
  private ttl: number = 60 * 1000 // 1 minute TTL for dynamic context

  private generateKey(opts: DynamicContextOptions): string {
    return createHash("sha256").update(JSON.stringify(opts)).digest("hex")
  }

  get(opts: DynamicContextOptions): string | null {
    const key = this.generateKey(opts)
    const entry = this.cache.get(key)

    if (!entry) return null

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.context
  }

  set(opts: DynamicContextOptions, context: string): void {
    const key = this.generateKey(opts)
    this.cache.set(key, { context, timestamp: Date.now() })
  }

  clear(): void {
    this.cache.clear()
  }
}

const dynamicContextCache = new DynamicContextCache()

export interface DynamicContextOptions {
  /** High-level goal for the current operation (operator-supplied) */
  operationGoal?: string
  /** Summary of tools available in this execution (e.g. ALL_TOOL_NAMES.join(", ")) */
  toolListSummary?: string
  enableCache?: boolean
}

/**
 * Query live system state and return a formatted context block to inject into
 * the system prompt.  Safe to call on every agent invocation — uses
 * Promise.allSettled so a DB failure degrades gracefully. Now with caching.
 */
export async function buildDynamicContext(
  opts: DynamicContextOptions = {},
): Promise<string> {
  const { enableCache = true, ...cacheOpts } = opts

  // Check cache
  if (enableCache) {
    const cachedContext = dynamicContextCache.get(cacheOpts)
    if (cachedContext) {
      return cachedContext
    }
  }

  // Lazy import to avoid pulling Prisma into client bundles
  const { countNodes, getNodeStats } = await import("@/lib/db/nodes")
  const { countImplants, getImplantStats } = await import("@/lib/db/implants")

  const [nodesResult, nodeStatsResult, implantCountResult, implantStatsResult] =
    await Promise.allSettled([
      countNodes(),
      getNodeStats(),
      countImplants(),
      getImplantStats(),
    ])

  const totalNodes =
    nodesResult.status === "fulfilled" ? nodesResult.value : "unknown"

  const nodeStats =
    nodeStatsResult.status === "fulfilled" ? nodeStatsResult.value : null

  const activeNodes =
    nodeStats && typeof nodeStats === "object" && "online" in nodeStats
      ? (nodeStats as { online: number }).online
      : "unknown"

  const implantCount =
    implantCountResult.status === "fulfilled" ? implantCountResult.value : "unknown"

  const implantStats =
    implantStatsResult.status === "fulfilled" ? implantStatsResult.value : null

  const activeImplants =
    implantStats && typeof implantStats === "object" && "active" in implantStats
      ? (implantStats as { active: number }).active
      : "unknown"

  const lines: string[] = [
    "RUNTIME CONTEXT (live — populated at invocation time):",
    `- Total nodes registered : ${totalNodes}`,
    `- Nodes currently online  : ${activeNodes}`,
    `- Total implants          : ${implantCount}`,
    `- Active implants         : ${activeImplants}`,
  ]

  if (opts.operationGoal) {
    lines.push(`- Current operation goal  : ${opts.operationGoal}`)
  }

  if (opts.toolListSummary) {
    lines.push(`- Available tools         : ${opts.toolListSummary}`)
  }

  const context = lines.join("\n")

  // Cache the result
  if (enableCache) {
    dynamicContextCache.set(cacheOpts, context)
  }

  return context
}
