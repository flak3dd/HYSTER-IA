import { z } from "zod"

export const Collections = {
  users: "users",
  nodes: "nodes",
  serverConfig: "serverConfig",
  usageRecords: "usageRecords",
  adminClaims: "adminClaims",
} as const

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
