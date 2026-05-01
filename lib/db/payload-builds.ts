import { prisma } from "@/lib/db"
import type { PayloadBuild as PayloadBuildModel } from "@prisma/client"
import { PayloadBuild as PayloadBuildSchema, PayloadBuildCreate, PayloadBuildUpdate, PayloadBuildStatus } from "@/lib/db/schema"

function toPayloadBuildZod(row: PayloadBuildModel): PayloadBuildSchema {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description ?? undefined,
    status: row.status as PayloadBuildSchema["status"],
    config: row.config as Record<string, unknown>,
    downloadUrl: row.downloadUrl ?? undefined,
    sizeBytes: row.sizeBytes ? Number(row.sizeBytes) : null,
    buildLogs: row.buildLogs as string[],
    errorMessage: row.errorMessage ?? undefined,
    implantBinaryPath: row.implantBinaryPath ?? undefined,
    md5Hash: row.md5Hash ?? undefined,
    sha256Hash: row.sha256Hash ?? undefined,
    createdBy: row.createdBy ?? undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    completedAt: row.completedAt ? row.completedAt.getTime() : null,
  }
}

export async function listPayloadBuilds(
  createdBy?: string,
  limit = 50,
  opts?: { skip?: number; take?: number },
): Promise<PayloadBuildSchema[]> {
  const where: any = {}
  if (createdBy) where.createdBy = createdBy

  const rows = await prisma.payloadBuild.findMany({
    where,
    orderBy: { createdAt: "desc" },
    // opts.take overrides the legacy limit param when pagination is in use
    take: opts?.take ?? limit,
    skip: opts?.skip,
  })
  return rows.map(toPayloadBuildZod)
}

export async function countPayloadBuilds(createdBy?: string): Promise<number> {
  const where: any = {}
  if (createdBy) where.createdBy = createdBy
  return prisma.payloadBuild.count({ where })
}

export async function getPayloadBuildById(id: string): Promise<PayloadBuildSchema | null> {
  const row = await prisma.payloadBuild.findUnique({ where: { id } })
  return row ? toPayloadBuildZod(row) : null
}

export async function createPayloadBuild(input: PayloadBuildCreate): Promise<PayloadBuildSchema> {
  const parsed = PayloadBuildCreate.parse(input)
  const row = await prisma.payloadBuild.create({
    data: {
      name: parsed.name,
      type: parsed.type,
      description: parsed.description,
      status: "pending",
      config: parsed.config as any,
      buildLogs: [],
      createdBy: parsed.createdBy,
    },
  })
  return toPayloadBuildZod(row)
}

export async function updatePayloadBuild(id: string, patch: PayloadBuildUpdate): Promise<PayloadBuildSchema | null> {
  const parsed = PayloadBuildUpdate.parse(patch)
  const existing = await prisma.payloadBuild.findUnique({ where: { id } })
  if (!existing) return null

  const data: Record<string, unknown> = {}
  if (parsed.name !== undefined) data.name = parsed.name
  if (parsed.type !== undefined) data.type = parsed.type
  if (parsed.description !== undefined) data.description = parsed.description
  if (parsed.status !== undefined) data.status = parsed.status
  if (parsed.downloadUrl !== undefined) data.downloadUrl = parsed.downloadUrl
  if (parsed.sizeBytes !== undefined && parsed.sizeBytes !== null) data.sizeBytes = BigInt(parsed.sizeBytes)
  if (parsed.buildLogs !== undefined) data.buildLogs = parsed.buildLogs
  if (parsed.errorMessage !== undefined) data.errorMessage = parsed.errorMessage
  if (parsed.implantBinaryPath !== undefined) data.implantBinaryPath = parsed.implantBinaryPath
  if (parsed.md5Hash !== undefined) data.md5Hash = parsed.md5Hash
  if (parsed.sha256Hash !== undefined) data.sha256Hash = parsed.sha256Hash
  if (parsed.completedAt !== undefined) {
    data.completedAt = parsed.completedAt ? new Date(parsed.completedAt) : null
  }

  const row = await prisma.payloadBuild.update({ where: { id }, data })
  return toPayloadBuildZod(row)
}

export async function updatePayloadBuildStatus(
  id: string, 
  status: PayloadBuildStatus, 
  logMessage?: string
): Promise<PayloadBuildSchema | null> {
  const existing = await prisma.payloadBuild.findUnique({ where: { id } })
  if (!existing) return null

  const buildLogs = (existing.buildLogs as string[]) || []
  if (logMessage) {
    buildLogs.push(`[${new Date().toISOString()}] ${logMessage}`)
  }

  const data: Record<string, unknown> = { 
    status,
    buildLogs
  }

  if (status === "ready" || status === "failed") {
    data.completedAt = new Date()
  }

  const row = await prisma.payloadBuild.update({ where: { id }, data })
  return toPayloadBuildZod(row)
}

export async function deletePayloadBuild(id: string): Promise<boolean> {
  try {
    await prisma.payloadBuild.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function getPayloadBuildStats() {
  const [total, pending, building, ready, failed] = await Promise.all([
    prisma.payloadBuild.count(),
    prisma.payloadBuild.count({ where: { status: "pending" } }),
    prisma.payloadBuild.count({ where: { status: "building" } }),
    prisma.payloadBuild.count({ where: { status: "ready" } }),
    prisma.payloadBuild.count({ where: { status: "failed" } }),
  ])
  return { total, pending, building, ready, failed }
}