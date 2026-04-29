import { prisma } from "@/lib/db"
import { ServerConfig } from "@/lib/db/schema"

const CONFIG_ID = "current"

export async function getServerConfig(): Promise<ServerConfig | null> {
  const row = await prisma.hysteriaServerConfig.findUnique({ where: { id: CONFIG_ID } })
  if (!row) return null
  return ServerConfig.parse({
    listen: row.listen,
    tls: row.tls,
    obfs: row.obfs,
    bandwidth: row.bandwidth,
    masquerade: row.masquerade,
    trafficStats: row.trafficStats,
    authBackendUrl: row.authBackendUrl,
    authBackendInsecure: row.authBackendInsecure,
    updatedAt: row.updatedAt.getTime(),
  })
}

export async function setServerConfig(next: ServerConfig): Promise<ServerConfig> {
  const parsed = ServerConfig.parse({ ...next, updatedAt: Date.now() })
  await prisma.hysteriaServerConfig.upsert({
    where: { id: CONFIG_ID },
    create: {
      id: CONFIG_ID,
      listen: parsed.listen,
      tls: parsed.tls as object,
      obfs: (parsed.obfs as object) ?? undefined,
      bandwidth: (parsed.bandwidth as object) ?? undefined,
      masquerade: (parsed.masquerade as object) ?? undefined,
      trafficStats: parsed.trafficStats as object,
      authBackendUrl: parsed.authBackendUrl,
      authBackendInsecure: parsed.authBackendInsecure,
    },
    update: {
      listen: parsed.listen,
      tls: parsed.tls as object,
      obfs: (parsed.obfs as object) ?? undefined,
      bandwidth: (parsed.bandwidth as object) ?? undefined,
      masquerade: (parsed.masquerade as object) ?? undefined,
      trafficStats: parsed.trafficStats as object,
      authBackendUrl: parsed.authBackendUrl,
      authBackendInsecure: parsed.authBackendInsecure,
    },
  })
  return parsed
}

export async function patchServerConfig(
  patch: Partial<ServerConfig>,
): Promise<ServerConfig | null> {
  const existing = await getServerConfig()
  if (!existing) return null
  return setServerConfig({ ...existing, ...patch })
}
