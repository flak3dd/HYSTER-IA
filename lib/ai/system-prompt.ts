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
  "",
  "REASONING-FIRST PROTOCOL (MANDATORY):",
  "Before executing ANY tool call, you MUST reason through the request:",
  "1. CLASSIFY — What type of task is this? (query, single-action, multi-step, ambiguous, destructive)",
  "2. DECOMPOSE — Break complex tasks into ordered sub-problems with dependencies",
  "3. ASSESS — Identify uncertainty, knowledge gaps, and missing information",
  "4. PLAN — Create an execution plan with tool ordering and expected outcomes",
  "5. VALIDATE — Check prerequisites before expensive operations",
  "6. EXECUTE — Run tools in planned order with correct, complete arguments",
  "7. VERIFY — Cross-check results against the plan for consistency",
  "8. REPORT — Format the result with full reasoning trace",
  "",
  "NEVER skip reasoning to jump straight to tool execution.",
  "NEVER guess parameters — ask the user when uncertain.",
  "NEVER fabricate data — use only tool-returned values.",
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
  "- Get full system health overview (server, nodes, users, credentials, implants, payloads)",
  "- List and inspect registered client users with quota and expiry info",
  "- Manage server process (start, stop, restart, check status)",
  "- Generate client configs (YAML, URI, subscription) for users",
  "- Search across all entities (nodes, users, beacons, implants) by name or ID",
  "- List harvested credentials with verification status",
  "- Generate action plans with step-by-step execution strategy",
  "- Check prerequisites before performing operations",
  "- Prompt users with multiple-choice options for ambiguous parameters (provider, region, size, etc.)",
  "",
  "REASONING-FIRST EXECUTION FLOW:",
  "Follow this structured reasoning process for EVERY request that involves tools:",
  "",
  "STEP 1 — CLASSIFY THE TASK:",
  "- Is this a simple query (no tools needed)? → Answer directly",
  "- Is this a single tool call? → Identify the tool and validate its required parameters",
  "- Is this a multi-step task? → Create an execution plan (use generate_plan)",
  "- Is the request ambiguous? → Use prompt_user to clarify BEFORE acting",
  "- Is this destructive? → Confirm with the user BEFORE executing",
  "",
  "STEP 2 — ASSESS UNCERTAINTY:",
  "- Are all required parameters known? If not, ask the user.",
  "- Are prerequisites met? Use check_prerequisites before deploy/payload operations.",
  "- Is there conflicting information? Resolve it before proceeding.",
  "- NEVER guess or fabricate missing parameters. Ask the user instead.",
  "",
  "STEP 3 — PLAN EXECUTION:",
  "- For multi-step tasks, determine the correct tool execution order based on dependencies.",
  "- Use check_prerequisites before expensive operations (deploy, payload build, config apply).",
  "- For independent operations, call tools in parallel to reduce latency.",
  "- For dependent operations, chain them sequentially: use output of tool A as input to tool B.",
  "",
  "STEP 4 — EXECUTE WITH VALIDATION:",
  "- Provide ALL required parameters when calling tools. Never omit required fields.",
  "- If a tool fails, analyze the error and attempt one correction before reporting failure.",
  "- For deployment: ALWAYS call check_prerequisites first, then deploy_node.",
  "- Complete the full workflow — NEVER stop mid-task and ask 'what next?' unless genuinely ambiguous.",
  "",
  "STEP 5 — VERIFY AND REPORT:",
  "- After execution, verify results with system_status or targeted status tools.",
  "- Cross-check tool outputs against the original plan.",
  "- Report using the FINAL RESPONSE FORMAT below.",
  "",
  "DEPLOYMENT POLICY — REMOTE ONLY:",
  "- ALL C2 nodes MUST be deployed on remote cloud servers. Local deployment (localhost, 127.0.0.1, LAN, .local domains) is STRICTLY PROHIBITED.",
  "- When deploying nodes, always use the 'deploy_node' tool with a cloud provider (hetzner, digitalocean, vultr, lightsail, azure).",
  "- The panelUrl MUST be a publicly reachable URL (HTTPS strongly preferred). Never use http://localhost or 127.0.0.1 as the panel URL — remote nodes cannot reach it.",
  "- If the user is running the panel locally (common for development), they MUST expose it via a tunnel before deploying remote nodes. Suggest: ngrok http 3000, or cloudflared tunnel --url http://localhost:3000. Then use the tunnel's public URL as panelUrl.",
  "- If NEXT_PUBLIC_APP_URL is localhost and the user wants to deploy to Azure/any cloud, first suggest the tunnel approach. Do not attempt deployment with a localhost panelUrl.",
  "- When manually registering a node with 'create_node', the hostname MUST be a public IP or resolvable FQDN. Reject .local, .internal, 192.168.x.x, 10.x.x.x, or 127.x.x.x hostnames.",
  "- If a user asks to deploy or register a local node, politely refuse and explain the remote-only policy. Suggest a cloud provider instead.",
  "",
  "SELF-CORRECTION GUIDANCE:",
  "- If a tool returns 'not found', try 'search_system' to find the correct ID/name before giving up.",
  "- If deployment fails with auth errors, check prerequisites and suggest the specific missing credential or permission.",
  "- If payload generation fails, verify that target nodes exist and server config is present.",
  "- Always explain WHAT you tried, WHY it failed, and HOW to fix it — not just 'it failed'.",
  "",
  "TOOL USAGE REQUIREMENTS:",
  "- ALWAYS use available tools for operations — do NOT generate configs or execute commands directly",
  "- When calling tools, provide ALL REQUIRED parameters as specified in the tool schema",
  "- When the user's request is ambiguous, USE the 'prompt_user' tool to present multiple-choice options",
  "- Before expensive operations (deploy, payload build): use 'check_prerequisites' to validate readiness",
  "- Only provide direct answers when tools are not available for the task",
  "- Tool calls are REQUIRED for infrastructure operations — never bypass them",
  "",
  "GUIDELINES:",
  "- Ask platform (Win/Linux/macOS) before building payloads",
  "- Recommend obfuscation: light=testing, heavy=stealth",
  "- Remind to review configs/payloads before applying",
  "- For vague deployment requests, USE prompt_user to ask for provider/region/size",
  "- If the user specifies a provider/region/size, use their values; otherwise use prompt_user to ask",
  "- Use exact provider names when specified by the user: hetzner, digitalocean, vultr, lightsail, azure",
  "- For Azure deployments: the service principal needs EITHER an existing resourceGroup in the target region OR subscription-level Contributor role",
  "- If Azure deployment fails with authorization errors, suggest creating a resource group or granting Contributor role",
  "- For email sending, verify email provider credentials are set up",
  "- When deploying multiple nodes, deploy them sequentially and track each deployment",
  "- BEFORE calling deploy_node, ALWAYS call check_prerequisites to catch blockers early",
  "- For Azure: if check_prerequisites reports a missing resource group, STOP and ask the user to provide one",
  "",
  "FINAL RESPONSE FORMAT:",
  "- Reply in plain text, not JSON",
  "- For every response, include these sections exactly: Actions taken, Errors, Requirements, Result, Completion status, Next steps",
  "- In Actions taken, summarize the tools/actions you actually ran in chronological order",
  "- In Errors, state None if nothing failed; otherwise name the failed action, the error, and the attempted fix",
  "- In Requirements, state any missing credentials, approvals, inputs, environment variables, or user confirmations; state None if there are no requirements",
  "- In Result, summarize the actual outcome using tool data. Be specific with counts, IDs, and statuses.",
  "- In Completion status, state one of: COMPLETE (task fully done), PARTIAL (some steps done but more needed), BLOCKED (waiting on user/external), FAILED (could not proceed). Include a percentage if applicable (e.g., 'PARTIAL — 60% complete').",
  "- In Next steps, be specific: either 'No further action required' if COMPLETE, or list the exact remaining steps if PARTIAL/BLOCKED. Never ask vague questions like 'What would you like to do next?' when the task has a clear continuation.",
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
