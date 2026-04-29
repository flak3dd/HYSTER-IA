import { AutonomousTask, orchestrationEngine } from './orchestration-engine'
import { Queue, Worker, Job } from 'bullmq'
import Redis from 'ioredis'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export interface SchedulingStrategy {
  name: string
  description: string
  shouldExecute: (task: AutonomousTask, systemState: SystemState) => boolean
  calculatePriority: (task: AutonomousTask, systemState: SystemState) => number
}

export interface SystemState {
  cpuUsage: number
  memoryUsage: number
  activeTasks: number
  queuedTasks: number
  apiRateLimits: Record<string, number>
  timeOfDay: number
  dayOfWeek: number
}

export interface SchedulingDecision {
  taskId: string
  executeNow: boolean
  scheduledTime?: number
  reason: string
  estimatedWaitTime: number
}

/* ------------------------------------------------------------------ */
/*  Intelligent Task Scheduler                                         */
/* ------------------------------------------------------------------ */

class IntelligentScheduler {
  private queue: Queue | null
  private worker: Worker | null
  private redisConnection: Redis | null
  private schedulingStrategies: Map<string, SchedulingStrategy>
  private executionHistory: Map<string, number[]>
  private isRunning: boolean
  private schedulingInterval: NodeJS.Timeout | null

  constructor() {
    this.queue = null
    this.worker = null
    this.redisConnection = null
    this.schedulingStrategies = new Map()
    this.executionHistory = new Map()
    this.isRunning = false
    this.schedulingInterval = null

    this.initializeStrategies()
  }

  /* ------------------------------------------------------------------ */
  /*  Initialization                                                    */
  /* ------------------------------------------------------------------ */

  private initializeStrategies(): void {
    // Priority-based strategy
    this.schedulingStrategies.set('priority', {
      name: 'Priority-Based',
      description: 'Execute tasks based on priority and dependencies',
      shouldExecute: (task, state) => {
        if (task.priority === 'critical') return state.activeTasks < 3
        if (task.priority === 'high') return state.activeTasks < 5
        return state.activeTasks < 8
      },
      calculatePriority: (task) => {
        const priorityScores = { critical: 100, high: 75, medium: 50, low: 25 }
        return priorityScores[task.priority]
      },
    })

    // Resource-aware strategy
    this.schedulingStrategies.set('resource_aware', {
      name: 'Resource-Aware',
      description: 'Execute tasks based on available system resources',
      shouldExecute: (task, state) => {
        const resourceScore = (100 - state.cpuUsage) * 0.5 + (100 - state.memoryUsage) * 0.5
        return resourceScore > 30 && state.activeTasks < Math.floor(resourceScore / 10)
      },
      calculatePriority: (task, state) => {
        const resourceScore = (100 - state.cpuUsage) * 0.5 + (100 - state.memoryUsage) * 0.5
        return resourceScore
      },
    })

    // Time-based strategy
    this.schedulingStrategies.set('time_based', {
      name: 'Time-Based',
      description: 'Execute tasks based on time of day and patterns',
      shouldExecute: (task, state) => {
        // Avoid heavy tasks during peak hours (9 AM - 5 PM)
        const isPeakHour = state.timeOfDay >= 9 && state.timeOfDay <= 17
        const isWeekend = state.dayOfWeek === 0 || state.dayOfWeek === 6
        
        if (isPeakHour && !isWeekend && task.priority !== 'critical') {
          return state.activeTasks < 3
        }
        return true
      },
      calculatePriority: (task, state) => {
        // Higher priority during off-hours
        const isOffHours = state.timeOfDay < 6 || state.timeOfDay > 18
        return task.priority === 'critical' ? 100 : isOffHours ? 75 : 50
      },
    })

    // API rate limit strategy
    this.schedulingStrategies.set('rate_limit_aware', {
      name: 'Rate Limit-Aware',
      description: 'Execute tasks based on API rate limit availability',
      shouldExecute: (task, state) => {
        // Check if required APIs have available rate limit
        const requiredApis = this.getRequiredApis(task)
        for (const api of requiredApis) {
          const remaining = state.apiRateLimits[api] || 100
          if (remaining < 10) return false // Don't execute if API rate limit is low
        }
        return true
      },
      calculatePriority: (task, state) => {
        const requiredApis = this.getRequiredApis(task)
        let minRateLimit = 100
        for (const api of requiredApis) {
          minRateLimit = Math.min(minRateLimit, state.apiRateLimits[api] || 100)
        }
        return minRateLimit
      },
    })
  }

  /* ------------------------------------------------------------------ */
  /*  Queue Management                                                  */
  /* ------------------------------------------------------------------ */

  async initialize(redisUrl?: string): Promise<void> {
    if (redisUrl) {
      this.redisConnection = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      })

      this.queue = new Queue('autonomous-tasks', {
        connection: this.redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      })

      this.worker = new Worker(
        'autonomous-tasks',
        async (job: Job) => {
          return this.executeTask(job.data.taskId)
        },
        {
          connection: this.redisConnection,
          concurrency: 5,
        }
      )

      this.worker.on('completed', (job) => {
        console.log(`Task ${job.id} completed successfully`)
      })

      this.worker.on('failed', (job, err) => {
        console.error(`Task ${job?.id} failed:`, err)
      })
    }

    this.isRunning = true
    this.startAutonomousScheduling()
  }

  async shutdown(): Promise<void> {
    this.isRunning = false
    
    if (this.schedulingInterval) {
      clearInterval(this.schedulingInterval)
    }

    if (this.worker) {
      await this.worker.close()
    }

    if (this.queue) {
      await this.queue.close()
    }

    if (this.redisConnection) {
      await this.redisConnection.quit()
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Task Scheduling                                                  */
  /* ------------------------------------------------------------------ */

  async scheduleTask(task: AutonomousTask): Promise<SchedulingDecision> {
    const systemState = await this.getSystemState()
    const strategy = this.selectOptimalStrategy(task, systemState)

    const decision: SchedulingDecision = {
      taskId: task.id,
      executeNow: strategy.shouldExecute(task, systemState),
      reason: strategy.description,
      estimatedWaitTime: this.calculateEstimatedWaitTime(task, systemState),
    }

    if (decision.executeNow && this.queue) {
      await this.queue.add('execute-task', { taskId: task.id }, {
        priority: strategy.calculatePriority(task, systemState),
      })
    } else if (this.queue) {
      // Schedule for later
      const scheduledTime = this.calculateOptimalScheduleTime(task, systemState)
      decision.scheduledTime = scheduledTime
      decision.reason = `Scheduled for ${new Date(scheduledTime).toISOString()} due to system constraints`
      
      await this.queue.add('execute-task', { taskId: task.id }, {
        priority: strategy.calculatePriority(task, systemState),
        delay: scheduledTime - Date.now(),
      })
    }

    return decision
  }

  async scheduleTasks(tasks: AutonomousTask[]): Promise<SchedulingDecision[]> {
    const decisions: SchedulingDecision[] = []
    
    // Sort tasks by dependencies and priority
    const sortedTasks = this.topologicalSort(tasks)
    
    for (const task of sortedTasks) {
      const decision = await this.scheduleTask(task)
      decisions.push(decision)
    }

    return decisions
  }

  /* ------------------------------------------------------------------ */
  /*  Autonomous Scheduling                                            */
  /* ------------------------------------------------------------------ */

  private startAutonomousScheduling(): void {
    this.schedulingInterval = setInterval(async () => {
      if (!this.isRunning) return

      try {
        await this.performAutonomousScheduling()
      } catch (error) {
        console.error('Autonomous scheduling error:', error)
      }
    }, 30000) // Every 30 seconds
  }

  private async performAutonomousScheduling(): Promise<void> {
    const systemState = await this.getSystemState()
    const pendingTasks = orchestrationEngine.getAllTasks().filter(
      task => task.status === 'pending'
    )

    for (const task of pendingTasks) {
      const strategy = this.selectOptimalStrategy(task, systemState)
      
      if (strategy.shouldExecute(task, systemState) && this.queue) {
        await this.queue.add('execute-task', { taskId: task.id }, {
          priority: strategy.calculatePriority(task, systemState),
        })
      }
    }

    // Perform system optimization
    await orchestrationEngine.performAutonomousOptimization()
  }

  /* ------------------------------------------------------------------ */
  /*  Task Execution                                                    */
  /* ------------------------------------------------------------------ */

  private async executeTask(taskId: string): Promise<void> {
    const task = orchestrationEngine.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    // Check dependencies
    if (!await this.checkDependencies(task)) {
      // Reschedule for later
      await this.scheduleTask(task)
      return
    }

    // Execute task
    await orchestrationEngine.executeAutonomousTask(taskId)

    // Update execution history
    this.updateExecutionHistory(task)
  }

  private async checkDependencies(task: AutonomousTask): Promise<boolean> {
    for (const depId of task.dependencies) {
      const depTask = orchestrationEngine.getTask(depId)
      if (!depTask || depTask.status !== 'completed') {
        return false
      }
    }
    return true
  }

  private updateExecutionHistory(task: AutonomousTask): Promise<void> {
    const history = this.executionHistory.get(task.type) || []
    if (task.actualDuration) {
      history.push(task.actualDuration)
      // Keep only last 100 executions
      if (history.length > 100) {
        history.shift()
      }
      this.executionHistory.set(task.type, history)
    }
    return Promise.resolve()
  }

  /* ------------------------------------------------------------------ */
  /*  Strategy Selection                                                */
  /* ------------------------------------------------------------------ */

  private selectOptimalStrategy(
    task: AutonomousTask,
    systemState: SystemState
  ): SchedulingStrategy {
    // Use a weighted combination of strategies
    const strategies = Array.from(this.schedulingStrategies.values())
    
    // Score each strategy
    const scoredStrategies = strategies.map(strategy => ({
      strategy,
      score: this.calculateStrategyScore(strategy, task, systemState),
    }))

    // Select the highest-scoring strategy
    scoredStrategies.sort((a, b) => b.score - a.score)
    return scoredStrategies[0].strategy
  }

  private calculateStrategyScore(
    strategy: SchedulingStrategy,
    task: AutonomousTask,
    systemState: SystemState
  ): number {
    let score = 0

    // Base score for strategy applicability
    if (strategy.shouldExecute(task, systemState)) {
      score += 50
    }

    // Priority score
    score += strategy.calculatePriority(task, systemState) * 0.3

    // System state adjustment
    score += (100 - systemState.cpuUsage) * 0.1
    score += (100 - systemState.memoryUsage) * 0.1

    return score
  }

  /* ------------------------------------------------------------------ */
  /*  Helper Methods                                                    */
  /* ------------------------------------------------------------------ */

  private async getSystemState(): Promise<SystemState> {
    const metrics = orchestrationEngine.getMetrics()
    const now = new Date()

    return {
      cpuUsage: metrics.cpuUsage,
      memoryUsage: metrics.memoryUsage,
      activeTasks: metrics.activeTasks,
      queuedTasks: metrics.queuedTasks,
      apiRateLimits: Object.fromEntries(
        Object.entries(metrics.apiRateLimits).map(([k, v]) => [k, v.remaining])
      ),
      timeOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
    }
  }

  private getRequiredApis(task: AutonomousTask): string[] {
    switch (task.type) {
      case 'domain_enumeration':
        return ['crtsh', 'dns', 'whois']
      case 'threat_analysis':
        return ['virustotal', 'alienvault']
      case 'dns_enumeration':
        return ['dns']
      case 'whois_lookup':
        return ['whois']
      default:
        return []
    }
  }

  private calculateEstimatedWaitTime(task: AutonomousTask, systemState: SystemState): number {
    const queuePosition = systemState.queuedTasks
    const avgExecutionTime = this.getAverageExecutionTime(task.type)
    const concurrencyLimit = 5 // Based on worker concurrency

    return Math.ceil(queuePosition / concurrencyLimit) * avgExecutionTime
  }

  private calculateOptimalScheduleTime(task: AutonomousTask, systemState: SystemState): number {
    const now = Date.now()
    
    // If it's peak hours, schedule for evening
    if (systemState.timeOfDay >= 9 && systemState.timeOfDay <= 17) {
      // Schedule for 6 PM today
      const eveningTime = new Date()
      eveningTime.setHours(18, 0, 0, 0)
      return eveningTime.getTime()
    }

    // Otherwise, schedule based on estimated wait time
    return now + this.calculateEstimatedWaitTime(task, systemState)
  }

  private getAverageExecutionTime(taskType: string): number {
    const history = this.executionHistory.get(taskType)
    if (!history || history.length === 0) {
      return 30000 // Default 30 seconds
    }
    const sum = history.reduce((a, b) => a + b, 0)
    return sum / history.length
  }

  private topologicalSort(tasks: AutonomousTask[]): AutonomousTask[] {
    // Kahn's algorithm for topological sorting
    const inDegree = new Map<string, number>()
    const adjacencyList = new Map<string, string[]>()
    const sorted: AutonomousTask[] = []

    // Initialize
    for (const task of tasks) {
      inDegree.set(task.id, 0)
      adjacencyList.set(task.id, [])
    }

    // Build adjacency list
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        adjacencyList.get(depId)?.push(task.id)
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1)
      }
    }

    // Start with nodes that have no dependencies
    const queue: string[] = []
    for (const [taskId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(taskId)
      }
    }

    // Process nodes
    while (queue.length > 0) {
      const taskId = queue.shift()!
      const task = tasks.find(t => t.id === taskId)
      if (task) {
        sorted.push(task)
      }

      for (const neighborId of adjacencyList.get(taskId) || []) {
        inDegree.set(neighborId, (inDegree.get(neighborId) || 0) - 1)
        if (inDegree.get(neighborId) === 0) {
          queue.push(neighborId)
        }
      }
    }

    return sorted
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  async getQueueStatus(): Promise<{
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
  }> {
    if (!this.queue) {
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      }
    }

    const counts = await this.queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
    return counts as {
      waiting: number
      active: number
      completed: number
      failed: number
      delayed: number
    }
  }

  addCustomStrategy(name: string, strategy: SchedulingStrategy): void {
    this.schedulingStrategies.set(name, strategy)
  }

  removeStrategy(name: string): void {
    this.schedulingStrategies.delete(name)
  }

  getSchedulingStrategies(): SchedulingStrategy[] {
    return Array.from(this.schedulingStrategies.values())
  }
}

// Global singleton instance
const intelligentScheduler = new IntelligentScheduler()

export { IntelligentScheduler, intelligentScheduler }
