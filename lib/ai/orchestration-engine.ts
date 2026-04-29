import { z } from 'zod'
import { randomUUID } from 'crypto'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const TaskPriority = z.enum(['critical', 'high', 'medium', 'low'])
export type TaskPriority = z.infer<typeof TaskPriority>

export const TaskStatus = z.enum(['pending', 'scheduled', 'running', 'completed', 'failed', 'cancelled'])
export type TaskStatus = z.infer<typeof TaskStatus>

export const TaskType = z.enum([
  'domain_enumeration',
  'threat_analysis',
  'dns_enumeration', 
  'whois_lookup',
  'subdomain_discovery',
  'vulnerability_scan',
  'correlation_analysis',
  'report_generation',
])
export type TaskType = z.infer<typeof TaskType>

export interface AutonomousTask {
  id: string
  type: TaskType
  priority: TaskPriority
  status: TaskStatus
  target: string
  parameters: Record<string, unknown>
  dependencies: string[]
  estimatedDuration: number
  actualDuration?: number
  createdAt: number
  scheduledAt?: number
  startedAt?: number
  completedAt?: number
  result?: unknown
  error?: string
  aiDecisions: string[]
  optimizationScore: number
}

export interface SystemMetrics {
  cpuUsage: number
  memoryUsage: number
  apiRateLimits: Record<string, { remaining: number; resetTime: number }>
  cacheHitRate: number
  averageResponseTime: number
  activeTasks: number
  queuedTasks: number
  errorRate: number
}

export interface OptimizationDecision {
  type: 'cache_ttl_adjustment' | 'rate_limit_adjustment' | 'task_prioritization' | 'resource_allocation'
  confidence: number
  reasoning: string
  action: Record<string, unknown>
  expectedImpact: string
}

/* ------------------------------------------------------------------ */
/*  AI Orchestration Engine                                            */
/* ------------------------------------------------------------------ */

class AIOrchestrationEngine {
  private tasks: Map<string, AutonomousTask>
  private metrics: SystemMetrics
  private optimizationHistory: OptimizationDecision[]
  private learningEnabled: boolean
  private performanceBaseline: Map<string, number>

  constructor() {
    this.tasks = new Map()
    this.metrics = this.initializeMetrics()
    this.optimizationHistory = []
    this.learningEnabled = true
    this.performanceBaseline = new Map()
  }

  private initializeMetrics(): SystemMetrics {
    return {
      cpuUsage: 0,
      memoryUsage: 0,
      apiRateLimits: {},
      cacheHitRate: 0,
      averageResponseTime: 0,
      activeTasks: 0,
      queuedTasks: 0,
      errorRate: 0,
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Autonomous Task Management                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Create an autonomous task with AI-driven parameter optimization
   */
  async createAutonomousTask(
    type: TaskType,
    target: string,
    baseParameters: Record<string, unknown> = {}
  ): Promise<AutonomousTask> {
    const task: AutonomousTask = {
      id: randomUUID(),
      type,
      priority: await this.calculatePriority(type, target),
      status: 'pending',
      target,
      parameters: await this.optimizeParameters(type, target, baseParameters),
      dependencies: [],
      estimatedDuration: await this.estimateDuration(type, target),
      createdAt: Date.now(),
      aiDecisions: [],
      optimizationScore: 0,
    }

    // AI decision: task creation optimization
    const decision = await this.makeOptimizationDecision('task_prioritization', {
      taskType: type,
      target,
      currentSystemLoad: this.metrics,
    })
    task.aiDecisions.push(decision.reasoning)
    task.optimizationScore = decision.confidence

    this.tasks.set(task.id, task)
    return task
  }

  /**
   * Execute autonomous task with self-healing capabilities
   */
  async executeAutonomousTask(taskId: string): Promise<AutonomousTask> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    task.status = 'running'
    task.startedAt = Date.now()

    try {
      // AI decision: execution strategy
      const executionStrategy = await this.determineExecutionStrategy(task)
      task.aiDecisions.push(`Execution strategy: ${executionStrategy.reasoning}`)

      // Execute with automatic retries and fallbacks
      const result = await this.executeWithSelfHealing(task, executionStrategy.action)
      
      task.result = result
      task.status = 'completed'
      task.completedAt = Date.now()
      task.actualDuration = task.completedAt - task.startedAt!

      // Learn from successful execution
      await this.learnFromSuccess(task)

      return task
    } catch (error) {
      // AI decision: error recovery
      const recoveryDecision = await this.determineErrorRecovery(task, error)
      task.aiDecisions.push(`Error recovery: ${recoveryDecision.reasoning}`)

      if (recoveryDecision.action.retry) {
        return this.executeAutonomousTask(taskId)
      }

      task.status = 'failed'
      task.error = error instanceof Error ? error.message : String(error)
      task.completedAt = Date.now()
      
      // Learn from failure
      await this.learnFromFailure(task, error)

      return task
    }
  }

  /**
   * Execute task with self-healing capabilities
   */
  private async executeWithSelfHealing(
    task: AutonomousTask,
    strategy: Record<string, unknown>
  ): Promise<unknown> {
    const maxRetries = (strategy.maxRetries as number) || 3
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeTaskImplementation(task)
      } catch (error) {
        lastError = error as Error
        
        // AI decision: retry analysis
        if (attempt < maxRetries) {
          const shouldRetry = await this.analyzeRetryWorthiness(task, error, attempt)
          if (!shouldRetry.shouldRetry) {
            throw error
          }

          // Adaptive backoff
          const backoffTime = this.calculateAdaptiveBackoff(attempt, shouldRetry.confidence)
          await new Promise(resolve => setTimeout(resolve, backoffTime))
        }
      }
    }

    throw lastError
  }

  /**
   * Execute specific task implementation
   */
  private async executeTaskImplementation(task: AutonomousTask): Promise<unknown> {
    switch (task.type) {
      case 'domain_enumeration':
        return this.executeDomainEnumeration(task)
      case 'threat_analysis':
        return this.executeThreatAnalysis(task)
      case 'dns_enumeration':
        return this.executeDnsEnumeration(task)
      case 'whois_lookup':
        return this.executeWhoisLookup(task)
      case 'subdomain_discovery':
        return this.executeSubdomainDiscovery(task)
      case 'correlation_analysis':
        return this.executeCorrelationAnalysis(task)
      default:
        throw new Error(`Unknown task type: ${task.type}`)
    }
  }

  /* ------------------------------------------------------------------ */
  /*  AI-Powered Decision Making                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Calculate optimal task priority based on multiple factors
   */
  private async calculatePriority(type: TaskType, target: string): Promise<TaskPriority> {
    // AI-driven priority calculation
    const factors = {
      targetImportance: await this.assessTargetImportance(target),
      typeCriticality: this.getTypeCriticality(type),
      systemLoad: this.metrics.cpuUsage,
      timeOfDay: new Date().getHours(),
      historicalSuccess: await this.getHistoricalSuccessRate(type),
    }

    // Simple heuristic (can be enhanced with LLM)
    const score = 
      factors.targetImportance * 0.3 +
      factors.typeCriticality * 0.3 +
      (1 - factors.systemLoad) * 0.2 +
      factors.historicalSuccess * 0.2

    if (score > 0.8) return 'critical'
    if (score > 0.6) return 'high'
    if (score > 0.4) return 'medium'
    return 'low'
  }

  /**
   * Optimize task parameters based on historical performance
   */
  private async optimizeParameters(
    type: TaskType,
    target: string,
    baseParameters: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const optimized = { ...baseParameters }

    // AI-driven parameter optimization
    switch (type) {
      case 'domain_enumeration':
        optimized.includeCrtSh = await this.shouldIncludeCrtSh(target)
        optimized.includeDnsEnum = true
        optimized.includeWhois = await this.shouldIncludeWhois(target)
        optimized.cacheStrategy = await this.determineCacheStrategy(type, target)
        break
      case 'threat_analysis':
        optimized.sources = await this.selectOptimalSources(target)
        optimized.depth = await this.determineAnalysisDepth(target)
        optimized.correlationEnabled = true
        break
    }

    return optimized
  }

  /**
   * Estimate task duration based on historical data
   */
  private async estimateDuration(type: TaskType, target: string): Promise<number> {
    const baselineDurations: Record<TaskType, number> = {
      domain_enumeration: 15000,
      threat_analysis: 5000,
      dns_enumeration: 3000,
      whois_lookup: 5000,
      subdomain_discovery: 10000,
      vulnerability_scan: 60000,
      correlation_analysis: 8000,
      report_generation: 120000,
    }

    const historicalAvg = this.performanceBaseline.get(`${type}_duration`)
    const baseline = baselineDurations[type]

    // Adjust based on target complexity
    const complexityMultiplier = await this.assessTargetComplexity(target)
    
    return historicalAvg 
      ? historicalAvg * complexityMultiplier
      : baseline * complexityMultiplier
  }

  /**
   * Make AI-powered optimization decision
   */
  async makeOptimizationDecision(
    type: OptimizationDecision['type'],
    context: Record<string, unknown>
  ): Promise<OptimizationDecision> {
    // This would typically use LLM, but for now uses heuristic approach
    const decision: OptimizationDecision = {
      type,
      confidence: 0.8,
      reasoning: `Optimization based on system metrics and historical patterns`,
      action: {},
      expectedImpact: 'Improved performance and resource utilization',
    }

    switch (type) {
      case 'cache_ttl_adjustment':
        decision.action = await this.calculateOptimalCacheTtl(context)
        break
      case 'rate_limit_adjustment':
        decision.action = await this.calculateOptimalRateLimits(context)
        break
      case 'task_prioritization':
        decision.action = await this.calculateOptimalTaskOrder(context)
        break
      case 'resource_allocation':
        decision.action = await this.calculateOptimalResourceAllocation(context)
        break
    }

    this.optimizationHistory.push(decision)
    return decision
  }

  /* ------------------------------------------------------------------ */
  /*  Self-Healing & Error Recovery                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Determine optimal execution strategy
   */
  private async determineExecutionStrategy(
    task: AutonomousTask
  ): Promise<{ reasoning: string; action: Record<string, unknown> }> {
    void task
    const systemLoad = this.metrics.cpuUsage
    const errorRate = this.metrics.errorRate

    if (systemLoad > 80 || errorRate > 10) {
      return {
        reasoning: 'High system load or error rate detected, using conservative strategy',
        action: {
          maxRetries: 1,
          timeoutMultiplier: 2,
          fallbackEnabled: true,
        },
      }
    }

    return {
      reasoning: 'Normal system conditions, using standard execution strategy',
      action: {
        maxRetries: 3,
        timeoutMultiplier: 1,
        fallbackEnabled: true,
      },
    }
  }

  /**
   * Determine error recovery strategy
   */
  private async determineErrorRecovery(
    task: AutonomousTask,
    error: unknown
  ): Promise<{ reasoning: string; action: { retry: boolean; fallback?: string } }> {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('rate limit')) {
      return {
        reasoning: 'Rate limit error, will retry with exponential backoff',
        action: { retry: true },
      }
    }

    if (errorMessage.includes('timeout')) {
      return {
        reasoning: 'Timeout error, will retry with increased timeout',
        action: { retry: true },
      }
    }

    if (errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
      return {
        reasoning: 'Authentication error, requires human intervention',
        action: { retry: false },
      }
    }

    // Default: retry for transient errors
    return {
      reasoning: 'Transient error detected, will retry',
      action: { retry: true },
    }
  }

  /**
   * Analyze if retry is worth attempting
   */
  private async analyzeRetryWorthiness(
    task: AutonomousTask,
    error: unknown,
    attempt: number
  ): Promise<{ shouldRetry: boolean; confidence: number }> {
    void task
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Don't retry authentication errors
    if (errorMessage.includes('auth') || errorMessage.includes('unauthorized')) {
      return { shouldRetry: false, confidence: 0.95 }
    }

    // Don't retry after many attempts
    if (attempt >= 3) {
      return { shouldRetry: false, confidence: 0.9 }
    }

    // Rate limit errors are worth retrying
    if (errorMessage.includes('rate limit')) {
      return { shouldRetry: true, confidence: 0.9 }
    }

    // Network errors are worth retrying
    if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
      return { shouldRetry: true, confidence: 0.8 }
    }

    return { shouldRetry: true, confidence: 0.6 }
  }

  /**
   * Calculate adaptive backoff time
   */
  private calculateAdaptiveBackoff(attempt: number, confidence: number): number {
    void confidence
    const baseBackoff = 1000 * Math.pow(2, attempt)
    const jitter = Math.random() * 500
    return Math.min(baseBackoff + jitter, 30000) // Max 30 seconds
  }

  /* ------------------------------------------------------------------ */
  /*  Learning & Adaptation                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Learn from successful task execution
   */
  private async learnFromSuccess(task: AutonomousTask): Promise<void> {
    if (!this.learningEnabled) return

    // Update performance baseline
    if (task.actualDuration) {
      const key = `${task.type}_duration`
      const currentAvg = this.performanceBaseline.get(key) || 
        await this.estimateDuration(task.type, task.target)
      
      // Exponential moving average
      const newAvg = currentAvg * 0.8 + task.actualDuration * 0.2
      this.performanceBaseline.set(key, newAvg)
    }

    // Update success rate
    const successKey = `${task.type}_success`
    const currentRate = this.performanceBaseline.get(successKey) || 0.5
    const newRate = currentRate * 0.9 + 1.0 * 0.1
    this.performanceBaseline.set(successKey, newRate)
  }

  /**
   * Learn from failed task execution
   */
  private async learnFromFailure(task: AutonomousTask, error: unknown): Promise<void> {
    if (!this.learningEnabled) return

    // Update success rate
    const successKey = `${task.type}_success`
    const currentRate = this.performanceBaseline.get(successKey) || 0.5
    const newRate = currentRate * 0.9 + 0.0 * 0.1
    this.performanceBaseline.set(successKey, newRate)

    // Analyze failure patterns
    const errorMessage = error instanceof Error ? error.message : String(error)
    const failureKey = `${task.type}_failure_${errorMessage.substring(0, 50)}`
    const currentFailures = this.performanceBaseline.get(failureKey) || 0
    this.performanceBaseline.set(failureKey, currentFailures + 1)
  }

  /* ------------------------------------------------------------------ */
  /*  System Monitoring & Optimization                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Update system metrics
   */
  updateMetrics(newMetrics: Partial<SystemMetrics>): void {
    this.metrics = { ...this.metrics, ...newMetrics }
  }

  /**
   * Perform autonomous system optimization
   */
  async performAutonomousOptimization(): Promise<OptimizationDecision[]> {
    const decisions: OptimizationDecision[] = []

    // Analyze current system state
    const optimizationOpportunities = await this.identifyOptimizationOpportunities()

    for (const opportunity of optimizationOpportunities) {
      const decision = await this.makeOptimizationDecision(opportunity.type, opportunity.context)
      decisions.push(decision)
      
      // Apply optimization
      await this.applyOptimization(decision)
    }

    return decisions
  }

  /**
   * Identify optimization opportunities
   */
  private async identifyOptimizationOpportunities(): Promise<
    Array<{ type: OptimizationDecision['type']; context: Record<string, unknown> }>
  > {
    const opportunities: Array<{ type: OptimizationDecision['type']; context: Record<string, unknown> }> = []

    // Check cache hit rate
    if (this.metrics.cacheHitRate < 0.5) {
      opportunities.push({
        type: 'cache_ttl_adjustment',
        context: { currentHitRate: this.metrics.cacheHitRate },
      })
    }

    // Check API rate limit utilization
    for (const [api, limits] of Object.entries(this.metrics.apiRateLimits)) {
      if (limits.remaining < limits.resetTime * 0.2) {
        opportunities.push({
          type: 'rate_limit_adjustment',
          context: { api, remaining: limits.remaining },
        })
      }
    }

    // Check task queue length
    if (this.metrics.queuedTasks > 10) {
      opportunities.push({
        type: 'task_prioritization',
        context: { queueLength: this.metrics.queuedTasks },
      })
    }

    return opportunities
  }

  /**
   * Apply optimization decision
   */
  private async applyOptimization(decision: OptimizationDecision): Promise<void> {
    // Implementation would depend on specific optimization type
    console.log(`Applying optimization: ${decision.type}`)
    console.log(`Reasoning: ${decision.reasoning}`)
    console.log(`Action: ${JSON.stringify(decision.action)}`)
  }

  /* ------------------------------------------------------------------ */
  /*  Task-Specific Implementations                                     */
  /* ------------------------------------------------------------------ */

  private async executeDomainEnumeration(task: AutonomousTask): Promise<unknown> {
    // Import dynamically to avoid circular dependencies
    const { enumerateDomain } = await import('../osint/domain-enum')
    return enumerateDomain(task.target, task.parameters)
  }

  private async executeThreatAnalysis(task: AutonomousTask): Promise<unknown> {
    // Implementation would call threat intel APIs
    return { analyzed: true, target: task.target }
  }

  private async executeDnsEnumeration(task: AutonomousTask): Promise<unknown> {
    const { enumerateDnsRecords } = await import('../osint/domain-enum')
    return enumerateDnsRecords(task.target)
  }

  private async executeWhoisLookup(task: AutonomousTask): Promise<unknown> {
    const { whoisLookup } = await import('../osint/domain-enum')
    return whoisLookup(task.target)
  }

  private async executeSubdomainDiscovery(task: AutonomousTask): Promise<unknown> {
    const { getSubdomainsFromCrtSh } = await import('../osint/domain-enum')
    return getSubdomainsFromCrtSh(task.target)
  }

  private async executeCorrelationAnalysis(task: AutonomousTask): Promise<unknown> {
    void task
    // Implementation would correlate data from multiple sources
    return { correlated: true, insights: [] }
  }

  /* ------------------------------------------------------------------ */
  /*  Helper Methods                                                    */
  /* ------------------------------------------------------------------ */

  private async assessTargetImportance(target: string): Promise<number> {
    // Heuristic based on target characteristics
    if (target.includes('.gov') || target.includes('.mil')) return 0.9
    if (target.includes('.edu')) return 0.7
    if (target.includes('.com')) return 0.5
    return 0.3
  }

  private getTypeCriticality(type: TaskType): number {
    const criticality: Record<TaskType, number> = {
      threat_analysis: 0.9,
      domain_enumeration: 0.7,
      vulnerability_scan: 0.8,
      correlation_analysis: 0.6,
      dns_enumeration: 0.4,
      whois_lookup: 0.3,
      subdomain_discovery: 0.5,
      report_generation: 0.2,
    }
    return criticality[type]
  }

  private async getHistoricalSuccessRate(type: TaskType): Promise<number> {
    return this.performanceBaseline.get(`${type}_success`) || 0.8
  }

  private async shouldIncludeCrtSh(target: string): Promise<boolean> {
    void target
    return true // Default to true, could be made smarter
  }

  private async shouldIncludeWhois(target: string): Promise<boolean> {
    void target
    return true // Default to true, could be made smarter
  }

  private async determineCacheStrategy(type: TaskType, target: string): Promise<string> {
    void type
    void target
    return 'aggressive' // Could be optimized based on usage patterns
  }

  private async selectOptimalSources(target: string): Promise<string[]> {
    void target
    return ['virustotal', 'alienvault'] // Could be optimized based on target
  }

  private async determineAnalysisDepth(target: string): Promise<string> {
    void target
    return 'standard' // Could be optimized based on target importance
  }

  private async assessTargetComplexity(target: string): Promise<number> {
    void target
    // Simple heuristic based on domain characteristics
    return 1.0 // Could be enhanced with ML model
  }

  private async calculateOptimalCacheTtl(context: Record<string, unknown>): Promise<Record<string, unknown>> {
    void context
    return { ttl: 1800 } // 30 minutes default
  }

  private async calculateOptimalRateLimits(context: Record<string, unknown>): Promise<Record<string, unknown>> {
    void context
    return { requestsPerMinute: 30 }
  }

  private async calculateOptimalTaskOrder(context: Record<string, unknown>): Promise<Record<string, unknown>> {
    void context
    return { strategy: 'priority_based' }
  }

  private async calculateOptimalResourceAllocation(context: Record<string, unknown>): Promise<Record<string, unknown>> {
    void context
    return { maxConcurrentTasks: 5 }
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  getTask(taskId: string): AutonomousTask | undefined {
    return this.tasks.get(taskId)
  }

  getAllTasks(): AutonomousTask[] {
    return Array.from(this.tasks.values())
  }

  getMetrics(): SystemMetrics {
    return { ...this.metrics }
  }

  getOptimizationHistory(): OptimizationDecision[] {
    return [...this.optimizationHistory]
  }

  setLearningEnabled(enabled: boolean): void {
    this.learningEnabled = enabled
  }
}

// Global singleton instance
const orchestrationEngine = new AIOrchestrationEngine()

export { AIOrchestrationEngine, orchestrationEngine }
