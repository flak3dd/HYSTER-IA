/**
 * Database mock utilities for testing without a real database
 * Use this when a database is not available or for faster unit tests
 */

import { PrismaClient } from '@prisma/client'

// Mock Prisma client
const mockPrisma = {
  operator: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  operation: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  implant: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  hysteriaNode: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  shadowGrokExecution: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  shadowGrokToolCall: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  shadowGrokApproval: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  agentTask: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  agentStep: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  implantTask: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  payload: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  payloadBuild: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  objective: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  executiveReport: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  technicalReport: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  intelligence: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  profile: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $disconnect: jest.fn(),
}

// Helper to set up mock returns
export function setupMockCreate(model: string, returnData: any) {
  (mockPrisma[model as keyof typeof mockPrisma] as any).create.mockResolvedValue(returnData)
}

export function setupMockFindMany(model: string, returnData: any[]) {
  (mockPrisma[model as keyof typeof mockPrisma] as any).findMany.mockResolvedValue(returnData)
}

export function setupMockFindUnique(model: string, returnData: any) {
  (mockPrisma[model as keyof typeof mockPrisma] as any).findUnique.mockResolvedValue(returnData)
}

export function setupMockUpdate(model: string, returnData: any) {
  (mockPrisma[model as keyof typeof mockPrisma] as any).update.mockResolvedValue(returnData)
}

export function setupMockDelete(model: string, returnData: any) {
  (mockPrisma[model as keyof typeof mockPrisma] as any).delete.mockResolvedValue(returnData)
}

// Clear all mocks
export function clearAllMocks() {
  Object.values(mockPrisma).forEach(model => {
    if (typeof model === 'object' && model !== null) {
      Object.values(model).forEach((method: any) => {
        if (typeof method === 'function' && method.mockClear) {
          method.mockClear()
        }
      })
    }
  })
}

// Mock setup functions that mirror the real database functions
export async function cleanDatabase() {
  // No-op for mock
  clearAllMocks()
}

export async function seedTestData() {
  // Return mock data
  return {
    operator: { id: 'mock-operator-1', username: 'test_operator' },
    operation: { id: 'mock-operation-1', name: 'Test Operation' },
    node: { id: 'mock-node-1', name: 'Test Node' },
    implant: { id: 'mock-implant-1', implantId: 'implant-001' },
    conversation: { id: 'mock-conv-1', title: 'Test Conversation' },
  }
}

export async function setupTestDatabase() {
  clearAllMocks()
  return await seedTestData()
}

export async function teardownTestDatabase() {
  clearAllMocks()
  // Mock disconnect
  await mockPrisma.$disconnect()
}

export { mockPrisma as prisma }