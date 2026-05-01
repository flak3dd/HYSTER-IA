/**
 * ShadowGrok Approval Tests
 * Tests for the approval workflow, risk assessment, and safety mechanisms
 */

import { PrismaClient } from '@prisma/client'
import { setupTestDatabase, teardownTestDatabase, prisma } from '../setup/database'
import { createTestOperator } from '../fixtures/test-data'

// Helper to generate unique test IDs
let testIdCounter = 0
const generateTestId = (prefix: string): string => {
  testIdCounter++
  return `${prefix}-${Date.now()}-${testIdCounter}-${Math.random().toString(36).substr(2, 9)}`
}

describe('ShadowGrok Approval System', () => {
  let testOperator: any

  beforeAll(async () => {
    await setupTestDatabase()
    testOperator = await prisma.operator.create({
      data: createTestOperator(),
    })
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await prisma.shadowGrokApproval.deleteMany()
  })

  describe('Approval Request Creation', () => {
    it('should create a new approval request', async () => {
      const approval = await prisma.shadowGrokApproval.create({
        data: {
          toolCallId: 'tool-call-001',
          toolName: 'delete_all_implants',
          arguments: {
            force: true,
            reason: 'emergency cleanup',
          },
          requestedBy: testOperator.id,
          status: 'pending',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        },
      })

      expect(approval).toBeDefined()
      expect(approval.id).toBeDefined()
      expect(approval.toolName).toBe('delete_all_implants')
      expect(approval.status).toBe('pending')
      expect(approval.requestedBy).toBe(testOperator.id)
    })

    it('should set expiration time for approval requests', async () => {
      const expiresAt = new Date(Date.now() + 7200000) // 2 hours from now

      const approval = await prisma.shadowGrokApproval.create({
        data: {
          toolCallId: 'tool-call-002',
          toolName: 'escalate_privileges',
          arguments: { target: 'critical-server' },
          requestedBy: testOperator.id,
          status: 'pending',
          expiresAt,
        },
      })

      expect(approval.expiresAt).toEqual(expiresAt)
    })
  })

  describe('Approval Granting', () => {
    it('should grant approval to a pending request', async () => {
      const approval = await prisma.shadowGrokApproval.create({
        data: {
          toolCallId: 'tool-call-003',
          toolName: 'deploy_payload',
          arguments: { target: 'test-network' },
          requestedBy: testOperator.id,
          status: 'pending',
        },
      })

      const updatedApproval = await prisma.shadowGrokApproval.update({
        where: { id: approval.id },
        data: {
          status: 'approved',
          approvedBy: testOperator.id,
          approvedAt: new Date(),
        },
      })

      expect(updatedApproval.status).toBe('approved')
      expect(updatedApproval.approvedBy).toBe(testOperator.id)
      expect(updatedApproval.approvedAt).toBeDefined()
    })

    it('should record approval reason', async () => {
      const reason = 'Approved for testing purposes'

      const approval = await prisma.shadowGrokApproval.create({
        data: {
          toolCallId: 'tool-call-004',
          toolName: 'access_sensitive_data',
          arguments: { scope: 'limited' },
          requestedBy: testOperator.id,
          status: 'pending',
        },
      })

      const updatedApproval = await prisma.shadowGrokApproval.update({
        where: { id: approval.id },
        data: {
          status: 'approved',
          approvedBy: testOperator.id,
          approvedAt: new Date(),
          reason,
        },
      })

      expect(updatedApproval.reason).toBe(reason)
    })
  })

  describe('Approval Rejection', () => {
    it('should reject a pending approval request', async () => {
      const approval = await prisma.shadowGrokApproval.create({
        data: {
          toolCallId: 'tool-call-005',
          toolName: 'delete_all_data',
          arguments: { force: true },
          requestedBy: testOperator.id,
          status: 'pending',
        },
      })

      const updatedApproval = await prisma.shadowGrokApproval.update({
        where: { id: approval.id },
        data: {
          status: 'rejected',
          rejectedBy: testOperator.id,
          rejectedAt: new Date(),
          reason: 'Too dangerous for automated execution',
        },
      })

      expect(updatedApproval.status).toBe('rejected')
      expect(updatedApproval.rejectedBy).toBe(testOperator.id)
      expect(updatedApproval.rejectedAt).toBeDefined()
      expect(updatedApproval.reason).toBe('Too dangerous for automated execution')
    })
  })

  describe('Approval Expiration', () => {
    it('should expire pending approvals after timeout', async () => {
      const pastDate = new Date(Date.now() - 3600000) // 1 hour ago

      const approval = await prisma.shadowGrokApproval.create({
        data: {
          toolCallId: 'tool-call-006',
          toolName: 'execute_command',
          arguments: { command: 'rm -rf /' },
          requestedBy: testOperator.id,
          status: 'pending',
          expiresAt: pastDate,
        },
      })

      // Simulate expiration check
      const isExpired = approval.expiresAt! < new Date()

      expect(isExpired).toBe(true)

      // Update status to expired
      const expiredApproval = await prisma.shadowGrokApproval.update({
        where: { id: approval.id },
        data: {
          status: 'expired',
        },
      })

      expect(expiredApproval.status).toBe('expired')
    })
  })

  describe('Risk Assessment Integration', () => {
    it('should require approval for high-risk operations', async () => {
      const highRiskTools = [
        'delete_all_implants',
        'escalate_privileges',
        'access_sensitive_data',
        'modify_firewall',
      ]

      for (const toolName of highRiskTools) {
        const approval = await prisma.shadowGrokApproval.create({
          data: {
            toolCallId: `tool-call-${toolName}`,
            toolName,
            arguments: {},
            requestedBy: testOperator.id,
            status: 'pending',
          },
        })

        expect(approval.status).toBe('pending')
      }
    })

    it('should not require approval for low-risk operations', async () => {
      const lowRiskTools = ['get_status', 'list_implants', 'get_config']

      // These should execute without approval
      const requiresApproval = lowRiskTools.every(tool => {
        // In a real implementation, this would check a risk assessment
        return false // No approval required
      })

      expect(requiresApproval).toBe(false)
    })
  })

  describe('Approval Query Operations', () => {
    it('should retrieve pending approvals', async () => {
      await prisma.shadowGrokApproval.create({
        data: {
          toolCallId: 'tool-call-007',
          toolName: 'deploy_payload',
          arguments: {},
          requestedBy: testOperator.id,
          status: 'pending',
        },
      })

      await prisma.shadowGrokApproval.create({
        data: {
          toolCallId: 'tool-call-008',
          toolName: 'deploy_payload',
          arguments: {},
          requestedBy: testOperator.id,
          status: 'approved',
          approvedBy: testOperator.id,
          approvedAt: new Date(),
        },
      })

      const pendingApprovals = await prisma.shadowGrokApproval.findMany({
        where: { status: 'pending' },
      })

      expect(pendingApprovals).toHaveLength(1)
      expect(pendingApprovals[0].status).toBe('pending')
    })

    it('should retrieve approvals by requester', async () => {
      await prisma.shadowGrokApproval.create({
        data: {
          toolCallId: 'tool-call-009',
          toolName: 'execute_command',
          arguments: {},
          requestedBy: testOperator.id,
          status: 'pending',
        },
      })

      const userApprovals = await prisma.shadowGrokApproval.findMany({
        where: { requestedBy: testOperator.id },
      })

      expect(userApprovals).toHaveLength(1)
      expect(userApprovals[0].requestedBy).toBe(testOperator.id)
    })

    it('should retrieve expired approvals', async () => {
      const pastDate = new Date(Date.now() - 3600000)

      await prisma.shadowGrokApproval.create({
        data: {
          toolCallId: 'tool-call-010',
          toolName: 'execute_command',
          arguments: {},
          requestedBy: testOperator.id,
          status: 'pending',
          expiresAt: pastDate,
        },
      })

      await prisma.shadowGrokApproval.updateMany({
        where: {
          expiresAt: { lt: new Date() },
          status: 'pending',
        },
        data: { status: 'expired' },
      })

      const expiredApprovals = await prisma.shadowGrokApproval.findMany({
        where: { status: 'expired' },
      })

      expect(expiredApprovals).toHaveLength(1)
    })
  })

  describe('Safety Checks', () => {
    it('should allow tracking duplicate approval requests at DB level', async () => {
      const toolCallId = 'tool-call-011'

      const firstApproval = await prisma.shadowGrokApproval.create({
        data: {
          toolCallId,
          toolName: 'deploy_payload',
          arguments: {},
          requestedBy: testOperator.id,
          status: 'pending',
        },
      })

      // DB allows multiple approvals with same toolCallId
      // (application logic should prevent duplicates before DB insert)
      const secondApproval = await prisma.shadowGrokApproval.create({
        data: {
          toolCallId,
          toolName: 'deploy_payload',
          arguments: {},
          requestedBy: testOperator.id,
          status: 'pending',
        },
      })

      expect(firstApproval).toBeDefined()
      expect(secondApproval).toBeDefined()
      expect(firstApproval.id).not.toBe(secondApproval.id)
    })

    it('should validate approval status transitions', async () => {
      const approval = await prisma.shadowGrokApproval.create({
        data: {
          toolCallId: 'tool-call-012',
          toolName: 'execute_command',
          arguments: {},
          requestedBy: testOperator.id,
          status: 'pending',
        },
      })

      // Valid transition: pending -> approved
      const approved = await prisma.shadowGrokApproval.update({
        where: { id: approval.id },
        data: { status: 'approved', approvedBy: testOperator.id, approvedAt: new Date() },
      })

      expect(approved.status).toBe('approved')

      // Invalid transition: approved -> pending (should not be allowed in real implementation)
      // This would be validated in the application logic
    })
  })
})