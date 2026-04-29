import { prisma } from "@/lib/db"
import type { ClientUser as PrismaClientUser } from "@prisma/client"
import { ClientUser, ClientUserCreate, ClientUserUpdate } from "@/lib/db/schema"

function toClientUserZod(row: PrismaClientUser): ClientUser {
  return {
    id: row.id,
    displayName: row.displayName,
    authToken: row.authToken,
    status: row.status as ClientUser["status"],
    quotaBytes: row.quotaBytes ? Number(row.quotaBytes) : null,
    usedBytes: Number(row.usedBytes),
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    notes: row.notes ?? undefined,
  }
}

export async function listUsers(): Promise<ClientUser[]> {
  const rows = await prisma.clientUser.findMany({ orderBy: { createdAt: "desc" } })
  return rows.map(toClientUserZod)
}

export async function getUserById(id: string): Promise<ClientUser | null> {
  const row = await prisma.clientUser.findUnique({ where: { id } })
  return row ? toClientUserZod(row) : null
}

export async function getUserByAuthToken(authToken: string): Promise<ClientUser | null> {
  const row = await prisma.clientUser.findUnique({ where: { authToken } })
  return row ? toClientUserZod(row) : null
}

export async function createUser(input: ClientUserCreate): Promise<ClientUser> {
  const parsed = ClientUserCreate.parse(input)
  const row = await prisma.clientUser.create({
    data: {
      displayName: parsed.displayName,
      authToken: parsed.authToken,
      status: parsed.status ?? "active",
      quotaBytes: parsed.quotaBytes ?? null,
      usedBytes: 0,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
      notes: parsed.notes,
    },
  })
  return toClientUserZod(row)
}

export async function updateUser(
  id: string,
  patch: ClientUserUpdate,
): Promise<ClientUser | null> {
  const existing = await prisma.clientUser.findUnique({ where: { id } })
  if (!existing) return null

  const parsed = ClientUserUpdate.parse(patch)
  const data: Record<string, unknown> = {}
  if (parsed.displayName !== undefined) data.displayName = parsed.displayName
  if (parsed.authToken !== undefined) data.authToken = parsed.authToken
  if (parsed.status !== undefined) data.status = parsed.status
  if (parsed.quotaBytes !== undefined) data.quotaBytes = parsed.quotaBytes
  if (parsed.expiresAt !== undefined) {
    data.expiresAt = parsed.expiresAt ? new Date(parsed.expiresAt) : null
  }
  if (parsed.notes !== undefined) data.notes = parsed.notes

  const row = await prisma.clientUser.update({ where: { id }, data })
  return toClientUserZod(row)
}

export async function deleteUser(id: string): Promise<boolean> {
  try {
    await prisma.clientUser.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function incrementUsage(id: string, tx: number, rx: number): Promise<void> {
  const delta = Math.max(0, tx) + Math.max(0, rx)
  await prisma.clientUser.update({
    where: { id },
    data: { usedBytes: { increment: delta } },
  })
}

export async function getUserStats() {
  const users = await prisma.clientUser.findMany()
  const now = Date.now()
  return {
    total: users.length,
    active: users.filter(
      (u) => u.status === "active" && (!u.expiresAt || u.expiresAt.getTime() > now),
    ).length,
    expired: users.filter((u) => u.expiresAt && u.expiresAt.getTime() <= now).length,
    disabled: users.filter((u) => u.status === "disabled").length,
    totalQuota: users.reduce((sum, u) => sum + Number(u.quotaBytes ?? 0), 0),
    totalUsed: users.reduce((sum, u) => sum + Number(u.usedBytes), 0),
  }
}

export async function getActiveUserCount() {
  const stats = await getUserStats()
  return stats.active
}
