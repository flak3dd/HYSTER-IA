import { prisma } from "@/lib/db"
import type { HysteriaNode } from "@prisma/client"
import { Node, NodeCreate, NodeUpdate } from "@/lib/db/schema"

function toNodeZod(row: HysteriaNode): Node {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    region: row.region ?? undefined,
    listenAddr: row.listenAddr,
    status: row.status as Node["status"],
    tags: JSON.parse(row.tags) as string[],
    provider: row.provider ?? undefined,
    profileId: row.profileId ?? null,
    lastHeartbeatAt: row.lastHeartbeatAt ? row.lastHeartbeatAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

export async function listNodes(opts?: { skip?: number; take?: number }): Promise<Node[]> {
  const rows = await prisma.hysteriaNode.findMany({
    orderBy: { createdAt: "desc" },
    skip: opts?.skip,
    take: opts?.take,
  })
  return rows.map(toNodeZod)
}

export async function countNodes(): Promise<number> {
  return prisma.hysteriaNode.count()
}

export async function getNodeById(id: string): Promise<Node | null> {
  const row = await prisma.hysteriaNode.findUnique({ where: { id } })
  return row ? toNodeZod(row) : null
}

export async function createNode(input: NodeCreate): Promise<Node> {
  const parsed = NodeCreate.parse(input)
  const row = await prisma.hysteriaNode.create({
    data: {
      name: parsed.name,
      hostname: parsed.hostname,
      region: parsed.region,
      listenAddr: parsed.listenAddr ?? ":443",
      status: "stopped",
      tags: JSON.stringify(parsed.tags ?? []),
      provider: parsed.provider,
    },
  })
  return toNodeZod(row)
}

export async function updateNode(id: string, patch: NodeUpdate): Promise<Node | null> {
  const parsed = NodeUpdate.parse(patch)
  const existing = await prisma.hysteriaNode.findUnique({ where: { id } })
  if (!existing) return null

  const data: Record<string, unknown> = {}
  if (parsed.name !== undefined) data.name = parsed.name
  if (parsed.hostname !== undefined) data.hostname = parsed.hostname
  if (parsed.region !== undefined) data.region = parsed.region
  if (parsed.listenAddr !== undefined) data.listenAddr = parsed.listenAddr
  if (parsed.status !== undefined) data.status = parsed.status
  if (parsed.tags !== undefined) data.tags = JSON.stringify(parsed.tags)
  if (parsed.provider !== undefined) data.provider = parsed.provider
  if (parsed.profileId !== undefined) data.profileId = parsed.profileId
  if (parsed.lastHeartbeatAt !== undefined) {
    data.lastHeartbeatAt = parsed.lastHeartbeatAt ? new Date(parsed.lastHeartbeatAt) : null
  }

  const row = await prisma.hysteriaNode.update({ where: { id }, data })
  return toNodeZod(row)
}

export async function deleteNode(id: string): Promise<boolean> {
  try {
    await prisma.hysteriaNode.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function updateNodeHeartbeat(id: string): Promise<void> {
  await prisma.hysteriaNode.update({
    where: { id },
    data: { lastHeartbeatAt: new Date() },
  })
}

export async function getNodeStats() {
  const [total, running, stopped, errored] = await Promise.all([
    prisma.hysteriaNode.count(),
    prisma.hysteriaNode.count({ where: { status: "running" } }),
    prisma.hysteriaNode.count({ where: { status: "stopped" } }),
    prisma.hysteriaNode.count({ where: { status: "errored" } }),
  ])
  return { total, running, stopped, errored }
}
