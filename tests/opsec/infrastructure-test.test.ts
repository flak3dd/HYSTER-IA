/**
 * Infrastructure Spin-Up Tests
 * Tests for infrastructure provisioning, node management, and C2 server deployment
 */

import { PrismaClient } from '@prisma/client'
import { setupTestDatabase, teardownTestDatabase, prisma } from '../setup/database'
import { createTestHysteriaNode, createTestProfile } from '../fixtures/test-data'

describe('Infrastructure Spin-Up', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    // Clean up before each test
    await prisma.hysteriaNode.deleteMany()
    await prisma.profile.deleteMany()
  })

  describe('Node Creation', () => {
    it('should create a new Hysteria node', async () => {
      const node = await prisma.hysteriaNode.create({
        data: createTestHysteriaNode(),
      })

      expect(node).toBeDefined()
      expect(node.id).toBeDefined()
      expect(node.name).toBeDefined()
      expect(node.hostname).toBeDefined()
      expect(node.status).toBe('stopped')
    })

    it('should create node with tags', async () => {
      const tags = ['production', 'aws', 'us-east-1']
      const node = await prisma.hysteriaNode.create({
        data: createTestHysteriaNode({
          tags: JSON.stringify(tags),
        }),
      })

      const parsedTags = JSON.parse(node.tags)
      expect(parsedTags).toEqual(tags)
    })

    it('should create node with provider information', async () => {
      const node = await prisma.hysteriaNode.create({
        data: createTestHysteriaNode({
          provider: 'aws',
          region: 'us-east-1',
        }),
      })

      expect(node.provider).toBe('aws')
      expect(node.region).toBe('us-east-1')
    })
  })

  describe('Node Status Management', () => {
    it('should transition node from stopped to running', async () => {
      const node = await prisma.hysteriaNode.create({
        data: createTestHysteriaNode(),
      })

      const updatedNode = await prisma.hysteriaNode.update({
        where: { id: node.id },
        data: {
          status: 'running',
          lastHeartbeatAt: new Date(),
        },
      })

      expect(updatedNode.status).toBe('running')
      expect(updatedNode.lastHeartbeatAt).toBeDefined()
    })

    it('should handle node heartbeat updates', async () => {
      const node = await prisma.hysteriaNode.create({
        data: createTestHysteriaNode({
          status: 'running',
        }),
      })

      const heartbeatTime = new Date()
      const updatedNode = await prisma.hysteriaNode.update({
        where: { id: node.id },
        data: {
          lastHeartbeatAt: heartbeatTime,
        },
      })

      expect(updatedNode.lastHeartbeatAt).toEqual(heartbeatTime)
    })

    it('should detect stale nodes', async () => {
      const staleTime = new Date(Date.now() - 3600000) // 1 hour ago
      const node = await prisma.hysteriaNode.create({
        data: createTestHysteriaNode({
          status: 'running',
          lastHeartbeatAt: staleTime,
        }),
      })

      const isStale = node.lastHeartbeatAt! < new Date(Date.now() - 1800000) // 30 min threshold
      expect(isStale).toBe(true)
    })
  })

  describe('Profile Management', () => {
    it('should create a profile with node associations', async () => {
      const node = await prisma.hysteriaNode.create({
        data: createTestHysteriaNode(),
      })

      const profile = await prisma.profile.create({
        data: createTestProfile({
          nodeIds: JSON.stringify([node.id]),
        }),
      })

      expect(profile).toBeDefined()
      expect(profile.name).toBeDefined()
      const parsedNodeIds = JSON.parse(profile.nodeIds)
      expect(parsedNodeIds).toContain(node.id)
    })

    it('should update profile with multiple nodes', async () => {
      const node1 = await prisma.hysteriaNode.create({
        data: createTestHysteriaNode(),
      })

      const node2 = await prisma.hysteriaNode.create({
        data: createTestHysteriaNode(),
      })

      const profile = await prisma.profile.create({
        data: createTestProfile({
          nodeIds: JSON.stringify([node1.id]),
        }),
      })

      const updatedProfile = await prisma.profile.update({
        where: { id: profile.id },
        data: {
          nodeIds: JSON.stringify([node1.id, node2.id]),
        },
      })

      const parsedNodeIds = JSON.parse(updatedProfile.nodeIds)
      expect(parsedNodeIds).toHaveLength(2)
    })
  })

  describe('Node Query Operations', () => {
    it('should retrieve nodes by status', async () => {
      await prisma.hysteriaNode.create({
        data: createTestHysteriaNode({ status: 'running' }),
      })

      await prisma.hysteriaNode.create({
        data: createTestHysteriaNode({ status: 'stopped' }),
      })

      const runningNodes = await prisma.hysteriaNode.findMany({
        where: { status: 'running' },
      })

      const stoppedNodes = await prisma.hysteriaNode.findMany({
        where: { status: 'stopped' },
      })

      expect(runningNodes).toHaveLength(1)
      expect(stoppedNodes).toHaveLength(1)
    })

    it('should retrieve nodes by provider', async () => {
      await prisma.hysteriaNode.create({
        data: createTestHysteriaNode({ provider: 'aws' }),
      })

      await prisma.hysteriaNode.create({
        data: createTestHysteriaNode({ provider: 'gcp' }),
      })

      const awsNodes = await prisma.hysteriaNode.findMany({
        where: { provider: 'aws' },
      })

      const gcpNodes = await prisma.hysteriaNode.findMany({
        where: { provider: 'gcp' },
      })

      expect(awsNodes).toHaveLength(1)
      expect(gcpNodes).toHaveLength(1)
    })

    it('should retrieve nodes by region', async () => {
      await prisma.hysteriaNode.create({
        data: createTestHysteriaNode({ region: 'us-east-1' }),
      })

      await prisma.hysteriaNode.create({
        data: createTestHysteriaNode({ region: 'eu-west-1' }),
      })

      const usNodes = await prisma.hysteriaNode.findMany({
        where: { region: 'us-east-1' },
      })

      const euNodes = await prisma.hysteriaNode.findMany({
        where: { region: 'eu-west-1' },
      })

      expect(usNodes).toHaveLength(1)
      expect(euNodes).toHaveLength(1)
    })
  })

  describe('Infrastructure Health Checks', () => {
    it('should track node availability', async () => {
      const node = await prisma.hysteriaNode.create({
        data: createTestHysteriaNode({
          status: 'running',
          lastHeartbeatAt: new Date(),
        }),
      })

      const isAvailable = node.status === 'running' &&
        node.lastHeartbeatAt! > new Date(Date.now() - 300000) // 5 min threshold

      expect(isAvailable).toBe(true)
    })

    it('should calculate infrastructure health score', async () => {
      await prisma.hysteriaNode.createMany({
        data: [
          createTestHysteriaNode({ status: 'running', lastHeartbeatAt: new Date() }),
          createTestHysteriaNode({ status: 'running', lastHeartbeatAt: new Date() }),
          createTestHysteriaNode({ status: 'stopped' }),
        ],
      })

      const allNodes = await prisma.hysteriaNode.findMany()
      const runningNodes = allNodes.filter(n => n.status === 'running')
      const healthScore = (runningNodes.length / allNodes.length) * 100

      expect(healthScore).toBeCloseTo(66.67) // 2/3 nodes running
    })
  })
})