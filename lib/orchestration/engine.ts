import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { z } from "zod"

export const TaskState = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "paused",
  "retrying"
])
export type TaskState = z.infer<typeof TaskState>

export const TaskPriority = z.enum(["critical", "high", "medium", "low"])
export type TaskPriority = z.infer<typeof TaskPriority>

export const ExecutionStrategy = z.enum([
  "sequential",
  "parallel",
  "pipeline",
  "conditional",
  "scheduled"
])
export type ExecutionStrategy = z.infer<typeof ExecutionStrategy>

export const OrchestratedTask = z.object({
  id: z.string().min(1),
  operationId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  priority: TaskPriority,
  strategy: ExecutionStrategy,
  state: TaskState.default("queued"),
  config: z.record(z.string(), z.any()).default({}),
  dependencies: z.array(z.string()).default([]),
  conditions: z.array(z.object({
    type: z.enum(["task", "time", "external", "manual"]),
    operator: z.enum(["equals", "greater-than", "less-than", "contains"]),
    value: z.any()
  })).default([]),
  targets: z.array(z.string()).default([]),
  timeout: z.number().int().min(1000).default(300000), // 5 minutes default
  retryPolicy: z.object({
    maxAttempts: z.number().int().min(0).default(3),
    backoffMultiplier: z.number().min(1).default(2),
    initialDelay: z.number().int().min(100).default(1000)
  }).default({ 
    maxAttempts: 3,
    backoffMultiplier: 2,
    initialDelay: 1000
  }),
  metadata: z.record(z.string(), z.any()).default({}),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  scheduledAt: z.number().int().optional(),
  startedAt: z.number().int().optional(),
  completedAt: z.number().int().optional(),
  attempts: z.number().int().default(0),
  result: z.any().nullable().default(null),
  error: z.string().nullable().default(null),
  logs: z.array(z.string()).default([])
})
export type OrchestratedTask = z.infer<typeof OrchestratedTask>

export const WorkflowDefinition = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  tasks: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
    config: z.record(z.string(), z.any()).default({}),
    dependencies: z.array(z.string()).default([]),
    conditions: z.array(z.any()).default([])
  })),
  triggers: z.array(z.object({
    type: z.enum(["manual", "schedule", "event", "webhook"]),
    config: z.record(z.string(), z.any()).default({})
  })).default([]),
  variables: z.record(z.string(), z.any()).default({}),
  errorHandling: z.object({
    strategy: z.enum(["stop", "continue", "retry", "fallback"]).default("stop"),
    maxRetries: z.number().int().default(3),
    fallbackTask: z.string().optional()
  }).default({ 
    strategy: "stop",
    maxRetries: 3
  })
})
export type WorkflowDefinition = z.infer<typeof WorkflowDefinition>

export interface TaskExecution {
  taskId: string
  executor: string
  startTime: number
  endTime?: number
  status: TaskState
  result?: any
  error?: string
  logs: string[]
}

export interface WorkflowExecution {
  id: string
  workflowId: string
  state: TaskState
  startTime: number
  endTime?: number
  tasks: Map<string, TaskExecution>
  variables: Record<string, any>
  error?: string
}

export class TaskOrchestrationEngine extends EventEmitter {
  private tasks: Map<string, OrchestratedTask> = new Map()
  private workflows: Map<string, WorkflowDefinition> = new Map()
  private executions: Map<string, WorkflowExecution> = new Map()
  private executors: Map<string, TaskExecutor> = new Map()
  private scheduledTasks: Map<string, NodeJS.Timeout> = new Map()
  private isRunning = false
  private processingTimer?: NodeJS.Timeout

  constructor() {
    super()
    this.startProcessing()
  }

  /**
   * Register a task executor
   */
  registerExecutor(type: string, executor: TaskExecutor): void {
    this.executors.set(type, executor)
    this.emit("executorRegistered", { type })
  }

  /**
   * Create and submit a task
   */
  async submitTask(task: Omit<OrchestratedTask, "id" | "createdAt" | "updatedAt" | "attempts">): Promise<string> {
    const orchestratedTask: OrchestratedTask = {
      id: randomUUID(),
      ...task,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attempts: 0
    }

    this.tasks.set(orchestratedTask.id, orchestratedTask)
    this.emit("taskSubmitted", orchestratedTask)

    return orchestratedTask.id
  }

  /**
   * Submit a workflow for execution
   */
  async submitWorkflow(workflow: WorkflowDefinition, variables: Record<string, any> = {}): Promise<string> {
    const executionId = randomUUID()
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: workflow.id,
      state: "queued",
      startTime: Date.now(),
      tasks: new Map(),
      variables: { ...workflow.variables, ...variables }
    }

    this.executions.set(executionId, execution)
    this.emit("workflowSubmitted", { workflow, execution })

    // Create workflow tasks
    for (const taskDef of workflow.tasks) {
      const task: OrchestratedTask = {
        id: randomUUID(),
        operationId: executionId,
        name: taskDef.name,
        type: taskDef.type,
        priority: "medium",
        strategy: "sequential",
        state: "queued" as const,
        dependencies: taskDef.dependencies,
        conditions: taskDef.conditions,
        targets: [],
        timeout: 300000,
        retryPolicy: {
          maxAttempts: 3,
          backoffMultiplier: 2,
          initialDelay: 1000
        },
        config: taskDef.config,
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        attempts: 0,
        result: null,
        error: null,
        logs: []
      }

      this.tasks.set(task.id, task)
      execution.tasks.set(taskDef.id, {
        taskId: task.id,
        executor: taskDef.type,
        startTime: 0,
        status: "queued",
        logs: []
      })
    }

    return executionId
  }

  /**
   * Start processing tasks
   */
  private startProcessing(): void {
    this.isRunning = true
    this.processingTimer = setInterval(() => {
      this.processTasks()
    }, 1000)
  }

  /**
   * Process queued tasks
   */
  private async processTasks(): Promise<void> {
    if (!this.isRunning) return

    const readyTasks = this.getReadyTasks()
    
    for (const task of readyTasks) {
      if (this.canExecuteTask(task)) {
        await this.executeTask(task)
      }
    }
  }

  /**
   * Get tasks ready for execution
   */
  private getReadyTasks(): OrchestratedTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.state === "queued")
      .filter(task => this.areDependenciesMet(task))
      .filter(task => this.areConditionsMet(task))
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      })
  }

  /**
   * Check if task dependencies are met
   */
  private areDependenciesMet(task: OrchestratedTask): boolean {
    return task.dependencies.every(depId => {
      const depTask = this.tasks.get(depId)
      return depTask && depTask.state === "completed"
    })
  }

  /**
   * Check if task conditions are met
   */
  private areConditionsMet(task: OrchestratedTask): boolean {
    return task.conditions.every(condition => {
      switch (condition.type) {
        case "time":
          return Date.now() >= condition.value
        case "task":
          const depTask = this.tasks.get(condition.value)
          return depTask && depTask.state === "completed"
        case "external":
          // Check external condition
          return true // Implementation would check external systems
        case "manual":
          // Manual condition
          return false // Implementation would check manual triggers
        default:
          return true
      }
    })
  }

  /**
   * Check if task can be executed
   */
  private canExecuteTask(task: OrchestratedTask): boolean {
    const executor = this.executors.get(task.type)
    return executor !== undefined && executor.canExecute(task)
  }

  /**
   * Execute a task
   */
  private async executeTask(task: OrchestratedTask): Promise<void> {
    const executor = this.executors.get(task.type)
    if (!executor) {
      this.markTaskFailed(task.id, `No executor found for type: ${task.type}`)
      return
    }

    // Update task state
    task.state = "running"
    task.startedAt = Date.now()
    task.updatedAt = Date.now()
    task.attempts++
    task.logs.push(`Task execution started at ${new Date().toISOString()}`)

    this.emit("taskStarted", task)

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      this.markTaskFailed(task.id, "Task execution timed out")
    }, task.timeout)

    try {
      const result = await executor.execute(task)
      clearTimeout(timeoutHandle)

      task.state = "completed"
      task.completedAt = Date.now()
      task.updatedAt = Date.now()
      task.result = result
      task.logs.push(`Task completed successfully at ${new Date().toISOString()}`)

      this.emit("taskCompleted", task)

      // Handle workflow execution
      this.updateWorkflowExecution(task)

    } catch (error) {
      clearTimeout(timeoutHandle)
      await this.handleTaskFailure(task, error)
    }
  }

  /**
   * Handle task failure
   */
  private async handleTaskFailure(task: OrchestratedTask, error: any): Promise<void> {
    task.error = error instanceof Error ? error.message : "Unknown error"
    task.logs.push(`Task failed: ${task.error}`)

    if (task.attempts < task.retryPolicy.maxAttempts) {
      // Schedule retry
      task.state = "retrying"
      const delay = task.retryPolicy.initialDelay * Math.pow(task.retryPolicy.backoffMultiplier, task.attempts - 1)
      
      task.logs.push(`Scheduling retry in ${delay}ms (attempt ${task.attempts + 1}/${task.retryPolicy.maxAttempts})`)
      
      setTimeout(() => {
        task.state = "queued"
        task.updatedAt = Date.now()
        this.emit("taskRetryScheduled", task)
      }, delay)

    } else {
      this.markTaskFailed(task.id, `Max retry attempts exceeded: ${task.error}`)
    }
  }

  /**
   * Mark task as failed
   */
  private markTaskFailed(taskId: string, error: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.state = "failed"
    task.completedAt = Date.now()
    task.updatedAt = Date.now()
    task.error = error
    task.logs.push(`Task failed: ${error}`)

    this.emit("taskFailed", task)
    this.updateWorkflowExecution(task)
  }

  /**
   * Update workflow execution
   */
  private updateWorkflowExecution(task: OrchestratedTask): void {
    for (const execution of this.executions.values()) {
      if (execution.workflowId === task.operationId) {
        const taskExec = Array.from(execution.tasks.values())
          .find(t => t.taskId === task.id)
        
        if (taskExec) {
          taskExec.status = task.state
          taskExec.endTime = Date.now()
          taskExec.result = task.result
          taskExec.error = task.error || undefined
        }

        // Check if workflow is complete
        this.checkWorkflowExecution(execution)
      }
    }
  }

  /**
   * Check if workflow execution is complete
   */
  private checkWorkflowExecution(execution: WorkflowExecution): void {
    const tasks = Array.from(execution.tasks.values())
    const allCompleted = tasks.every(t => 
      t.status === "completed" || t.status === "failed"
    )

    if (allCompleted) {
      execution.state = tasks.some(t => t.status === "failed") ? "failed" : "completed"
      execution.endTime = Date.now()

      this.emit("workflowCompleted", execution)
    }
  }

  /**
   * Schedule a task for future execution
   */
  scheduleTask(taskId: string, scheduledTime: number): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.scheduledAt = scheduledTime
    task.state = "queued"

    const delay = Math.max(0, scheduledTime - Date.now())
    const timer = setTimeout(() => {
      this.scheduledTasks.delete(taskId)
      task.state = "queued"
      this.emit("taskScheduled", task)
    }, delay)

    this.scheduledTasks.set(taskId, timer)
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.state === "completed" || task.state === "failed") {
      return false
    }

    // Clear scheduled timer if exists
    const timer = this.scheduledTasks.get(taskId)
    if (timer) {
      clearTimeout(timer)
      this.scheduledTasks.delete(taskId)
    }

    task.state = "cancelled"
    task.completedAt = Date.now()
    task.updatedAt = Date.now()
    task.logs.push(`Task cancelled at ${new Date().toISOString()}`)

    this.emit("taskCancelled", task)
    return true
  }

  /**
   * Pause a task
   */
  pauseTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.state !== "running") {
      return false
    }

    task.state = "paused"
    task.updatedAt = Date.now()
    task.logs.push(`Task paused at ${new Date().toISOString()}`)

    this.emit("taskPaused", task)
    return true
  }

  /**
   * Resume a paused task
   */
  resumeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.state !== "paused") {
      return false
    }

    task.state = "queued"
    task.updatedAt = Date.now()
    task.logs.push(`Task resumed at ${new Date().toISOString()}`)

    this.emit("taskResumed", task)
    return true
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): OrchestratedTask | null {
    return this.tasks.get(taskId) || null
  }

  /**
   * Get all tasks
   */
  getTasks(filter?: { state?: TaskState; operationId?: string }): OrchestratedTask[] {
    let tasks = Array.from(this.tasks.values())

    if (filter) {
      if (filter.state) {
        tasks = tasks.filter(task => task.state === filter.state)
      }
      if (filter.operationId) {
        tasks = tasks.filter(task => task.operationId === filter.operationId)
      }
    }

    return tasks.sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * Get workflow execution
   */
  getWorkflowExecution(executionId: string): WorkflowExecution | null {
    return this.executions.get(executionId) || null
  }

  /**
   * Get all workflow executions
   */
  getWorkflowExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values())
      .sort((a, b) => b.startTime - a.startTime)
  }

  /**
   * Get system statistics
   */
  getStatistics(): {
    totalTasks: number
    tasksByState: Record<TaskState, number>
    totalExecutions: number
    executionsByState: Record<TaskState, number>
    activeExecutors: number
  } {
    const tasks = Array.from(this.tasks.values())
    const executions = Array.from(this.executions.values())

    const tasksByState = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      paused: 0,
      retrying: 0
    } as Record<TaskState, number>

    tasks.forEach(task => {
      tasksByState[task.state]++
    })

    const executionsByState = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      paused: 0,
      retrying: 0
    } as Record<TaskState, number>

    executions.forEach(execution => {
      executionsByState[execution.state]++
    })

    return {
      totalTasks: tasks.length,
      tasksByState,
      totalExecutions: executions.length,
      executionsByState,
      activeExecutors: this.executors.size
    }
  }

  /**
   * Cleanup old tasks and executions
   */
  cleanup(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const now = Date.now()

    // Clean up old tasks
    for (const [id, task] of this.tasks.entries()) {
      if (task.createdAt < now - maxAge && 
          (task.state === "completed" || task.state === "failed" || task.state === "cancelled")) {
        this.tasks.delete(id)
      }
    }

    // Clean up old executions
    for (const [id, execution] of this.executions.entries()) {
      if (execution.startTime < now - maxAge && 
          (execution.state === "completed" || execution.state === "failed")) {
        this.executions.delete(id)
      }
    }
  }

  /**
   * Stop the orchestration engine
   */
  stop(): void {
    this.isRunning = false
    
    if (this.processingTimer) {
      clearInterval(this.processingTimer)
    }

    // Clear all scheduled tasks
    for (const timer of this.scheduledTasks.values()) {
      clearTimeout(timer)
    }
    this.scheduledTasks.clear()

    this.removeAllListeners()
  }
}

/**
 * Task executor interface
 */
export interface TaskExecutor {
  canExecute(task: OrchestratedTask): boolean
  execute(task: OrchestratedTask): Promise<any>
}

/**
 * Example executor for implant tasks
 */
export class ImplantTaskExecutor implements TaskExecutor {
  canExecute(task: OrchestratedTask): boolean {
    return task.type.startsWith("implant-")
  }

  async execute(task: OrchestratedTask): Promise<any> {
    switch (task.type) {
      case "implant-deploy":
        return this.deployImplant(task)
      case "implant-command":
        return this.executeCommand(task)
      case "implant-update":
        return this.updateImplant(task)
      default:
        throw new Error(`Unknown implant task type: ${task.type}`)
    }
  }

  private async deployImplant(task: OrchestratedTask): Promise<any> {
    // Implementation would deploy implant to targets
    return { deployed: true, targets: task.targets }
  }

  private async executeCommand(task: OrchestratedTask): Promise<any> {
    // Implementation would execute command on implants
    return { executed: true, results: [] }
  }

  private async updateImplant(task: OrchestratedTask): Promise<any> {
    // Implementation would update implant configuration
    return { updated: true, targets: task.targets }
  }
}

/**
 * Example executor for reconnaissance tasks
 */
export class ReconTaskExecutor implements TaskExecutor {
  canExecute(task: OrchestratedTask): boolean {
    return task.type.startsWith("recon-")
  }

  async execute(task: OrchestratedTask): Promise<any> {
    switch (task.type) {
      case "recon-scan":
        return this.performScan(task)
      case "recon-discover":
        return this.performDiscovery(task)
      default:
        throw new Error(`Unknown recon task type: ${task.type}`)
    }
  }

  private async performScan(task: OrchestratedTask): Promise<any> {
    // Implementation would perform network scan
    return { scanned: true, hosts: [] }
  }

  private async performDiscovery(task: OrchestratedTask): Promise<any> {
    // Implementation would perform service discovery
    return { discovered: true, services: [] }
  }
}