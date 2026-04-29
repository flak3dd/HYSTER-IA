import { prisma } from "@/lib/db"
import { UsageRecord } from "@/lib/db/schema"

export async function recordUsage(records: UsageRecord[]): Promise<number> {
  if (records.length === 0) return 0
  const validated = records.map((r) => UsageRecord.parse(r))
  await prisma.usageRecord.createMany({
    data: validated.map((r) => ({
      userId: r.userId,
      nodeId: r.nodeId,
      tx: r.tx,
      rx: r.rx,
      capturedAt: new Date(r.capturedAt),
    })),
  })
  return records.length
}

export async function listUsageForUser(userId: string, limit = 100): Promise<UsageRecord[]> {
  const rows = await prisma.usageRecord.findMany({
    where: { userId },
    orderBy: { capturedAt: "desc" },
    take: limit,
  })
  return rows.map((r) => ({
    userId: r.userId,
    nodeId: r.nodeId,
    tx: r.tx,
    rx: r.rx,
    capturedAt: r.capturedAt.getTime(),
  }))
}
