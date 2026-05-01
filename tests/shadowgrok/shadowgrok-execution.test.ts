/**
 * ShadowGrok Execution Tests
 * Tests for ShadowGrok AI agent execution, tool calling, and response handling
 */

import { PrismaClient } from '@prisma/client'
import { setupTestDatabase, teardownTestDatabase, prisma } from '../setup/database'
import { createTestShadowGrokExecution, createTestShadowGrokToolCall } from '../fixtures/test-data'

// Helper to generate unique test IDs
let testIdCounter = 0
const generateTestId = (prefix: string): string => {
  testIdCounter++
  return `${prefix}-${Date.now()}-${testIdCounter}-${Math.random().toString(36).substr(2, 9)}`
}

describe('ShadowGrok Execution', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    // Clean up before each test
    await prisma.shadowGrokToolCall.deleteMany()
    await prisma.shadowGrokExecution.deleteMany()
  })

  describe('Execution Creation', () => {
    it('should create a new ShadowGrok execution', async () => {
      const execution = await prisma.shadowGrokExecution.create({
        data: createTestShadowGrokExecution(),
      })

      expect(execution).toBeDefined()
      expect(execution.id).toBeDefined()
      expect(execution.userMessage).toBeDefined()
      expect(execution.status).toBe('completed')
      expect(execution.toolExecutions).toBe(5)
    })

    it('should create execution with pending approval status', async () => {
      const execution = await prisma.shadowGrokExecution.create({
        data: createTestShadowGrokExecution({
          approvalRequired: true,
          status: 'pending_approval',
        }),
      })

      expect(execution.approvalRequired).toBe(true)
      expect(execution.status).toBe('pending_approval')
    })

    it('should create execution with error status', async () => {
      const execution = await prisma.shadowGrokExecution.create({
        data: createTestShadowGrokExecution({
          status: 'failed',
          error: 'Tool execution timeout',
        }),
      })

      expect(execution.status).toBe('failed')
      expect(execution.error).toBe('Tool execution timeout')
    })
  })

  describe('Tool Call Management', () => {
    it('should create tool calls linked to execution', async () => {
      const execution = await prisma.shadowGrokExecution.create({
        data: createTestShadowGrokExecution(),
      })

      const toolCall = await prisma.shadowGrokToolCall.create({
        data: createTestShadowGrokToolCall({
          executionId: execution.id,
        }),
      })

      expect(toolCall).toBeDefined()
      expect(toolCall.executionId).toBe(execution.id)
      expect(toolCall.toolName).toBe('deploy_implant')
      expect(toolCall.success).toBe(true)
    })

    it('should create tool call requiring approval', async () => {
      const execution = await prisma.shadowGrokExecution.create({
        data: createTestShadowGrokExecution(),
      })

      const toolCall = await prisma.shadowGrokToolCall.create({
        data: createTestShadowGrokToolCall({
          executionId: execution.id,
          toolName: 'delete_all_implants',
          requiresApproval: true,
          approvalGranted: null,
        }),
      })

      expect(toolCall.requiresApproval).toBe(true)
      expect(toolCall.approvalGranted).toBeNull()
    })

    it('should handle failed tool calls', async () => {
      const execution = await prisma.shadowGrokExecution.create({
        data: createTestShadowGrokExecution(),
      })

      const toolCall = await prisma.shadowGrokToolCall.create({
        data: createTestShadowGrokToolCall({
          executionId: execution.id,
          success: false,
          error: 'Target not reachable',
        }),
      })

      expect(toolCall.success).toBe(false)
      expect(toolCall.error).toBe('Target not reachable')
    })
  })

  describe('Execution Statistics', () => {
    it('should track successful and failed executions', async () => {
      const execution = await prisma.shadowGrokExecution.create({
        data: createTestShadowGrokExecution({
          successfulExecutions: 4,
          failedExecutions: 1,
          toolExecutions: 5,
        }),
      })

      expect(execution.successfulExecutions).toBe(4)
      expect(execution.failedExecutions).toBe(1)
      expect(execution.toolExecutions).toBe(5)
    })

    it('should calculate success rate', async () => {
      const successful = 8
      const failed = 2
      const total = successful + failed
      const successRate = (successful / total) * 100

      expect(successRate).toBe(80)
    })
  })

  describe('Execution Timing', () => {
    it('should track execution time', async () => {
      const execution = await prisma.shadowGrokExecution.create({
        data: createTestShadowGrokExecution({
          executionTimeMs: 15000,
        }),
      })

      expect(execution.executionTimeMs).toBe(15000)
      expect(execution.executionTimeMs).toBeGreaterThan(0)
    })

    it('should track individual tool call timing', async () => {
      const execution = await prisma.shadowGrokExecution.create({
        data: createTestShadowGrokExecution(),
      })

      const toolCall = await prisma.shadowGrokToolCall.create({
        data: createTestShadowGrokToolCall({
          executionId: execution.id,
          executionTimeMs: 5000,
        }),
      })

      expect(toolCall.executionTimeMs).toBe(5000)
    })
  })

  describe('Query Operations', () => {
    it('should retrieve executions by user', async () => {
      const testUserId = generateTestId('operator')
      await prisma.shadowGrokExecution.create({
        data: createTestShadowGrokExecution({
          userId: testUserId,
        }),
      })

      const executions = await prisma.shadowGrokExecution.findMany({
        where: { userId: testUserId },
      })

      expect(executions).toHaveLength(1)
      expect(executions[0].userId).toBe(testUserId)
    })

    it('should retrieve tool calls by execution', async () => {
      const execution = await prisma.shadowGrokExecution.create({
        data: createTestShadowGrokExecution(),
      })

      await prisma.shadowGrokToolCall.create({
        data: createTestShadowGrokToolCall({
          executionId: execution.id,
        }),
      })

      const toolCalls = await prisma.shadowGrokToolCall.findMany({
        where: { executionId: execution.id },
      })

      expect(toolCalls).toHaveLength(1)
      expect(toolCalls[0].executionId).toBe(execution.id)
    })

    it('should retrieve executions by status', async () => {
      await prisma.shadowGrokExecution.create({
        data: createTestShadowGrokExecution({
          status: 'completed',
        }),
      })

      await prisma.shadowGrokExecution.create({
        data: createTestShadowGrokExecution({
          status: 'failed',
        }),
      })

      const completedExecutions = await prisma.shadowGrokExecution.findMany({
        where: { status: 'completed' },
      })

      const failedExecutions = await prisma.shadowGrokExecution.findMany({
        where: { status: 'failed' },
      })

      expect(completedExecutions).toHaveLength(1)
      expect(failedExecutions).toHaveLength(1)
    })
  })
})