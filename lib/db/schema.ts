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
