/**
 * Agent Task Tests
 * Tests for the agent task system, step execution, and task management
 */

import { PrismaClient } from '@prisma/client'
import { setupTestDatabase, teardownTestDatabase, prisma } from '../setup/database'
import { createTestOperator } from '../fixtures/test-data'

describe('Agent Task System', () => {
  let testOperator: any

  beforeAll(async () => {
    await setupTestDatabase()
    testOperator = await prisma.operator.create({ data: createTestOperator() })
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await prisma.agentStep.deleteMany()
    await prisma.agentTask.deleteMany()
  })

  describe('Task Creation', () => {
    it('should create a new agent task', async () => {
      const task = await prisma.agentTask.create({
        data: {
          status: 'queued',
          prompt: 'Analyze the target network for vulnerabilities',
          model: 'gpt-4',
          allowedTools: JSON.stringify(['nmap', 'vulnerability_scan']),
          maxSteps: 10,
          createdBy: testOperator.id,
        },
      })

      expect(task).toBeDefined()
      expect(task.id).toBeDefined()
      expect(task.status).toBe('queued')
      expect(task.prompt).toBe('Analyze the target network for vulnerabilities')
      expect(task.model).toBe('gpt-4')
      expect(task.maxSteps).toBe(10)
    })

    it('should create task with specific tool permissions', async () => {
      const allowedTools = ['nmap', 'vulnerability_scan', 'port_scan']
      const task = await prisma.agentTask.create({
        data: {
          status: 'queued',
          prompt: 'Perform network reconnaissance',
          model: 'gpt-4',
          allowedTools: JSON.stringify(allowedTools),
          maxSteps: 5,
          createdBy: testOperator.id,
        },
      })

      const parsedTools = JSON.parse(task.allowedTools)
      expect(parsedTools).toEqual(allowedTools)
    })
  })

  describe('Step Execution', () => {
    it('should create steps linked to a task', async () => {
      const task = await prisma.agentTask.create({
        data: {
          status: 'running',
          prompt: 'Test prompt',
          model: 'gpt-4',
          allowedTools: JSON.stringify([]),
          maxSteps: 5,
          createdBy: testOperator.id,
        },
      })

      const step = await prisma.agentStep.create({
        data: {
          taskId: task.id,
          index: 0,
          kind: 'tool_call',
          content: 'Executing nmap scan',
          tool: 'nmap',
          arguments: { target: '192.168.1.0/24' },
          result: { ports: [22, 80, 443] },
        },
      })

      expect(step).toBeDefined()
      expect(step.taskId).toBe(task.id)
      expect(step.index).toBe(0)
      expect(step.kind).toBe('tool_call')
      expect(step.tool).toBe('nmap')
    })

    it('should create multiple steps in sequence', async () => {
      const task = await prisma.agentTask.create({
        data: {
          status: 'running',
          prompt: 'Test prompt',
          model: 'gpt-4',
          allowedTools: JSON.stringify([]),
          maxSteps: 5,
          createdBy: testOperator.id,
        },
      })

      const step1 = await prisma.agentStep.create({
        data: {
          taskId: task.id,
          index: 0,
          kind: 'thought',
          content: 'I need to scan the network first',
        },
      })

      const step2 = await prisma.agentStep.create({
        data: {
          taskId: task.id,
          index: 1,
          kind: 'tool_call',
          content: 'Running nmap',
          tool: 'nmap',
          arguments: { target: '192.168.1.0/24' },
        },
      })

      const step3 = await prisma.agentStep.create({
        data: {
          taskId: task.id,
          index: 2,
          kind: 'observation',
          content: 'Found 3 open ports',
          result: { ports: [22, 80, 443] },
        },
      })

      const steps = await prisma.agentStep.findMany({
        where: { taskId: task.id },
        orderBy: { index: 'asc' },
      })

      expect(steps).toHaveLength(3)
      expect(steps[0].index).toBe(0)
      expect(steps[1].index).toBe(1)
      expect(steps[2].index).toBe(2)
    })
  })

  describe('Task Status Transitions', () => {
    it('should transition from queued to running', async () => {
      const task = await prisma.agentTask.create({
        data: {
          status: 'queued',
          prompt: 'Test prompt',
          model: 'gpt-4',
          allowedTools: JSON.stringify([]),
          maxSteps: 5,
          createdBy: testOperator.id,
        },
      })

      const updatedTask = await prisma.agentTask.update({
        where: { id: task.id },
        data: { status: 'running' },
      })

      expect(updatedTask.status).toBe('running')
    })

    it('should transition from running to completed', async () => {
      const task = await prisma.agentTask.create({
        data: {
          status: 'running',
          prompt: 'Test prompt',
          model: 'gpt-4',
          allowedTools: JSON.stringify([]),
          maxSteps: 5,
          createdBy: testOperator.id,
        },
      })

      const updatedTask = await prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: 'completed',
          result: 'Task completed successfully',
          finishedAt: new Date(),
        },
      })

      expect(updatedTask.status).toBe('completed')
      expect(updatedTask.result).toBe('Task completed successfully')
      expect(updatedTask.finishedAt).toBeDefined()
    })

    it('should transition to failed on error', async () => {
      const task = await prisma.agentTask.create({
        data: {
          status: 'running',
          prompt: 'Test prompt',
          model: 'gpt-4',
          allowedTools: JSON.stringify([]),
          maxSteps: 5,
          createdBy: testOperator.id,
        },
      })

      const updatedTask = await prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: 'failed',
          error: 'Tool execution failed: timeout',
          finishedAt: new Date(),
        },
      })

      expect(updatedTask.status).toBe('failed')
      expect(updatedTask.error).toBe('Tool execution failed: timeout')
    })
  })

  describe('Step Counting', () => {
    it('should track step count during execution', async () => {
      const task = await prisma.agentTask.create({
        data: {
          status: 'running',
          prompt: 'Test prompt',
          model: 'gpt-4',
          allowedTools: JSON.stringify([]),
          maxSteps: 5,
          stepCount: 0,
          createdBy: testOperator.id,
        },
      })

      // Add steps
      await prisma.agentStep.create({
        data: {
          taskId: task.id,
          index: 0,
          kind: 'thought',
          content: 'Step 1',
        },
      })

      await prisma.agentStep.create({
        data: {
          taskId: task.id,
          index: 1,
          kind: 'tool_call',
          content: 'Step 2',
          tool: 'test_tool',
        },
      })

      // Update step count
      const updatedTask = await prisma.agentTask.update({
        where: { id: task.id },
        data: { stepCount: 2 },
      })

      expect(updatedTask.stepCount).toBe(2)
    })

    it('should enforce max steps limit', async () => {
      const maxSteps = 5
      const task = await prisma.agentTask.create({
        data: {
          status: 'running',
          prompt: 'Test prompt',
          model: 'gpt-4',
          allowedTools: JSON.stringify([]),
          maxSteps,
          stepCount: 5,
          createdBy: testOperator.id,
        },
      })

      // Should not allow more steps
      const canAddStep = task.stepCount < task.maxSteps
      expect(canAddStep).toBe(false)
    })
  })

  describe('Step Types', () => {
    it('should support different step kinds', async () => {
      const task = await prisma.agentTask.create({
        data: {
          status: 'running',
          prompt: 'Test prompt',
          model: 'gpt-4',
          allowedTools: JSON.stringify([]),
          maxSteps: 10,
          createdBy: testOperator.id,
        },
      })

      const stepKinds = ['thought', 'tool_call', 'observation', 'error']

      for (let i = 0; i < stepKinds.length; i++) {
        await prisma.agentStep.create({
          data: {
            taskId: task.id,
            index: i,
            kind: stepKinds[i],
            content: `Step ${i}`,
          },
        })
      }

      const steps = await prisma.agentStep.findMany({
        where: { taskId: task.id },
      })

      expect(steps).toHaveLength(4)
      expect(steps.map(s => s.kind)).toEqual(stepKinds)
    })
  })

  describe('Query Operations', () => {
    it('should retrieve tasks by status', async () => {
      await prisma.agentTask.create({
        data: {
          status: 'queued',
          prompt: 'Test 1',
          model: 'gpt-4',
          allowedTools: JSON.stringify([]),
          maxSteps: 5,
          createdBy: testOperator.id,
        },
      })

      await prisma.agentTask.create({
        data: {
          status: 'running',
          prompt: 'Test 2',
          model: 'gpt-4',
          allowedTools: JSON.stringify([]),
          maxSteps: 5,
          createdBy: testOperator.id,
        },
      })

      await prisma.agentTask.create({
        data: {
          status: 'completed',
          prompt: 'Test 3',
          model: 'gpt-4',
          allowedTools: JSON.stringify([]),
          maxSteps: 5,
          createdBy: testOperator.id,
          result: 'Done',
          finishedAt: new Date(),
        },
      })

      const queuedTasks = await prisma.agentTask.findMany({
        where: { status: 'queued' },
      })

      const runningTasks = await prisma.agentTask.findMany({
        where: { status: 'running' },
      })

      const completedTasks = await prisma.agentTask.findMany({
        where: { status: 'completed' },
      })

      expect(queuedTasks).toHaveLength(1)
      expect(runningTasks).toHaveLength(1)
      expect(completedTasks).toHaveLength(1)
    })

    it('should retrieve tasks by creator', async () => {
      await prisma.agentTask.create({
        data: {
          status: 'queued',
          prompt: 'Test',
          model: 'gpt-4',
          allowedTools: JSON.stringify([]),
          maxSteps: 5,
          createdBy: testOperator.id,
        },
      })

      const userTasks = await prisma.agentTask.findMany({
        where: { createdBy: testOperator.id },
      })

      expect(userTasks).toHaveLength(1)
      expect(userTasks[0].createdBy).toBe(testOperator.id)
    })

    it('should retrieve steps with task', async () => {
      const task = await prisma.agentTask.create({
        data: {
          status: 'running',
          prompt: 'Test',
          model: 'gpt-4',
          allowedTools: JSON.stringify([]),
          maxSteps: 5,
          createdBy: testOperator.id,
          steps: {
            create: [
              {
                index: 0,
                kind: 'thought',
                content: 'Step 1',
              },
              {
                index: 1,
                kind: 'tool_call',
                content: 'Step 2',
                tool: 'test_tool',
              },
            ],
          },
        },
      })

      const taskWithSteps = await prisma.agentTask.findUnique({
        where: { id: task.id },
        include: { steps: true },
      })

      expect(taskWithSteps?.steps).toHaveLength(2)
    })
  })
})