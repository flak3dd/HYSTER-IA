import { prisma } from "@/lib/db"
import type { Subscription } from "@prisma/client"
import { randomBytes } from "crypto"

export interface SubscriptionCreate {
  userId: string
  name?: string
  tags?: string[]
  formats?: string[]
  expiresAt?: Date
  autoRotate?: boolean
  metadata?: Record<string, unknown>
}

export interface SubscriptionUpdate {
  name?: string
  tags?: string[]
  formats?: string[]
  expiresAt?: Date
  autoRotate?: boolean
  status?: string
  metadata?: Record<string, unknown>
}

export interface SubscriptionStats {
  total: number
  active: number
  expired: number
  revoked: number
  suspended: number
}

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

function toSubscriptionSchema(row: Subscription) {
  return {
    id: row.id,
    userId: row.userId,
    token: row.token,
    name: row.name,
    tags: JSON.parse(row.tags),
    formats: JSON.parse(row.formats),
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
    autoRotate: row.autoRotate,
    lastRotatedAt: row.lastRotatedAt ? row.lastRotatedAt.getTime() : null,
    status: row.status,
    usageStats: row.usageStats as Record<string, unknown>,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

export async function listSubscriptions(opts?: {
  userId?: string
  status?: string
  skip?: number
  take?: number
}) {
  const where: any = {}
  if (opts?.userId) where.userId = opts.userId
  if (opts?.status) where.status = opts.status

  const rows = await prisma.subscription.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: opts?.skip,
    take: opts?.take,
  })
  return rows.map(toSubscriptionSchema)
}

export async function countSubscriptions(opts?: {
  userId?: string
  status?: string
}): Promise<number> {
  const where: any = {}
  if (opts?.userId) where.userId = opts.userId
  if (opts?.status) where.status = opts.status
  return prisma.subscription.count({ where })
}

export async function getSubscriptionById(id: string) {
  const row = await prisma.subscription.findUnique({ where: { id } })
  return row ? toSubscriptionSchema(row) : null
}

export async function getSubscriptionByToken(token: string) {
  const row = await prisma.subscription.findUnique({ where: { token } })
  return row ? toSubscriptionSchema(row) : null
}

export async function createSubscription(input: SubscriptionCreate) {
  const token = generateToken()
  const row = await prisma.subscription.create({
    data: {
      userId: input.userId,
      token,
      name: input.name,
      tags: JSON.stringify(input.tags || []),
      formats: JSON.stringify(input.formats || ['hysteria2', 'clash', 'singbox']),
      expiresAt: input.expiresAt,
      autoRotate: input.autoRotate ?? true,
      metadata: input.metadata as any,
    },
  })
  return toSubscriptionSchema(row)
}

export async function updateSubscription(id: string, patch: SubscriptionUpdate) {
  const existing = await prisma.subscription.findUnique({ where: { id } })
  if (!existing) return null

  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) data.name = patch.name
  if (patch.tags !== undefined) data.tags = JSON.stringify(patch.tags)
  if (patch.formats !== undefined) data.formats = JSON.stringify(patch.formats)
  if (patch.expiresAt !== undefined) data.expiresAt = patch.expiresAt
  if (patch.autoRotate !== undefined) data.autoRotate = patch.autoRotate
  if (patch.status !== undefined) data.status = patch.status
  if (patch.metadata !== undefined) data.metadata = patch.metadata as any

  const row = await prisma.subscription.update({ where: { id }, data })
  return toSubscriptionSchema(row)
}

export async function deleteSubscription(id: string): Promise<boolean> {
  try {
    await prisma.subscription.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function revokeSubscription(id: string, reason?: string): Promise<boolean> {
  try {
    await prisma.subscription.update({
      where: { id },
      data: {
        status: 'revoked',
        metadata: {
          ...(await prisma.subscription.findUnique({ where: { id } }))?.metadata as any,
          revocationReason: reason,
          revokedAt: new Date().toISOString(),
        },
      },
    })
    return true
  } catch {
    return false
  }
}

export async function rotateSubscriptionToken(id: string): Promise<string | null> {
  const newToken = generateToken()
  try {
    await prisma.subscription.update({
      where: { id },
      data: {
        token: newToken,
        lastRotatedAt: new Date(),
      },
    })
    return newToken
  } catch {
    return null
  }
}

export async function updateSubscriptionUsage(
  id: string,
  bytes: number,
  connectionCount?: number
): Promise<boolean> {
  try {
    const current = await prisma.subscription.findUnique({ where: { id } })
    if (!current) return false

    const currentStats = current.usageStats as any
    const newStats = {
      totalBytes: (currentStats.totalBytes || 0) + bytes,
      connectionCount: connectionCount ?? (currentStats.connectionCount || 0) + 1,
      lastUsed: new Date().toISOString(),
    }

    await prisma.subscription.update({
      where: { id },
      data: {
        usageStats: newStats as any,
      },
    })
    return true
  } catch {
    return false
  }
}

export async function getSubscriptionStats(): Promise<SubscriptionStats> {
  const [total, active, expired, revoked, suspended] = await Promise.all([
    prisma.subscription.count(),
    prisma.subscription.count({ where: { status: 'active' } }),
    prisma.subscription.count({ where: { status: 'expired' } }),
    prisma.subscription.count({ where: { status: 'revoked' } }),
    prisma.subscription.count({ where: { status: 'suspended' } }),
  ])
  return { total, active, expired, revoked, suspended }
}

export async function getSubscriptionAnalytics(timeRangeDays: number = 30) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - timeRangeDays)

  const subscriptions = await prisma.subscription.findMany({
    where: {
      createdAt: { gte: startDate },
    },
  })

  const totalBytesTransferred = subscriptions.reduce((sum, sub) => {
    const stats = sub.usageStats as any
    return sum + (stats.totalBytes || 0)
  }, 0)

  const totalConnections = subscriptions.reduce((sum, sub) => {
    const stats = sub.usageStats as any
    return sum + (stats.connectionCount || 0)
  }, 0)

  const expiringSoon = await prisma.subscription.count({
    where: {
      status: 'active',
      expiresAt: {
        lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next 7 days
        gte: new Date(),
      },
    },
  })

  return {
    subscriptionsCreated: subscriptions.length,
    totalBytesTransferred,
    totalConnections,
    expiringSoon,
    averageBytesPerSubscription: subscriptions.length > 0 ? totalBytesTransferred / subscriptions.length : 0,
  }
}

export async function markExpiredSubscriptions(): Promise<number> {
  const result = await prisma.subscription.updateMany({
    where: {
      status: 'active',
      expiresAt: { lte: new Date() },
    },
    data: {
      status: 'expired',
    },
  })
  return result.count
}