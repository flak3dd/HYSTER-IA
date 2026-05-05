/**
 * Agent Coordinator Test Suite
 * 
 * Tests for the enhanced agent coordination system:
 * - Agent registration and management
 * - Task submission and allocation
 * - Health monitoring and self-healing
 * - Swarm intelligence
 * - Knowledge sharing
 * - Conflict resolution
 */

import { AgentCoordinator, agentCoordinator } from '@/lib/post-exploitation/agents/agent-coordinator'
import type { AgentInfo, Task } from '@/lib/post-exploitation/agents/agent-coordinator'

describe('Agent Coordinator', () => {
  let coordinator: AgentCoordinator

  beforeEach(() => {
    coordinator = new AgentCoordinator()
  })

  afterEach(() => {
    coordinator.stopHeartbeatMonitor()
  })

  describe('Agent Registration', () => {
    it('should register an agent', () => {
      const agent: AgentInfo = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'reconnaissance',
        status: 'idle',
        capabilities: [
          {
            name: 'domain_enumeration',
            description: 'Enumerate domains',
            category: 'reconnaissance',
            requiresAuth: true,
            dangerous: false,
            resourceCost: 30,
            successRate: 0.95,
            avgExecutionTime: 3000,
          },
        ],
        lastHeartbeat: Date.now(),
        successRate: 0.9,
        totalTasks: 0,
        failedTasks: 0,
        load: 0.3,
      }

      coordinator.registerAgent(agent)
      const retrieved = coordinator.getAgent('agent-1')

      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe('agent-1')
      expect(retrieved?.name).toBe('Test Agent')
    })

    it('should unregister an agent', () => {
      const agent: AgentInfo = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'reconnaissance',
        status: 'idle',
        capabilities: [],
        lastHeartbeat: Date.now(),
        successRate: 0.9,
        totalTasks: 0,
        failedTasks: 0,
        load: 0.3,
      }

      coordinator.registerAgent(agent)
      coordinator.unregisterAgent('agent-1')

      const retrieved = coordinator.getAgent('agent-1')
      expect(retrieved).toBeUndefined()
    })

    it('should get all agents', () => {
      const agent1: AgentInfo = {
        id: 'agent-1',
        name: 'Agent 1',
        type: 'reconnaissance',
        status: 'idle',
        capabilities: [],
        lastHeartbeat: Date.now(),
        successRate: 0.9,
        totalTasks: 0,
        failedTasks: 0,
        load: 0.3,
      }

      const agent2: AgentInfo = {
        id: 'agent-2',
        name: 'Agent 2',
        type: 'exploitation',
        status: 'idle',
        capabilities: [],
        lastHeartbeat: Date.now(),
        successRate: 0.85,
        totalTasks: 0,
        failedTasks: 0,
        load: 0.5,
      }

      coordinator.registerAgent(agent1)
      coordinator.registerAgent(agent2)

      const agents = coordinator.getAllAgents()
      expect(agents.length).toBe(2)
    })

    it('should update agent heartbeat', () => {
      const agent: AgentInfo = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'reconnaissance',
        status: 'idle',
        capabilities: [],
        lastHeartbeat: Date.now() - 60000, // 1 minute ago
        successRate: 0.9,
        totalTasks: 0,
        failedTasks: 0,
        load: 0.3,
      }

      coordinator.registerAgent(agent)
      coordinator.updateHeartbeat('agent-1')

      const updated = coordinator.getAgent('agent-1')
      expect(updated?.lastHeartbeat).toBeGreaterThan(Date.now() - 1000)
    })
  })

  describe('Task Management', () => {
    it('should submit a task', () => {
      const taskId = coordinator.submitTask({
        type: 'domain_enumeration',
        priority: 'high',
        requiredCapabilities: ['domain_enumeration'],
        estimatedDuration: 5000,
        payload: { domain: 'example.com' },
        maxRetries: 3,
      })

      expect(taskId).toBeDefined()
      expect(taskId).toMatch(/^task-/)
    })

    it('should get task status', () => {
      const taskId = coordinator.submitTask({
        type: 'domain_enumeration',
        priority: 'high',
        requiredCapabilities: ['domain_enumeration'],
        estimatedDuration: 5000,
        payload: { domain: 'example.com' },
        maxRetries: 3,
      })

      const task = coordinator.getTaskStatus(taskId)
      expect(task).toBeDefined()
      expect(task?.id).toBe(taskId)
    })

    it('should update task status', () => {
      const taskId = coordinator.submitTask({
        type: 'domain_enumeration',
        priority: 'high',
        requiredCapabilities: ['domain_enumeration'],
        estimatedDuration: 5000,
        payload: { domain: 'example.com' },
        maxRetries: 3,
      })

      coordinator.updateTaskStatus(taskId, 'completed', { success: true })

      const task = coordinator.getTaskStatus(taskId)
      expect(task?.status).toBe('completed')
      expect(task?.result).toEqual({ success: true })
    })

    it('should handle task dependencies', () => {
      const parentTaskId = coordinator.submitTask({
        type: 'domain_enumeration',
        priority: 'high',
        requiredCapabilities: ['domain_enumeration'],
        estimatedDuration: 5000,
        payload: { domain: 'example.com' },
        maxRetries: 3,
      })

      const childTaskId = coordinator.submitTask({
        type: 'user_enumeration',
        priority: 'medium',
        requiredCapabilities: ['user_enumeration'],
        estimatedDuration: 3000,
        payload: { domain: 'example.com' },
        dependencies: [parentTaskId],
        maxRetries: 3,
      })

      const childTask = coordinator.getTaskStatus(childTaskId)
      expect(childTask?.status).toBe('blocked')
    })

    it('should unblock dependent tasks when parent completes', () => {
      const parentTaskId = coordinator.submitTask({
        type: 'domain_enumeration',
        priority: 'high',
        requiredCapabilities: ['domain_enumeration'],
        estimatedDuration: 5000,
        payload: { domain: 'example.com' },
        maxRetries: 3,
      })

      const childTaskId = coordinator.submitTask({
        type: 'user_enumeration',
        priority: 'medium',
        requiredCapabilities: ['user_enumeration'],
        estimatedDuration: 3000,
        payload: { domain: 'example.com' },
        dependencies: [parentTaskId],
        maxRetries: 3,
      })

      coordinator.updateTaskStatus(parentTaskId, 'completed')

      const childTask = coordinator.getTaskStatus(childTaskId)
      expect(childTask?.status).toBe('pending')
    })
  })

  describe('Task Allocation', () => {
    beforeEach(() => {
      const agent: AgentInfo = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'reconnaissance',
        status: 'idle',
        capabilities: [
          {
            name: 'domain_enumeration',
            description: 'Enumerate domains',
            category: 'reconnaissance',
            requiresAuth: true,
            dangerous: false,
            resourceCost: 30,
            successRate: 0.95,
            avgExecutionTime: 3000,
          },
        ],
        lastHeartbeat: Date.now(),
        successRate: 0.9,
        totalTasks: 10,
        failedTasks: 1,
        load: 0.3,
      }

      coordinator.registerAgent(agent)
    })

    it('should allocate task to capable agent', () => {
      const taskId = coordinator.submitTask({
        type: 'domain_enumeration',
        priority: 'high',
        requiredCapabilities: ['domain_enumeration'],
        estimatedDuration: 5000,
        payload: { domain: 'example.com' },
        maxRetries: 3,
      })

      const task = coordinator.getTaskStatus(taskId)
      expect(task?.assignedAgent).toBe('agent-1')
      expect(task?.status).toBe('assigned')
    })

    it('should not allocate task to agent without capabilities', () => {
      const taskId = coordinator.submitTask({
        type: 'exploitation',
        priority: 'high',
        requiredCapabilities: ['exploitation'],
        estimatedDuration: 5000,
        payload: { target: 'server' },
        maxRetries: 3,
      })

      const task = coordinator.getTaskStatus(taskId)
      expect(task?.assignedAgent).toBeUndefined()
    })
  })

  describe('Metrics', () => {
    it('should return coordination metrics', () => {
      const agent: AgentInfo = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'reconnaissance',
        status: 'idle',
        capabilities: [],
        lastHeartbeat: Date.now(),
        successRate: 0.9,
        totalTasks: 0,
        failedTasks: 0,
        load: 0.3,
      }

      coordinator.registerAgent(agent)

      const metrics = coordinator.getMetrics()
      expect(metrics).toBeDefined()
      expect(metrics.totalAgents).toBe(1)
      expect(metrics.activeAgents).toBe(0)
      expect(metrics.totalTasks).toBe(0)
    })

    it('should track task completion', () => {
      const agent: AgentInfo = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'reconnaissance',
        status: 'idle',
        capabilities: [
          {
            name: 'domain_enumeration',
            description: 'Enumerate domains',
            category: 'reconnaissance',
            requiresAuth: true,
            dangerous: false,
            resourceCost: 30,
            successRate: 0.95,
            avgExecutionTime: 3000,
          },
        ],
        lastHeartbeat: Date.now(),
        successRate: 0.9,
        totalTasks: 0,
        failedTasks: 0,
        load: 0.3,
      }

      coordinator.registerAgent(agent)

      const taskId = coordinator.submitTask({
        type: 'domain_enumeration',
        priority: 'high',
        requiredCapabilities: ['domain_enumeration'],
        estimatedDuration: 5000,
        payload: { domain: 'example.com' },
        maxRetries: 3,
      })

      coordinator.updateTaskStatus(taskId, 'completed', { success: true })

      const metrics = coordinator.getMetrics()
      expect(metrics.completedTasks).toBe(1)
    })
  })

  describe('Swarm Intelligence', () => {
    it('should make collective decision', async () => {
      const agent: AgentInfo = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'reconnaissance',
        status: 'idle',
        capabilities: [],
        lastHeartbeat: Date.now(),
        successRate: 0.9,
        totalTasks: 0,
        failedTasks: 0,
        load: 0.3,
      }

      coordinator.registerAgent(agent)

      const decision = await coordinator.swarmDecision('Should we proceed with operation?', {})
      expect(decision).toBeDefined()
      expect(decision.decision).toBeDefined()
      expect(decision.confidence).toBeGreaterThanOrEqual(0)
      expect(decision.confidence).toBeLessThanOrEqual(1)
    })

    it('should handle no available agents for decision', async () => {
      const decision = await coordinator.swarmDecision('Should we proceed?', {})
      expect(decision.decision).toBe('No agents available for decision')
      expect(decision.confidence).toBe(0)
    })
  })

  describe('Knowledge Sharing', () => {
    it('should share knowledge between agents', () => {
      const agent1: AgentInfo = {
        id: 'agent-1',
        name: 'Agent 1',
        type: 'reconnaissance',
        status: 'idle',
        capabilities: [],
        lastHeartbeat: Date.now(),
        successRate: 0.9,
        totalTasks: 0,
        failedTasks: 0,
        load: 0.3,
      }

      const agent2: AgentInfo = {
        id: 'agent-2',
        name: 'Agent 2',
        type: 'exploitation',
        status: 'idle',
        capabilities: [],
        lastHeartbeat: Date.now(),
        successRate: 0.85,
        totalTasks: 0,
        failedTasks: 0,
        load: 0.5,
      }

      coordinator.registerAgent(agent1)
      coordinator.registerAgent(agent2)

      const knowledge = { domain: 'example.com', users: ['user1', 'user2'] }
      coordinator.shareKnowledge('agent-1', knowledge)

      // Knowledge sharing is an event, so we can't directly verify it
      // but we can verify the method doesn't throw
      expect(() => coordinator.shareKnowledge('agent-1', knowledge)).not.toThrow()
    })
  })

  describe('Conflict Resolution', () => {
    it('should resolve conflict between agents', () => {
      const agent1: AgentInfo = {
        id: 'agent-1',
        name: 'Agent 1',
        type: 'reconnaissance',
        status: 'idle',
        capabilities: [],
        lastHeartbeat: Date.now(),
        successRate: 0.9,
        totalTasks: 10,
        failedTasks: 1,
        load: 0.3,
      }

      const agent2: AgentInfo = {
        id: 'agent-2',
        name: 'Agent 2',
        type: 'exploitation',
        status: 'idle',
        capabilities: [],
        lastHeartbeat: Date.now(),
        successRate: 0.7,
        totalTasks: 5,
        failedTasks: 2,
        load: 0.7,
      }

      coordinator.registerAgent(agent1)
      coordinator.registerAgent(agent2)

      const resolution = coordinator.resolveConflict({
        type: 'resource_contention',
        agents: ['agent-1', 'agent-2'],
        resources: ['server-1'],
        context: {},
      })

      expect(resolution).toBeDefined()
      expect(resolution.resolution).toBeDefined()
      expect(resolution.affectedAgents).toBeDefined()
      expect(resolution.reasoning).toBeDefined()
    })
  })

  describe('Priority Handling', () => {
    beforeEach(() => {
      const agent: AgentInfo = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'reconnaissance',
        status: 'idle',
        capabilities: [
          {
            name: 'domain_enumeration',
            description: 'Enumerate domains',
            category: 'reconnaissance',
            requiresAuth: true,
            dangerous: false,
            resourceCost: 30,
            successRate: 0.95,
            avgExecutionTime: 3000,
          },
        ],
        lastHeartbeat: Date.now(),
        successRate: 0.9,
        totalTasks: 0,
        failedTasks: 0,
        load: 0.3,
      }

      coordinator.registerAgent(agent)
    })

    it('should prioritize critical tasks', () => {
      const lowPriorityTask = coordinator.submitTask({
        type: 'domain_enumeration',
        priority: 'low',
        requiredCapabilities: ['domain_enumeration'],
        estimatedDuration: 5000,
        payload: { domain: 'example.com' },
        maxRetries: 3,
      })

      const criticalTask = coordinator.submitTask({
        type: 'domain_enumeration',
        priority: 'critical',
        requiredCapabilities: ['domain_enumeration'],
        estimatedDuration: 5000,
        payload: { domain: 'critical.com' },
        maxRetries: 3,
      })

      // Critical task should be processed first
      const lowPriority = coordinator.getTaskStatus(lowPriorityTask)
      const critical = coordinator.getTaskStatus(criticalTask)

      expect(critical?.assignedAgent).toBe('agent-1')
      expect(critical?.status).toBe('assigned')
    })
  })
})