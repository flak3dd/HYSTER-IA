import { prisma } from "@/lib/db"
import type { PivotPath } from "@prisma/client"
import { LateralMovement, LateralMovementCreate, MovementStatus } from "@/lib/db/schema"

function toLateralMovementZod(row: PivotPath & {
  fromHost?: { hostname: string } | null
  toHost?: { hostname: string } | null
}): LateralMovement {
  return {
    id: row.id,
    fromHostId: row.fromHostId,
    toHostId: row.toHostId,
    fromHostname: row.fromHost?.hostname ?? "Unknown",
    toHostname: row.toHost?.hostname ?? "Unknown",
    technique: row.technique as LateralMovement["technique"],
    status: (row.success ? "success" : "failed") as MovementStatus,
    credentialId: undefined,
    timestamp: row.timestamp.getTime(),
    errorMessage: row.success ? undefined : "Movement failed",
    workflowSessionId: undefined,
  }
}

export async function listLateralMovements(opts?: {
  skip?: number
  take?: number
  fromHostId?: string
  toHostId?: string
  technique?: LateralMovement["technique"]
  status?: MovementStatus
}): Promise<LateralMovement[]> {
  const where: any = {}
  
  if (opts?.fromHostId) {
    where.fromHostId = opts.fromHostId
  }
  
  if (opts?.toHostId) {
    where.toHostId = opts.toHostId
  }
  
  if (opts?.technique) {
    where.technique = opts.technique
  }
  
  if (opts?.status) {
    where.success = opts.status === "success"
  }
  
  const rows = await prisma.pivotPath.findMany({
    where,
    include: {
      fromHost: {
        select: { hostname: true },
      },
      toHost: {
        select: { hostname: true },
      },
    },
    orderBy: { timestamp: "desc" },
    skip: opts?.skip,
    take: opts?.take,
  })
  return rows.map(toLateralMovementZod)
}

export async function countLateralMovements(opts?: {
  fromHostId?: string
  toHostId?: string
  technique?: LateralMovement["technique"]
  status?: MovementStatus
}): Promise<number> {
  const where: any = {}
  
  if (opts?.fromHostId) {
    where.fromHostId = opts.fromHostId
  }
  
  if (opts?.toHostId) {
    where.toHostId = opts.toHostId
  }
  
  if (opts?.technique) {
    where.technique = opts.technique
  }
  
  if (opts?.status) {
    where.success = opts.status === "success"
  }
  
  return prisma.pivotPath.count({ where })
}

export async function getLateralMovementById(id: string): Promise<LateralMovement | null> {
  const row = await prisma.pivotPath.findUnique({
    where: { id },
    include: {
      fromHost: {
        select: { hostname: true },
      },
      toHost: {
        select: { hostname: true },
      },
    },
  })
  return row ? toLateralMovementZod(row) : null
}

export async function createLateralMovement(input: LateralMovementCreate): Promise<LateralMovement> {
  const parsed = LateralMovementCreate.parse(input)
  const row = await prisma.pivotPath.create({
    data: {
      fromHostId: parsed.fromHostId,
      toHostId: parsed.toHostId,
      technique: parsed.technique,
      success: false,
      timestamp: new Date(),
    },
    include: {
      fromHost: {
        select: { hostname: true },
      },
      toHost: {
        select: { hostname: true },
      },
    },
  })
  return toLateralMovementZod(row)
}

export async function updateLateralMovementStatus(
  id: string,
  status: MovementStatus,
  errorMessage?: string
): Promise<LateralMovement | null> {
  const row = await prisma.pivotPath.update({
    where: { id },
    data: {
      success: status === "success",
    },
    include: {
      fromHost: {
        select: { hostname: true },
      },
      toHost: {
        select: { hostname: true },
      },
    },
  }).catch(() => null)
  return row ? toLateralMovementZod(row) : null
}

export async function getMovementsByHost(hostId: string): Promise<LateralMovement[]> {
  const rows = await prisma.pivotPath.findMany({
    where: {
      OR: [
        { fromHostId: hostId },
        { toHostId: hostId },
      ],
    },
    include: {
      fromHost: {
        select: { hostname: true },
      },
      toHost: {
        select: { hostname: true },
      },
    },
    orderBy: { timestamp: "desc" },
  })
  return rows.map(toLateralMovementZod)
}

export async function getLateralMovementStats(): Promise<{
  total: number
  success: number
  failed: number
  byTechnique: Record<string, number>
}> {
  const [total, movements] = await Promise.all([
    prisma.pivotPath.count(),
    prisma.pivotPath.findMany(),
  ])
  
  let success = 0
  const byTechnique: Record<string, number> = {}
  
  for (const movement of movements) {
    if (movement.success) success++
    byTechnique[movement.technique] = (byTechnique[movement.technique] || 0) + 1
  }
  
  return {
    total,
    success,
    failed: total - success,
    byTechnique,
  }
}