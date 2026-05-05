import { z } from "zod"

export const ClientUserStatus = z.enum(["active", "disabled", "expired"])
export type ClientUserStatus = z.infer<typeof ClientUserStatus>

export const ClientUser = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(120),
  authToken: z.string().min(8),
  status: ClientUserStatus.default("active"),
  quotaBytes: z.number().int().nonnegative().nullable().default(null),
  usedBytes: z.number().int().nonnegative().default(0),
  expiresAt: z.number().int().nullable().default(null),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  notes: z.string().max(1000).optional(),
})
export type ClientUser = z.infer<typeof ClientUser>

export const ClientUserCreate = ClientUser.pick({
  displayName: true,
  authToken: true,
  status: true,
  quotaBytes: true,
  expiresAt: true,
  notes: true,
}).partial({ status: true, quotaBytes: true, expiresAt: true, notes: true })
export type ClientUserCreate = z.infer<typeof ClientUserCreate>

export const ClientUserUpdate = ClientUserCreate.partial()
export type ClientUserUpdate = z.infer<typeof ClientUserUpdate>

export const NodeStatus = z.enum(["stopped", "starting", "running", "stopping", "errored"])
export type NodeStatus = z.infer<typeof NodeStatus>

export const Node = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  hostname: z.string().min(1),
  region: z.string().max(60).optional(),
  listenAddr: z.string().default(":443"),
  status: NodeStatus.default("stopped"),
  tags: z.array(z.string().max(40)).default([]),
  provider: z.string().max(120).optional(),
  profileId: z.string().nullable().default(null),
  lastHeartbeatAt: z.number().int().nullable().default(null),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type Node = z.infer<typeof Node>

export const NodeCreate = Node.pick({
  name: true,
  hostname: true,
  region: true,
  listenAddr: true,
  tags: true,
  provider: true,
}).partial({ tags: true, provider: true })
export type NodeCreate = z.infer<typeof NodeCreate>

export const NodeUpdate = NodeCreate.partial().extend({
  status: NodeStatus.optional(),
  tags: z.array(z.string().max(40)).optional(),
  profileId: z.string().nullable().optional(),
  lastHeartbeatAt: z.number().int().nullable().optional(),
})
export type NodeUpdate = z.infer<typeof NodeUpdate>

export const TlsConfig = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("manual"),
    certPath: z.string().min(1),
    keyPath: z.string().min(1),
  }),
  z.object({
    mode: z.literal("acme"),
    domains: z.array(z.string().min(3)).min(1),
    email: z.string().email(),
  }),
])
export type TlsConfig = z.infer<typeof TlsConfig>

export const ObfsConfig = z
  .object({
    type: z.literal("salamander"),
    password: z.string().min(8),
  })
  .optional()
export type ObfsConfig = z.infer<typeof ObfsConfig>

export const BandwidthConfig = z
  .object({
    up: z.string().min(1).optional(),
    down: z.string().min(1).optional(),
  })
  .optional()
export type BandwidthConfig = z.infer<typeof BandwidthConfig>

export const MasqueradeConfig = z
  .object({
    type: z.enum(["proxy", "file", "string"]).default("proxy"),
    proxy: z
      .object({
        url: z.string().url(),
        rewriteHost: z.boolean().default(true),
      })
      .optional(),
    file: z.object({ dir: z.string().min(1) }).optional(),
    string: z
      .object({
        content: z.string(),
        headers: z.record(z.string(), z.string()).optional(),
        statusCode: z.number().int().min(100).max(599).default(200),
      })
      .optional(),
  })
  .optional()
export type MasqueradeConfig = z.infer<typeof MasqueradeConfig>

export const TrafficStatsApiConfig = z.object({
  listen: z.string().default(":25000"),
  secret: z.string().min(16),
})
export type TrafficStatsApiConfig = z.infer<typeof TrafficStatsApiConfig>

export const ServerConfig = z.object({
  listen: z.string().default(":443"),
  tls: TlsConfig,
  obfs: ObfsConfig,
  bandwidth: BandwidthConfig,
  masquerade: MasqueradeConfig,
  trafficStats: TrafficStatsApiConfig,
  authBackendUrl: z.string().url(),
  authBackendInsecure: z.boolean().default(false),
  updatedAt: z.number().int(),
})
export type ServerConfig = z.infer<typeof ServerConfig>

export const UsageRecord = z.object({
  userId: z.string().min(1),
  nodeId: z.string().min(1),
  tx: z.number().int().nonnegative(),
  rx: z.number().int().nonnegative(),
  capturedAt: z.number().int(),
})
export type UsageRecord = z.infer<typeof UsageRecord>

export const ImplantStatus = z.enum(["active", "inactive", "compromised", "exited"])
export type ImplantStatus = z.infer<typeof ImplantStatus>

export const Implant = z.object({
  id: z.string().min(1),
  implantId: z.string().min(1),
  name: z.string().min(1).max(120),
  type: z.string().min(1),
  architecture: z.string().min(1),
  targetId: z.string().nullable().optional(),
  status: ImplantStatus.default("active"),
  lastSeen: z.number().int().nullable().optional(),
  firstSeen: z.number().int(),
  config: z.record(z.string(), z.unknown()),
  transportConfig: z.record(z.string(), z.unknown()),
  nodeId: z.string().nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type Implant = z.infer<typeof Implant>

export const ImplantCreate = Implant.pick({
  name: true,
  type: true,
  architecture: true,
  targetId: true,
  config: true,
  transportConfig: true,
  nodeId: true,
}).partial({ targetId: true, nodeId: true })
export type ImplantCreate = z.infer<typeof ImplantCreate>

export const ImplantUpdate = ImplantCreate.partial().extend({
  status: ImplantStatus.optional(),
  lastSeen: z.number().int().nullable().optional(),
})
export type ImplantUpdate = z.infer<typeof ImplantUpdate>

export const ImplantTaskStatus = z.enum(["pending", "running", "completed", "failed"])
export type ImplantTaskStatus = z.infer<typeof ImplantTaskStatus>

export const ImplantTask = z.object({
  id: z.string().min(1),
  implantId: z.string().min(1),
  taskId: z.string().min(1),
  type: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  status: ImplantTaskStatus.default("pending"),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
  createdById: z.string().nullable().optional(),
  createdAt: z.number().int(),
  completedAt: z.number().int().nullable().optional(),
})
export type ImplantTask = z.infer<typeof ImplantTask>

export const ImplantTaskCreate = ImplantTask.pick({
  implantId: true,
  taskId: true,
  type: true,
  args: true,
  createdById: true,
}).partial({ createdById: true })
export type ImplantTaskCreate = z.infer<typeof ImplantTaskCreate>

export const PayloadBuildStatus = z.enum(["pending", "building", "ready", "failed"])
export type PayloadBuildStatus = z.infer<typeof PayloadBuildStatus>

export const PayloadBuild = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  type: z.string().min(1),
  description: z.string().max(500).nullable().optional(),
  status: PayloadBuildStatus.default("pending"),
  config: z.record(z.string(), z.unknown()),
  downloadUrl: z.string().nullable().optional(),
  sizeBytes: z.number().int().nullable().optional(),
  buildLogs: z.array(z.string()),
  errorMessage: z.string().nullable().optional(),
  implantBinaryPath: z.string().nullable().optional(),
  md5Hash: z.string().nullable().optional(),
  sha256Hash: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  completedAt: z.number().int().nullable().optional(),
})
export type PayloadBuild = z.infer<typeof PayloadBuild>

export const PayloadBuildCreate = PayloadBuild.pick({
  name: true,
  type: true,
  description: true,
  config: true,
  createdBy: true,
}).partial({ description: true, createdBy: true })
export type PayloadBuildCreate = z.infer<typeof PayloadBuildCreate>

export const PayloadBuildUpdate = PayloadBuildCreate.partial().extend({
  status: PayloadBuildStatus.optional(),
  downloadUrl: z.string().nullable().optional(),
  sizeBytes: z.number().int().nullable().optional(),
  buildLogs: z.array(z.string()).optional(),
  errorMessage: z.string().nullable().optional(),
  implantBinaryPath: z.string().nullable().optional(),
  md5Hash: z.string().nullable().optional(),
  sha256Hash: z.string().nullable().optional(),
  completedAt: z.number().int().nullable().optional(),
})
export type PayloadBuildUpdate = z.infer<typeof PayloadBuildUpdate>

// Beacon / Compromised Host Schemas
export const BeaconStatus = z.enum(["online", "idle", "stale", "offline"])
export type BeaconStatus = z.infer<typeof BeaconStatus>

export const PrivilegeLevel = z.enum(["user", "admin", "system", "root"])
export type PrivilegeLevel = z.infer<typeof PrivilegeLevel>

export const Beacon = z.object({
  id: z.string().min(1),
  implantId: z.string().min(1),
  hostname: z.string().min(1),
  ipAddress: z.string().min(1),
  os: z.string().min(1),
  osVersion: z.string().optional(),
  domain: z.string().optional(),
  user: z.string().min(1),
  privileges: PrivilegeLevel,
  lastCheckin: z.number().int(),
  status: BeaconStatus,
  implantType: z.string().min(1),
  egressNode: z.string().optional(),
  runningTasks: z.number().int().default(0),
  firstSeen: z.number().int(),
  nodeId: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type Beacon = z.infer<typeof Beacon>

export const BeaconCreate = Beacon.pick({
  implantId: true,
  hostname: true,
  ipAddress: true,
  os: true,
  osVersion: true,
  domain: true,
  user: true,
  privileges: true,
  status: true,
  implantType: true,
  egressNode: true,
  nodeId: true,
}).partial({ status: true, egressNode: true, nodeId: true })
export type BeaconCreate = z.infer<typeof BeaconCreate>

export const BeaconUpdate = BeaconCreate.partial()
export type BeaconUpdate = z.infer<typeof BeaconUpdate>

// Credential Schemas
export const CredentialType = z.enum([
  "NTLM",
  "Kerberos",
  "Plaintext",
  "Hash",
  "Ticket",
  "SSH",
  "API Key",
])
export type CredentialType = z.infer<typeof CredentialType>

export const Credential = z.object({
  id: z.string().min(1),
  type: CredentialType,
  username: z.string().min(1),
  domain: z.string().optional(),
  hash: z.string().optional(),
  plaintext: z.string().optional(),
  ticketData: z.string().optional(),
  sourceHostId: z.string().optional(),
  sourceHostname: z.string().optional(),
  cracked: z.boolean().default(false),
  notes: z.string().optional(),
  createdAt: z.number().int(),
})
export type Credential = z.infer<typeof Credential>

export const CredentialCreate = Credential.pick({
  type: true,
  username: true,
  domain: true,
  hash: true,
  plaintext: true,
  ticketData: true,
  sourceHostId: true,
  notes: true,
}).partial()
export type CredentialCreate = z.infer<typeof CredentialCreate>

// Lateral Movement Schemas
export const MovementTechnique = z.enum([
  "smb",
  "winrm",
  "wmi",
  "dcom",
  "pth",
  "kerberoast",
  "as-rep-roast",
  "ssh",
  "rdp",
])
export type MovementTechnique = z.infer<typeof MovementTechnique>

export const MovementStatus = z.enum([
  "pending",
  "executing",
  "success",
  "failed",
  "blocked",
])
export type MovementStatus = z.infer<typeof MovementStatus>

export const LateralMovement = z.object({
  id: z.string().min(1),
  fromHostId: z.string().min(1),
  toHostId: z.string().min(1),
  fromHostname: z.string(),
  toHostname: z.string(),
  technique: MovementTechnique,
  status: MovementStatus,
  credentialId: z.string().optional(),
  timestamp: z.number().int(),
  errorMessage: z.string().optional(),
  workflowSessionId: z.string().optional(),
})
export type LateralMovement = z.infer<typeof LateralMovement>

export const LateralMovementCreate = z.object({
  fromHostId: z.string().min(1),
  toHostId: z.string().min(1),
  technique: MovementTechnique,
  credentialId: z.string().optional(),
  workflowSessionId: z.string().optional(),
})
export type LateralMovementCreate = z.infer<typeof LateralMovementCreate>
