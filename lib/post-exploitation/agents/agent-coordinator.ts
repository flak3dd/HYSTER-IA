/**
 * Enhanced Agent Coordination System
 * 
 * Provides advanced coordination capabilities for autonomous agents:
 * - Dynamic task allocation based on agent capabilities
 * - Agent collaboration and knowledge sharing
 * - Conflict resolution and priority management
 * - Distributed task execution with load balancing
 * - Agent health monitoring and self-healing
 * - Swarm intelligence for collective decision making
 */

import { EventEmitter } from 'events'

export interface AgentCapability {
  name: string
  description: string
  category: string
  requiresAuth: boolean
  dangerous: boolean
  resourceCost: number
  successRate: number
  avgExecutionTime: number
}

export interface AgentInfo {
  id: string
  name: string
  type: string
  status: 'idle' | 'busy' | 'error' | 'offline'
  capabilities: AgentCapability[]
  currentTask?: string
  lastHeartbeat: number
  successRate: number
  totalTasks: number
  failedTasks: number
  load: number
}

export interface Task {
  id: string
  type: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  requiredCapabilities: string[]
  estimatedDuration: number
  payload: any
  dependencies?: string[]
  maxRetries: number
  retryCount: number
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'blocked'
  assignedAgent?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  result?: any
  error?: string
}

export interface TaskAllocation {
  taskId: string
  agentId: string
  confidence: number
  reason: string
}

export interface CoordinationMetrics {
  totalAgents: number
  activeAgents: number
  totalTasks: number
  pendingTasks: number
  inProgressTasks: number
  completedTasks: number
  failedTasks: number
  averageTaskDuration: number
  systemThroughput: number
  agentUtilization: number
}

export class AgentCoordinator extends EventEmitter {
  private agents: Map<string, AgentInfo> = new Map()
  private tasks: Map<string, Task> = new Map()
  private taskQueue: Task[] = []
  private taskHistory: Task[] = []
  private maxHistorySize: number = 1000
  private heartbeatInterval: number = 30000 // 30 seconds
  private heartbeatTimer?: NodeJS.Timeout

  constructor() {
    super()
    this.startHeartbeatMonitor()
  }

  /**
   * Register an agent with the coordinator
   */
  registerAgent(agent: AgentInfo): void {
    this.agents.set(agent.id, agent)
    this.emit('agent_registered', agent)
    this.rebalanceTasks()
  }

  /**
   * Unregister an agent from the coordinator
   */
  unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      // Reassign agent's current task
      if (agent.currentTask) {
        const task = this.tasks.get(agent.currentTask)
        if (task && task.status === 'in_progress') {
          task.status = 'pending'
          task.assignedAgent = undefined
          this.taskQueue.push(task)
        }
      }
      
      this.agents.delete(agentId)
      this.emit('agent_unregistered', agentId)
      this.rebalanceTasks()
    }
  }

  /**
   * Update agent heartbeat
   */
  updateHeartbeat(agentId: string): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.lastHeartbeat = Date.now()
      if (agent.status === 'offline') {
        agent.status = 'idle'
        this.emit('agent_recovered', agentId)
      }
    }
  }

  /**
   * Submit a task for execution
   */
  submitTask(task: Omit<Task, 'id' | 'status' | 'retryCount' | 'createdAt'>): string {
    const newTask: Task = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    }

    this.tasks.set(newTask.id, newTask)
    
    // Check if dependencies are satisfied
    if (this.areDependenciesSatisfied(newTask)) {
      this.taskQueue.push(newTask)
      this.emit('task_submitted', newTask)
      this.processTaskQueue()
    } else {
      newTask.status = 'blocked'
      this.emit('task_blocked', newTask)
    }

    return newTask.id
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): Task | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * Update task status
   */
  updateTaskStatus(taskId: string, status: Task['status'], result?: any, error?: string): void {
    const task = this.tasks.get(taskId)
    if (task) {
      const oldStatus = task.status
      task.status = status
      
      if (status === 'in_progress' && !task.startedAt) {
        task.startedAt = Date.now()
      }
      
      if (status === 'completed' || status === 'failed') {
        task.completedAt = Date.now()
        if (result) task.result = result
        if (error) task.error = error
        
        // Update agent stats
        if (task.assignedAgent) {
          const agent = this.agents.get(task.assignedAgent)
          if (agent) {
            agent.currentTask = undefined
            agent.status = 'idle'
            agent.totalTasks++
            if (status === 'failed') {
              agent.failedTasks++
            }
            agent.successRate = (agent.totalTasks - agent.failedTasks) / agent.totalTasks
          }
        }
        
        // Move to history
        this.taskHistory.push(task)
        if (this.taskHistory.length > this.maxHistorySize) {
          this.taskHistory.shift()
        }
        
        // Check for dependent tasks
        this.checkDependentTasks(taskId)
      }
      
      this.emit('task_updated', task, oldStatus)
      
      if (status === 'completed' || status === 'failed') {
        this.processTaskQueue()
      }
    }
  }

  /**
   * Get coordination metrics
   */
  getMetrics(): CoordinationMetrics {
    const agents = Array.from(this.agents.values())
    const tasks = Array.from(this.tasks.values())
    const completedTasks = this.taskHistory.filter(t => t.status === 'completed')
    
    const averageTaskDuration = completedTasks.length > 0
      ? completedTasks.reduce((sum, t) => sum + (t.completedAt! - t.startedAt!), 0) / completedTasks.length
      : 0

    const activeAgents = agents.filter(a => a.status === 'busy').length
    const agentUtilization = agents.length > 0 ? activeAgents / agents.length : 0

    return {
      totalAgents: agents.length,
      activeAgents,
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      inProgressTasks: tasks.filter(t => t.status === 'in_progress').length,
      completedTasks: completedTasks.length,
      failedTasks: this.taskHistory.filter(t => t.status === 'failed').length,
      averageTaskDuration,
      systemThroughput: completedTasks.length > 0 ? completedTasks.length / (Date.now() - this.taskHistory[0]?.createdAt || 1) * 1000 : 0,
      agentUtilization,
    }
  }

  /**
   * Get agent info
   */
  getAgent(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId)
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values())
  }

  /**
   * Get best agent for a task
   */
  private getBestAgentForTask(task: Task): TaskAllocation | null {
    const availableAgents = Array.from(this.agents.values())
      .filter(a => a.status === 'idle' || a.status === 'busy')

    if (availableAgents.length === 0) {
      return null
    }

    const allocations: TaskAllocation[] = []

    for (const agent of availableAgents) {
      const hasCapabilities = task.requiredCapabilities.every(cap =>
        agent.capabilities.some(ac => ac.name === cap)
      )

      if (!hasCapabilities) {
        continue
      }

      // Calculate confidence score
      let confidence = 0.5
      
      // Success rate
      confidence += agent.successRate * 0.3
      
      // Current load (prefer less loaded agents)
      confidence += (1 - agent.load) * 0.2
      
      // Capability match
      const capabilityMatch = agent.capabilities.filter(ac =>
        task.requiredCapabilities.includes(ac.name)
      ).length / task.requiredCapabilities.length
      confidence += capabilityMatch * 0.3
      
      // Priority consideration
      if (task.priority === 'critical' && agent.status === 'idle') {
        confidence += 0.2
      }

      allocations.push({
        taskId: task.id,
        agentId: agent.id,
        confidence: Math.min(1, confidence),
        reason: this.generateAllocationReason(agent, task, confidence),
      })
    }

    if (allocations.length === 0) {
      return null
    }

    // Sort by confidence and return best
    allocations.sort((a, b) => b.confidence - a.confidence)
    return allocations[0]
  }

  /**
   * Process task queue
   */
  private processTaskQueue(): void {
    // Sort queue by priority
    this.taskQueue.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })

    const processed: string[] = []

    for (const task of this.taskQueue) {
      if (task.status !== 'pending') {
        processed.push(task.id)
        continue
      }

      const allocation = this.getBestAgentForTask(task)
      if (allocation) {
        this.assignTask(task.id, allocation.agentId)
        processed.push(task.id)
      }
    }

    // Remove processed tasks from queue
    this.taskQueue = this.taskQueue.filter(t => !processed.includes(t.id))
  }

  /**
   * Assign task to agent
   */
  private assignTask(taskId: string, agentId: string): void {
    const task = this.tasks.get(taskId)
    const agent = this.agents.get(agentId)

    if (task && agent) {
      task.status = 'assigned'
      task.assignedAgent = agentId
      
      agent.currentTask = taskId
      agent.status = 'busy'
      
      this.emit('task_assigned', task, agent)
    }
  }

  /**
   * Rebalance tasks among agents
   */
  private rebalanceTasks(): void {
    this.processTaskQueue()
  }

  /**
   * Check if task dependencies are satisfied
   */
  private areDependenciesSatisfied(task: Task): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true
    }

    return task.dependencies.every(depId => {
      const depTask = this.tasks.get(depId)
      return depTask && depTask.status === 'completed'
    })
  }

  /**
   * Check dependent tasks when a task completes
   */
  private checkDependentTasks(completedTaskId: string): void {
    for (const task of this.tasks.values()) {
      if (task.status === 'blocked' && task.dependencies?.includes(completedTaskId)) {
        if (this.areDependenciesSatisfied(task)) {
          task.status = 'pending'
          this.taskQueue.push(task)
          this.emit('task_unblocked', task)
        }
      }
    }
  }

  /**
   * Generate allocation reason
   */
  private generateAllocationReason(agent: AgentInfo, task: Task, confidence: number): string {
    const reasons: string[] = []
    
    if (agent.successRate > 0.8) {
      reasons.push('high success rate')
    }
    if (agent.load < 0.5) {
      reasons.push('low current load')
    }
    if (agent.status === 'idle') {
      reasons.push('immediately available')
    }
    
    return reasons.join(', ') || 'suitable for task'
  }

  /**
   * Start heartbeat monitor
   */
  private startHeartbeatMonitor(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      const threshold = this.heartbeatInterval * 2 // Allow 2 missed heartbeats

      for (const [agentId, agent] of this.agents) {
        if (now - agent.lastHeartbeat > threshold && agent.status !== 'offline') {
          const oldStatus = agent.status
          agent.status = 'offline'
          this.emit('agent_timeout', agentId, oldStatus)
          
          // Reassign current task if any
          if (agent.currentTask) {
            const task = this.tasks.get(agent.currentTask)
            if (task && task.status === 'in_progress') {
              task.status = 'pending'
              task.assignedAgent = undefined
              this.taskQueue.push(task)
              this.rebalanceTasks()
            }
          }
        }
      }
    }, this.heartbeatInterval)
  }

  /**
   * Stop heartbeat monitor
   */
  stopHeartbeatMonitor(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }
  }

  /**
   * Swarm intelligence - collective decision making
   */
  async swarmDecision(query: string, context: any): Promise<{
    decision: string
    confidence: number
    participatingAgents: string[]
    consensus: number
  }> {
    const activeAgents = Array.from(this.agents.values())
      .filter(a => a.status !== 'offline')

    if (activeAgents.length === 0) {
      return {
        decision: 'No agents available for decision',
        confidence: 0,
        participatingAgents: [],
        consensus: 0,
      }
    }

    // Simulate agent responses (in real implementation, would query agents)
    const responses = activeAgents.map(agent => ({
      agentId: agent.id,
      response: Math.random() > 0.5 ? 'approve' : 'reject',
      confidence: 0.6 + Math.random() * 0.4,
    }))

    const approveCount = responses.filter(r => r.response === 'approve').length
    const consensus = approveCount / responses.length

    const decision = consensus > 0.6 ? 'approve' : consensus < 0.4 ? 'reject' : 'undecided'
    const avgConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length

    return {
      decision,
      confidence: avgConfidence,
      participatingAgents: responses.map(r => r.agentId),
      consensus,
    }
  }

  /**
   * Knowledge sharing between agents
   */
  shareKnowledge(sourceAgentId: string, knowledge: any, targetAgentIds?: string[]): void {
    const targets = targetAgentIds || Array.from(this.agents.keys()).filter(id => id !== sourceAgentId)
    
    this.emit('knowledge_shared', {
      source: sourceAgentId,
      targets,
      knowledge,
      timestamp: Date.now(),
    })
  }

  /**
   * Conflict resolution between agents
   */
  resolveConflict(conflict: {
    type: string
    agents: string[]
    resources: string[]
    context: any
  }): {
    resolution: string
    affectedAgents: string[]
    reasoning: string
  } {
    // Simple conflict resolution based on agent priority and load
    const agents = conflict.agents
      .map(id => this.agents.get(id))
      .filter((a): a is AgentInfo => a !== undefined)

    if (agents.length === 0) {
      return {
        resolution: 'no_affected_agents',
        affectedAgents: [],
        reasoning: 'No valid agents in conflict',
      }
    }

    // Sort by success rate and load
    agents.sort((a, b) => {
      const scoreA = a.successRate - a.load
      const scoreB = b.successRate - b.load
      return scoreB - scoreA
    })

    const winner = agents[0]
    const losers = agents.slice(1).map(a => a.id)

    return {
      resolution: 'priority_allocation',
      affectedAgents: losers,
      reasoning: `Allocated to ${winner.name} based on higher success rate (${winner.successRate}) and lower load (${winner.load})`,
    }
  }
}

// Global coordinator instance
export const agentCoordinator = new AgentCoordinator()