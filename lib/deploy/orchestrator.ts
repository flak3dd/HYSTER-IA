import { randomUUID, randomBytes } from "node:crypto"
import type { Deployment, DeploymentConfig, DeploymentStatus, DeploymentStep } from "./types"
import { resolveProviderAsync } from "./providers"
import { generateSshKeyPair, waitForSsh, sshExec } from "./ssh"
import { buildProvisionScript } from "./provision-script"
import { createNode, updateNode } from "@/lib/db/nodes"
import { getProfileById, resolveProfileConfig } from "@/lib/db/profiles"

type StepListener = (step: DeploymentStep) => void

const activeDeployments = new Map<string, Deployment>()
const listeners = new Map<string, Set<StepListener>>()

function emit(id: string, status: DeploymentStatus, message: string, error?: string) {
  const step: DeploymentStep = {
    status,
    message,
    timestamp: Date.now(),
    error: error ?? null,
  }
  const deployment = activeDeployments.get(id)
  if (deployment) {
    deployment.status = status
    deployment.steps.push(step)
    deployment.updatedAt = Date.now()
  }
  const subs = listeners.get(id)
  if (subs) {
    for (const fn of subs) {
      try { fn(step) } catch { /* ignore */ }
    }
  }
}

export function getDeployment(id: string): Deployment | null {
  return activeDeployments.get(id) ?? null
}

export function listDeployments(): Deployment[] {
  return [...activeDeployments.values()].sort((a, b) => b.createdAt - a.createdAt)
}

export function subscribe(id: string, fn: StepListener): () => void {
  let subs = listeners.get(id)
  if (!subs) {
    subs = new Set()
    listeners.set(id, subs)
  }
  subs.add(fn)
  return () => {
    subs!.delete(fn)
    if (subs!.size === 0) listeners.delete(id)
  }
}

export async function startDeployment(config: DeploymentConfig): Promise<Deployment> {
  const id = randomUUID()
  const deployment: Deployment = {
    id,
    config,
    status: "pending",
    steps: [],
    vpsId: null,
    vpsIp: null,
    nodeId: null,
    sshKeyId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  activeDeployments.set(id, deployment)

  runDeployment(id, config).catch((err) => {
    emit(id, "failed", `Deployment failed: ${err instanceof Error ? err.message : String(err)}`, String(err))
  })

  return deployment
}

async function runDeployment(id: string, config: DeploymentConfig): Promise<void> {
  const provider = await resolveProviderAsync(config.provider)

  // Generate SSH key pair
  emit(id, "creating_vps", "Generating SSH key pair...")
  const keyPair = generateSshKeyPair()

  // Create VPS
  emit(id, "creating_vps", `Creating ${config.provider} server in ${config.region} (${config.size})...`)
  let result
  try {
    result = await provider.createServer({
      name: config.name,
      region: config.region,
      size: config.size,
      sshKeyContent: keyPair.publicKey,
    })
  } catch (err) {
    emit(id, "failed", `VPS creation failed`, err instanceof Error ? err.message : String(err))
    return
  }

  const deployment = activeDeployments.get(id)!
  deployment.vpsId = result.vpsId

  // Wait for IP
  emit(id, "waiting_for_ip", "Waiting for server to get a public IP...")
  let ip: string
  try {
    ip = result.ip ?? (await provider.waitForIp(result.vpsId))
  } catch (err) {
    emit(id, "failed", "Timed out waiting for IP", err instanceof Error ? err.message : String(err))
    return
  }
  deployment.vpsIp = ip
  emit(id, "waiting_for_ip", `Server IP: ${ip}`)

  // Wait for SSH
  emit(id, "provisioning", `Waiting for SSH to become available on ${ip}...`)
  try {
    await waitForSsh({ host: ip, privateKey: keyPair.privateKey, timeoutMs: 180_000 })
  } catch (err) {
    emit(id, "failed", "SSH not reachable", err instanceof Error ? err.message : String(err))
    return
  }
  emit(id, "provisioning", "SSH connection established")

  // Build and run provision script
  const trafficSecret = config.trafficStatsSecret ?? randomBytes(20).toString("hex")

  // Resolve profile config if a profileId is set — profile values act as defaults
  // that can be overridden by explicit DeploymentConfig fields
  let profileObfsPassword = config.obfsPassword
  let profileBandwidthUp = config.bandwidthUp
  let profileBandwidthDown = config.bandwidthDown
  if (config.profileId) {
    try {
      const profile = await getProfileById(config.profileId)
      if (profile) {
        const resolved = resolveProfileConfig(profile)
        if (!profileObfsPassword && resolved.obfs) profileObfsPassword = resolved.obfs.password
        if (!profileBandwidthUp && resolved.bandwidth?.up) profileBandwidthUp = resolved.bandwidth.up
        if (!profileBandwidthDown && resolved.bandwidth?.down) profileBandwidthDown = resolved.bandwidth.down
        emit(id, "provisioning", `Using profile "${profile.name}" config for provisioning`)
      }
    } catch {
      emit(id, "provisioning", "Warning: could not resolve profile config, using defaults")
    }
  }

  const script = buildProvisionScript({
    domain: config.domain,
    ip,
    port: config.port,
    panelUrl: config.panelUrl,
    authBackendSecret: config.authBackendSecret,
    trafficStatsSecret: trafficSecret,
    obfsPassword: profileObfsPassword,
    email: config.email,
    bandwidthUp: profileBandwidthUp,
    bandwidthDown: profileBandwidthDown,
  })

  emit(id, "installing_hysteria", "Running Hysteria 2 installation script...")
  let execResult
  try {
    execResult = await sshExec({
      host: ip,
      privateKey: keyPair.privateKey,
      command: script,
      timeoutMs: 300_000,
    })
  } catch (err) {
    emit(id, "failed", "Provisioning script failed", err instanceof Error ? err.message : String(err))
    return
  }

  if (execResult.code !== 0) {
    emit(id, "failed", `Provisioning script exited with code ${execResult.code}`, execResult.stderr.slice(0, 500))
    return
  }
  emit(id, "installing_hysteria", "Hysteria 2 installed and service started")

  // Test connectivity
  emit(id, "testing_connectivity", `Testing Hysteria 2 connectivity on ${ip}:${config.port}...`)
  try {
    const testResult = await sshExec({
      host: ip,
      privateKey: keyPair.privateKey,
      command: `systemctl is-active hysteria-server && curl -sf http://127.0.0.1:25000/ -H "Authorization: ${trafficSecret}" || echo "traffic-api-check-failed"`,
      timeoutMs: 30_000,
    })
    if (testResult.stdout.includes("active")) {
      emit(id, "testing_connectivity", "Hysteria 2 service is running")
    } else {
      emit(id, "testing_connectivity", "Service status check: " + testResult.stdout.trim().slice(0, 200))
    }
  } catch (err) {
    emit(id, "testing_connectivity", `Connectivity test warning: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Register node in database
  emit(id, "registering_node", "Registering node in database...")
  try {
    const node = await createNode({
      name: config.name,
      hostname: config.domain ?? ip,
      region: config.region,
      listenAddr: `:${config.port}`,
      tags: config.tags,
      provider: config.provider,
    })
    deployment.nodeId = node.id

    await updateNode(node.id, {
      status: "running",
      lastHeartbeatAt: Date.now(),
      profileId: config.profileId ?? null,
    })
    emit(id, "registering_node", `Node registered: ${node.id}`)
  } catch (err) {
    emit(id, "failed", "Failed to register node", err instanceof Error ? err.message : String(err))
    return
  }

  emit(id, "completed", `Deployment complete! Node ${config.name} is live at ${config.domain ?? ip}:${config.port}`)
}

export async function destroyDeployment(id: string): Promise<void> {
  const deployment = activeDeployments.get(id)
  if (!deployment) throw new Error("Deployment not found")
  if (!deployment.vpsId) throw new Error("No VPS to destroy")

  emit(id, "destroying", "Destroying VPS...")
  try {
    const provider = await resolveProviderAsync(deployment.config.provider)
    await provider.destroyServer(deployment.vpsId)
  } catch (err) {
    emit(id, "failed", "Destroy failed", err instanceof Error ? err.message : String(err))
    throw err
  }

  if (deployment.nodeId) {
    try {
      await updateNode(deployment.nodeId, { status: "stopped" })
    } catch { /* best effort */ }
  }

  emit(id, "destroyed", "VPS destroyed successfully")
}
