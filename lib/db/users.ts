import { randomUUID } from "node:crypto"
import {
  ClientUser,
  ClientUserCreate,
  ClientUserUpdate,
  Collections,
} from "@/lib/db/schema"

// In-memory database simulation for demonstration
// In production, this would be replaced with actual database connections
class UserDatabase {
  private users: Map<string, ClientUser> = new Map()

  constructor() {
    this.initializeDefaultUsers()
  }

  private initializeDefaultUsers() {
    const defaultUsers: ClientUser[] = [
      {
        id: "user-001",
        displayName: "Demo User 1",
        authToken: "token-abc123",
        status: "active",
        quotaBytes: 1073741824, // 1GB
        usedBytes: 536870912, // 512MB
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
        createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
        updatedAt: Date.now() - 3600000, // 1 hour ago
        notes: "Primary demo account"
      },
      {
        id: "user-002",
        displayName: "Demo User 2", 
        authToken: "token-def456",
        status: "active",
        quotaBytes: 536870912, // 512MB
        usedBytes: 134217728, // 128MB
        expiresAt: Date.now() + 15 * 24 * 60 * 60 * 1000, // 15 days from now
        createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
        updatedAt: Date.now() - 1800000, // 30 minutes ago
        notes: "Secondary demo account"
      },
      {
        id: "user-003",
        displayName: "Inactive User",
        authToken: "token-ghi789",
        status: "disabled",
        quotaBytes: 214748364, // 256MB
        usedBytes: 0,
        expiresAt: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago (expired)
        createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
        updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
        notes: "Disabled account"
      }
    ]

    defaultUsers.forEach(user => this.users.set(user.id, user))
  }

  async findAll(): Promise<ClientUser[]> {
    return Array.from(this.users.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  async findById(id: string): Promise<ClientUser | null> {
    return this.users.get(id) || null
  }

  async findByAuthToken(authToken: string): Promise<ClientUser | null> {
    for (const user of this.users.values()) {
      if (user.authToken === authToken) {
        return user
      }
    }
    return null
  }

  async create(data: ClientUserCreate): Promise<ClientUser> {
    const id = randomUUID()
    const now = Date.now()
    const user: ClientUser = {
      id,
      displayName: data.displayName,
      authToken: data.authToken,
      status: data.status ?? "active",
      quotaBytes: data.quotaBytes ?? null,
      usedBytes: 0,
      expiresAt: data.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
      notes: data.notes,
    }
    this.users.set(id, user)
    return user
  }

  async update(id: string, data: ClientUserUpdate): Promise<ClientUser | null> {
    const existing = this.users.get(id)
    if (!existing) return null

    const updated: ClientUser = {
      ...existing,
      ...data,
      updatedAt: Date.now(),
    }
    this.users.set(id, updated)
    return updated
  }

  async delete(id: string): Promise<boolean> {
    return this.users.delete(id)
  }

  async incrementUsage(id: string, tx: number, rx: number): Promise<void> {
    const user = this.users.get(id)
    if (user) {
      const delta = Math.max(0, tx) + Math.max(0, rx)
      user.usedBytes += delta
      user.updatedAt = Date.now()
    }
  }

  async getUserStats() {
    const users = await this.findAll()
    const now = Date.now()
    return {
      total: users.length,
      active: users.filter(u => u.status === 'active' && (!u.expiresAt || u.expiresAt > now)).length,
      expired: users.filter(u => u.expiresAt && u.expiresAt <= now).length,
      disabled: users.filter(u => u.status === 'disabled').length,
      totalQuota: users.reduce((sum, u) => sum + (u.quotaBytes || 0), 0),
      totalUsed: users.reduce((sum, u) => sum + u.usedBytes, 0),
    }
  }
}

// Global database instance
const userDb = new UserDatabase()

function now(): number {
  return Date.now()
}

export async function listUsers(): Promise<ClientUser[]> {
  return await userDb.findAll()
}

export async function getUserById(id: string): Promise<ClientUser | null> {
  return await userDb.findById(id)
}

export async function getUserByAuthToken(authToken: string): Promise<ClientUser | null> {
  return await userDb.findByAuthToken(authToken)
}

export async function createUser(input: ClientUserCreate): Promise<ClientUser> {
  return await userDb.create(input)
}

export async function updateUser(
  id: string,
  patch: ClientUserUpdate,
): Promise<ClientUser | null> {
  return await userDb.update(id, patch)
}

export async function deleteUser(id: string): Promise<boolean> {
  return await userDb.delete(id)
}

export async function incrementUsage(id: string, tx: number, rx: number): Promise<void> {
  await userDb.incrementUsage(id, tx, rx)
}

// Additional helper functions for dashboard
export async function getUserStats() {
  return await userDb.getUserStats()
}

export async function getActiveUserCount() {
  const stats = await userDb.getUserStats()
  return stats.active
}
