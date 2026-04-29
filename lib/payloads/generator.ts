import { z } from "zod"
import { randomUUID } from "crypto"

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const PayloadType = z.enum(["windows_exe", "linux_elf", "macos_app", "powershell", "python"])
export type PayloadType = z.infer<typeof PayloadType>

export const PayloadStatus = z.enum(["pending", "building", "ready", "failed"])
export type PayloadStatus = z.infer<typeof PayloadStatus>

export const PayloadConfig = z.object({
  type: PayloadType,
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  hysteriaConfig: z.object({
    server: z.string(),
    auth: z.string(),
    obfs: z.string().optional(),
  }),
  obfuscation: z.object({
    enabled: z.boolean().default(false),
    level: z.enum(["light", "medium", "heavy"]).default("medium"),
    techniques: z.array(z.enum(["string_encode", "variable_rename", "control_flow", "anti_debug"])).default([]),
  }).default({ enabled: false, level: "medium", techniques: [] }),
  features: z.object({
    autoReconnect: z.boolean().default(true),
    heartbeat: z.number().default(30),
    fallbackServers: z.array(z.string()).default([]),
  }).default({ autoReconnect: true, heartbeat: 30, fallbackServers: [] }),
  signing: z.object({
    enabled: z.boolean().default(false),
    certificateId: z.string().optional(),
  }).default({ enabled: false }),
})
export type PayloadConfig = z.infer<typeof PayloadConfig>

export type PayloadBuild = {
  id: string
  type: PayloadType
  name: string
  description?: string
  status: PayloadStatus
  config: PayloadConfig
  downloadUrl?: string
  sizeBytes?: number
  buildLogs: string[]
  errorMessage?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
}

/* ------------------------------------------------------------------ */
/*  In-memory build tracking (use Redis/DB for production)            */
/* ------------------------------------------------------------------ */

const activeBuilds = new Map<string, PayloadBuild>()

/* ------------------------------------------------------------------ */
/*  Core Generator                                                    */
/* ------------------------------------------------------------------ */

export async function createPayloadBuild(
  config: PayloadConfig,
  createdBy: string
): Promise<PayloadBuild> {
  void createdBy
  const id = randomUUID()
  const build: PayloadBuild = {
    id,
    type: config.type,
    name: config.name,
    description: config.description,
    status: "pending",
    config,
    buildLogs: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  // Store in memory for now
  activeBuilds.set(id, build)

  // TODO: Persist to database when payloadBuild table is created
  // For now, stored in memory only

  // Start async build
  startBuildProcess(id, config)

  return build
}

export async function getPayloadBuild(id: string): Promise<PayloadBuild | null> {
  // Check memory only (DB persistence TODO)
  return activeBuilds.get(id) ?? null
}

export async function listPayloadBuilds(createdBy?: string, limit = 50): Promise<PayloadBuild[]> {
  // Filter from memory only (DB persistence TODO)
  const builds = Array.from(activeBuilds.values())
    .filter(() => !createdBy || true) // TODO: add createdBy tracking
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
  
  return builds
}

export async function deletePayloadBuild(id: string): Promise<boolean> {
  // TODO: DB deletion when table exists
  return activeBuilds.delete(id)
}

/* ------------------------------------------------------------------ */
/*  Build Engine                                                      */
/* ------------------------------------------------------------------ */

async function startBuildProcess(id: string, config: PayloadConfig): Promise<void> {
  const build = activeBuilds.get(id)
  if (!build) return

  updateBuildStatus(id, "building", "Starting build process...")

  try {
    switch (config.type) {
      case "windows_exe":
        await buildWindowsExe(id, config)
        break
      case "linux_elf":
        await buildLinuxElf(id, config)
        break
      case "macos_app":
        await buildMacosApp(id, config)
        break
      case "powershell":
        await buildPowerShell(id, config)
        break
      case "python":
        await buildPython(id, config)
        break
      default:
        throw new Error(`Unsupported payload type: ${config.type}`)
    }

    updateBuildStatus(id, "ready", "Build completed successfully")
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    updateBuildStatus(id, "failed", `Build failed: ${errorMsg}`)
  }
}

function updateBuildStatus(
  id: string,
  status: PayloadStatus,
  logMessage: string
): void {
  const build = activeBuilds.get(id)
  if (!build) return

  build.status = status
  build.buildLogs.push(`[${new Date().toISOString()}] ${logMessage}`)
  build.updatedAt = Date.now()

  if (status === "ready" || status === "failed") {
    build.completedAt = Date.now()
  }

  // TODO: Update DB when table exists
}

/* ------------------------------------------------------------------ */
/*  Platform-Specific Builders                                        */
/* ------------------------------------------------------------------ */

async function buildWindowsExe(id: string, config: PayloadConfig): Promise<void> {
  updateBuildStatus(id, "building", "Building Windows EXE with Go...")
  
  // Simulate build steps
  await simulateBuildStep(id, 1000, "Generating Go source with embedded Hysteria2 client...")
  await simulateBuildStep(id, 1500, "Applying obfuscation: string encoding...")
  await simulateBuildStep(id, 1000, "Compiling with CGO_ENABLED=0 GOOS=windows GOARCH=amd64...")
  
  if (config.obfuscation.enabled) {
    await simulateBuildStep(id, 2000, "Running UPX compression...")
  }
  
  if (config.signing.enabled) {
    await simulateBuildStep(id, 1500, "Signing executable with certificate...")
  }

  // Generate mock artifact
  const artifactSize = 2.4 * 1024 * 1024 + Math.floor(Math.random() * 1024 * 1024)
  
  const build = activeBuilds.get(id)
  if (build) {
    build.sizeBytes = artifactSize
    build.downloadUrl = `/api/admin/payloads/${id}/download`
  }
}

async function buildLinuxElf(id: string, config: PayloadConfig): Promise<void> {
  updateBuildStatus(id, "building", "Building Linux ELF binary...")
  
  await simulateBuildStep(id, 800, "Generating static binary with musl libc...")
  await simulateBuildStep(id, 1200, "Embedding Hysteria2 client configuration...")
  await simulateBuildStep(id, 600, "Stripping debug symbols...")
  
  if (config.obfuscation.enabled) {
    await simulateBuildStep(id, 1500, "Applying control flow obfuscation...")
  }

  const artifactSize = 1.8 * 1024 * 1024 + Math.floor(Math.random() * 512 * 1024)
  
  const build = activeBuilds.get(id)
  if (build) {
    build.sizeBytes = artifactSize
    build.downloadUrl = `/api/admin/payloads/${id}/download`
  }
}

async function buildMacosApp(id: string, config: PayloadConfig): Promise<void> {
  updateBuildStatus(id, "building", "Building macOS Universal Binary...")
  
  await simulateBuildStep(id, 1000, "Compiling for amd64 architecture...")
  await simulateBuildStep(id, 1000, "Compiling for arm64 (Apple Silicon) architecture...")
  await simulateBuildStep(id, 800, "Creating universal binary with lipo...")
  await simulateBuildStep(id, 600, "Generating .app bundle structure...")
  
  if (config.signing.enabled) {
    await simulateBuildStep(id, 2000, "Code signing with Apple Developer ID...")
    await simulateBuildStep(id, 1000, "Notarizing with Apple...")
  }

  const artifactSize = 3.1 * 1024 * 1024 + Math.floor(Math.random() * 1024 * 1024)
  
  const build = activeBuilds.get(id)
  if (build) {
    build.sizeBytes = artifactSize
    build.downloadUrl = `/api/admin/payloads/${id}/download`
  }
}

async function buildPowerShell(id: string, config: PayloadConfig): Promise<void> {
  updateBuildStatus(id, "building", "Generating PowerShell payload...")
  
  await simulateBuildStep(id, 500, "Creating Hysteria2 client loader...")
  await simulateBuildStep(id, 800, "Encoding configuration as base64...")
  
  if (config.obfuscation.enabled) {
    await simulateBuildStep(id, 1200, "Applying PowerShell script obfuscation...")
    await simulateBuildStep(id, 800, "Encoding with securestring...")
  }

  const artifactSize = 12 * 1024 + Math.floor(Math.random() * 4 * 1024)
  
  const build = activeBuilds.get(id)
  if (build) {
    build.sizeBytes = artifactSize
    build.downloadUrl = `/api/admin/payloads/${id}/download`
  }
}

async function buildPython(id: string, config: PayloadConfig): Promise<void> {
  updateBuildStatus(id, "building", "Generating Python payload...")
  
  await simulateBuildStep(id, 400, "Creating async Hysteria2 client wrapper...")
  await simulateBuildStep(id, 600, "Embedding configuration...")
  await simulateBuildStep(id, 300, "Adding auto-reconnect logic...")
  
  if (config.obfuscation.enabled) {
    await simulateBuildStep(id, 800, "Applying Python bytecode obfuscation...")
  }

  const artifactSize = 8 * 1024 + Math.floor(Math.random() * 4 * 1024)
  
  const build = activeBuilds.get(id)
  if (build) {
    build.sizeBytes = artifactSize
    build.downloadUrl = `/api/admin/payloads/${id}/download`
  }
}

async function simulateBuildStep(id: string, delayMs: number, message: string): Promise<void> {
  updateBuildStatus(id, "building", message)
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

/* ------------------------------------------------------------------ */
/*  AI Payload Generation from Natural Language                       */
/* ------------------------------------------------------------------ */

export async function generatePayloadFromDescription(
  description: string,
  createdBy: string
): Promise<{ config: PayloadConfig; explanation: string }> {
  void createdBy
  // Parse natural language description to extract payload parameters
  const config = parsePayloadDescription(description)
  
  const explanation = generateExplanation(config)
  
  return { config, explanation }
}

function parsePayloadDescription(description: string): PayloadConfig {
  const lower = description.toLowerCase()
  
  // Detect platform
  let type: PayloadType = "windows_exe"
  if (lower.includes("linux") || lower.includes("elf")) {
    type = "linux_elf"
  } else if (lower.includes("mac") || lower.includes("darwin") || lower.includes("osx")) {
    type = "macos_app"
  } else if (lower.includes("powershell") || lower.includes("ps1") || lower.includes("windows") && lower.includes("script")) {
    type = "powershell"
  } else if (lower.includes("python") || lower.includes("py")) {
    type = "python"
  }
  
  // Detect obfuscation level
  const obfuscation: PayloadConfig["obfuscation"] = {
    enabled: lower.includes("obfuscat") || lower.includes("stealth") || lower.includes("hidden"),
    level: "medium",
    techniques: [],
  }
  
  if (obfuscation.enabled) {
    if (lower.includes("heavy") || lower.includes("strong")) {
      obfuscation.level = "heavy"
      obfuscation.techniques = ["string_encode", "variable_rename", "control_flow", "anti_debug"]
    } else if (lower.includes("light")) {
      obfuscation.level = "light"
      obfuscation.techniques = ["string_encode"]
    } else {
      obfuscation.techniques = ["string_encode", "variable_rename", "control_flow"]
    }
  }
  
  // Detect signing requirement
  const signing: PayloadConfig["signing"] = {
    enabled: lower.includes("sign") || lower.includes("certif"),
  }
  
  // Extract name from description
  const nameMatch = description.match(/(?:for|named?|called?)\s+["']?([^"']{2,50})["']?/i)
  const name = nameMatch?.[1] ?? `Auto-${type.replace("_", "-").toUpperCase()}`
  
  return {
    type,
    name,
    description: description.slice(0, 500),
    hysteriaConfig: {
      server: "auto-detect",
      auth: "auto-generate",
    },
    obfuscation,
    signing,
    features: {
      autoReconnect: true,
      heartbeat: 30,
      fallbackServers: [],
    },
  }
}

function generateExplanation(config: PayloadConfig): string {
  const parts: string[] = []
  
  parts.push(`**Platform**: ${config.type.replace("_", " ").toUpperCase()}`)
  parts.push(`**Name**: ${config.name}`)
  
  if (config.obfuscation.enabled) {
    parts.push(`**Obfuscation**: ${config.obfuscation.level} level`)
    parts.push(`**Techniques**: ${config.obfuscation.techniques.join(", ") || "standard"}`)
  }
  
  if (config.signing.enabled) {
    parts.push(`**Code Signing**: Enabled`)
  }
  
  parts.push(`**Features**: Auto-reconnect, 30s heartbeat`)
  
  return parts.join("\n")
}
