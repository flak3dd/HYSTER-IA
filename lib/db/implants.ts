import { prisma } from "@/lib/db"
import type { Implant, ImplantTask } from "@prisma/client"
import { Implant as ImplantSchema, ImplantCreate, ImplantUpdate, ImplantTask as ImplantTaskSchema, ImplantTaskCreate, ImplantTaskStatus } from "@/lib/db/schema"
import { randomUUID } from "crypto"

function toImplantZod(row: Implant): ImplantSchema {
  return {
    id: row.id,
    implantId: row.implantId,
    name: row.name,
    type: row.type,
    architecture: row.architecture,
    targetId: row.targetId ?? undefined,
    status: row.status as ImplantSchema["status"],
    lastSeen: row.lastSeen ? row.lastSeen.getTime() : null,
    firstSeen: row.firstSeen.getTime(),
    config: row.config as Record<string, unknown>,
    transportConfig: row.transportConfig as Record<string, unknown>,
    nodeId: row.nodeId ?? undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

function toImplantTaskZod(row: ImplantTask): ImplantTaskSchema {
  return {
    id: row.id,
    implantId: row.implantId,
    taskId: row.taskId,
    type: row.type,
    args: row.args as Record<string, unknown>,
    status: row.status as ImplantTaskSchema["status"],
    result: row.result as Record<string, unknown> | null,
    error: row.error ?? undefined,
    createdById: row.createdById ?? undefined,
    createdAt: row.createdAt.getTime(),
    completedAt: row.completedAt ? row.completedAt.getTime() : null,
  }
}

export async function listImplants(opts?: { skip?: number; take?: number }): Promise<ImplantSchema[]> {
  const rows = await prisma.implant.findMany({
    orderBy: { createdAt: "desc" },
    include: { node: true },
    skip: opts?.skip,
    take: opts?.take,
  })
  return rows.map(toImplantZod)
}

export async function countImplants(): Promise<number> {
  return prisma.implant.count()
}

export async function getImplantById(id: string): Promise<ImplantSchema | null> {
  const row = await prisma.implant.findUnique({ 
    where: { id },
    include: { node: true }
  })
  return row ? toImplantZod(row) : null
}

export async function getImplantByImplantId(implantId: string): Promise<ImplantSchema | null> {
  const row = await prisma.implant.findUnique({ 
    where: { implantId },
    include: { node: true }
  })
  return row ? toImplantZod(row) : null
}

export async function createImplant(input: ImplantCreate): Promise<ImplantSchema> {
  const parsed = ImplantCreate.parse(input)
  const implantId = randomUUID()
  const row = await prisma.implant.create({
    data: {
      implantId,
      name: parsed.name,
      type: parsed.type,
      architecture: parsed.architecture,
      targetId: parsed.targetId,
      status: "active",
      config: parsed.config as any,
      transportConfig: parsed.transportConfig as any,
      nodeId: parsed.nodeId,
    },
  })
  return toImplantZod(row)
}

export async function updateImplant(id: string, patch: ImplantUpdate): Promise<ImplantSchema | null> {
  const parsed = ImplantUpdate.parse(patch)
  const existing = await prisma.implant.findUnique({ where: { id } })
  if (!existing) return null

  const data: Record<string, unknown> = {}
  if (parsed.name !== undefined) data.name = parsed.name
  if (parsed.type !== undefined) data.type = parsed.type
  if (parsed.architecture !== undefined) data.architecture = parsed.architecture
  if (parsed.targetId !== undefined) data.targetId = parsed.targetId
  if (parsed.status !== undefined) data.status = parsed.status
  if (parsed.lastSeen !== undefined) {
    data.lastSeen = parsed.lastSeen ? new Date(parsed.lastSeen) : null
  }
  if (parsed.config !== undefined) data.config = parsed.config as any
  if (parsed.transportConfig !== undefined) data.transportConfig = parsed.transportConfig as any
  if (parsed.nodeId !== undefined) data.nodeId = parsed.nodeId

  const row = await prisma.implant.update({ where: { id }, data })
  return toImplantZod(row)
}

export async function updateImplantLastSeen(implantId: string): Promise<void> {
  await prisma.implant.updateMany({
    where: { implantId },
    data: { lastSeen: new Date() },
  })
}

export async function deleteImplant(id: string): Promise<boolean> {
  try {
    await prisma.implant.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function listImplantTasks(implantId: string, status?: ImplantTaskStatus): Promise<ImplantTaskSchema[]> {
  const where: any = { implantId }
  if (status) where.status = status

  const rows = await prisma.implantTask.findMany({ 
    where,
    orderBy: { createdAt: "desc" }
  })
  return rows.map(toImplantTaskZod)
}

export async function createImplantTask(input: ImplantTaskCreate): Promise<ImplantTaskSchema> {
  const parsed = ImplantTaskCreate.parse(input)
  const taskId = randomUUID()
  const row = await prisma.implantTask.create({
    data: {
      implantId: parsed.implantId,
      taskId,
      type: parsed.type,
      args: parsed.args as any,
      status: "pending",
      createdById: parsed.createdById,
    },
  })
  return toImplantTaskZod(row)
}

export async function getPendingTasksForImplant(implantId: string): Promise<ImplantTaskSchema[]> {
  const rows = await prisma.implantTask.findMany({ 
    where: { 
      implantId,
      status: "pending"
    },
    orderBy: { createdAt: "asc" }
  })
  return rows.map(toImplantTaskZod)
}

export async function updateImplantTask(
  id: string, 
  status: ImplantTaskStatus, 
  result?: Record<string, unknown>, 
  error?: string
): Promise<ImplantTaskSchema | null> {
  const data: Record<string, unknown> = { status }
  if (result !== undefined) data.result = result as any
  if (error !== undefined) data.error = error
  if (status === "completed" || status === "failed") {
    data.completedAt = new Date()
  }

  const row = await prisma.implantTask.update({ 
    where: { id },
    data 
  })
  return toImplantTaskZod(row)
}

export async function deleteImplantTask(id: string): Promise<boolean> {
  try {
    await prisma.implantTask.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function getImplantStats() {
  const [total, active, inactive, compromised] = await Promise.all([
    prisma.implant.count(),
    prisma.implant.count({ where: { status: "active" } }),
    prisma.implant.count({ where: { status: "inactive" } }),
    prisma.implant.count({ where: { status: "compromised" } }),
  ])
  return { total, active, inactive, compromised }
}