import { z } from "zod"

export const VpsProvider = z.enum(["hetzner", "digitalocean", "vultr", "lightsail", "azure"])
export type VpsProvider = z.infer<typeof VpsProvider>

export const DeploymentStatus = z.enum([
  "pending",
  "creating_vps",
  "waiting_for_ip",
  "provisioning",
  "installing_hysteria",
  "configuring_tls",
  "starting_service",
  "testing_connectivity",
  "registering_node",
  "completed",
  "failed",
  "destroying",
  "destroyed",
])
export type DeploymentStatus = z.infer<typeof DeploymentStatus>

export const DeploymentStep = z.object({
  status: DeploymentStatus,
  message: z.string(),
  timestamp: z.number().int(),
  error: z.string().nullable().default(null),
})
export type DeploymentStep = z.infer<typeof DeploymentStep>

export const DeploymentConfig = z.object({
  provider: VpsProvider,
  region: z.string().min(1),
  size: z.string().min(1),
  name: z.string().min(1).max(120),
  domain: z.string().min(1).optional(),
  port: z.coerce.number().int().min(1).max(65535).default(443),
  obfsPassword: z.string().min(8).optional(),
  email: z.string().email().optional(),
  tags: z.array(z.string().max(40)).default([]),
  panelUrl: z.string().url(),
  authBackendSecret: z.string().min(16).optional(),
  trafficStatsSecret: z.string().min(16).optional(),
  bandwidthUp: z.string().optional(),
  bandwidthDown: z.string().optional(),
  profileId: z.string().optional(),
})
export type DeploymentConfig = z.infer<typeof DeploymentConfig>

export const Deployment = z.object({
  id: z.string().min(1),
  config: DeploymentConfig,
  status: DeploymentStatus,
  steps: z.array(DeploymentStep),
  vpsId: z.string().nullable().default(null),
  vpsIp: z.string().nullable().default(null),
  nodeId: z.string().nullable().default(null),
  sshKeyId: z.string().nullable().default(null),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type Deployment = z.infer<typeof Deployment>

export type VpsCreateResult = {
  vpsId: string
  ip: string | null
}

export type ProviderPreset = {
  id: string
  label: string
  regions: { id: string; label: string }[]
  sizes: { id: string; label: string; cpu: number; ram: string; disk: string; price: string }[]
}

export interface VpsProviderClient {
  readonly name: VpsProvider
  presets(): ProviderPreset
  createServer(opts: {
    name: string
    region: string
    size: string
    sshKeyContent: string
  }): Promise<VpsCreateResult>
  waitForIp(vpsId: string, timeoutMs?: number): Promise<string>
  destroyServer(vpsId: string): Promise<void>
}
