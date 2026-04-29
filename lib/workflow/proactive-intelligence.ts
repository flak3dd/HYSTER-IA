import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface SystemMetrics {
  timestamp: number
  cpuUsage?: number
  memoryUsage?: number
  activeConnections?: number
  errorRate?: number
  responseTime?: number
  throughput?: number
}

interface AnomalyDetection {
  isAnomaly: boolean
  severity: 'low' | 'medium' | 'high'
  type: string
  description: string
  suggestedActions: string[]
  confidence: number
}

interface PredictiveSuggestion {
  type: 'workflow' | 'optimization' | 'preventive' | 'insight'
  priority: 'low' | 'medium' | 'high'
  title: string
  description: string
  suggestedAction: string
  expectedBenefit: string
  confidence: number
  basedOn: string[]
}

interface WorkflowOptimization {
  originalWorkflow: string[]
  optimizedWorkflow: string[]
  improvements: string[]
  timeSaved: number
  riskReduction: string
}

export class ProactiveIntelligence {
  private metricsHistory: SystemMetrics[] = []
  private maxHistorySize = 1000
  private baselineMetrics: SystemMetrics | null = null
  private learningPatterns: Map<string, number> = new Map()

  /**
   * Initialize proactive intelligence system
   */
  async initialize(): Promise<void> {
    await this.establishBaseline()
    await this.loadHistoricalPatterns()
  }

  /**
   * Establish baseline metrics for anomaly detection
   */
  private async establishBaseline(): Promise<void> {
    try {
      // Get recent system metrics to establish baseline
      const recentSessions = await prisma.workflowSession.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        take: 100,
        orderBy: { createdAt: 'desc' }
      })

      if (recentSessions.length > 0) {
        this.baselineMetrics = {
          timestamp: Date.now(),
          errorRate: this.calculateErrorRate(recentSessions),
          responseTime: this.calculateAverageResponseTime(recentSessions),
          throughput: recentSessions.length / 24 // sessions per hour
        }
      }
    } catch (error) {
      console.error('Error establishing baseline:', error)
    }
  }

  /**
   * Load historical patterns for learning
   */
  private async loadHistoricalPatterns(): Promise<void> {
    try {
      const allSessions = await prisma.workflowSession.findMany({
        where: { status: 'completed' },
        take: 500,
        orderBy: { createdAt: 'desc' },
        include: { steps: true }
      })

      // Learn from successful workflows
      for (const session of allSessions) {
        for (const step of session.steps) {
          if (step.functionToExecute) {
            const key = `${step.functionToExecute}_${step.type}`
            this.learningPatterns.set(key, (this.learningPatterns.get(key) || 0) + 1)
          }
        }
      }
    } catch (error) {
      console.error('Error loading historical patterns:', error)
    }
  }

  /**
   * Detect anomalies in system metrics
   */
  detectAnomalies(currentMetrics: SystemMetrics): AnomalyDetection[] {
    const anomalies: AnomalyDetection[] = []

    if (!this.baselineMetrics) {
      return anomalies
    }

    // Check for error rate spikes
    if (currentMetrics.errorRate !== undefined && this.baselineMetrics.errorRate !== undefined) {
      const errorIncrease = (currentMetrics.errorRate - this.baselineMetrics.errorRate) / this.baselineMetrics.errorRate
      if (errorIncrease > 0.5) { // 50% increase
        anomalies.push({
          isAnomaly: true,
          severity: errorIncrease > 1.0 ? 'high' : 'medium',
          type: 'error_rate_spike',
          description: `Error rate increased by ${(errorIncrease * 100).toFixed(1)}% compared to baseline`,
          suggestedActions: [
            'Review recent error logs',
            'Check if any external services are degraded',
            'Consider rolling back recent changes'
          ],
          confidence: Math.min(0.95, errorIncrease)
        })
      }
    }

    // Check for response time degradation
    if (currentMetrics.responseTime !== undefined && this.baselineMetrics.responseTime !== undefined) {
      const responseTimeIncrease = (currentMetrics.responseTime - this.baselineMetrics.responseTime) / this.baselineMetrics.responseTime
      if (responseTimeIncrease > 0.3) { // 30% increase
        anomalies.push({
          isAnomaly: true,
          severity: responseTimeIncrease > 0.8 ? 'high' : 'medium',
          type: 'response_time_degradation',
          description: `Response time increased by ${(responseTimeIncrease * 100).toFixed(1)}% compared to baseline`,
          suggestedActions: [
            'Check system resource utilization',
            'Review database query performance',
            'Analyze network latency'
          ],
          confidence: Math.min(0.9, responseTimeIncrease)
        })
      }
    }

    // Check for unusual throughput patterns
    if (currentMetrics.throughput !== undefined && this.baselineMetrics.throughput !== undefined) {
      const throughputChange = Math.abs(currentMetrics.throughput - this.baselineMetrics.throughput) / this.baselineMetrics.throughput
      if (throughputChange > 0.4) { // 40% deviation
        anomalies.push({
          isAnomaly: true,
          severity: 'low',
          type: 'throughput_anomaly',
          description: `Throughput deviated by ${(throughputChange * 100).toFixed(1)}% from baseline`,
          suggestedActions: [
            'Review traffic patterns',
            'Check for automated scripts or bots',
            'Verify monitoring accuracy'
          ],
          confidence: Math.min(0.85, throughputChange)
        })
      }
    }

    return anomalies
  }

  /**
   * Generate predictive suggestions based on context and patterns
   */
  async generatePredictiveSuggestions(context: {
    currentWorkflow?: string[]
    recentErrors?: string[]
    systemState?: Record<string, unknown>
    userBehavior?: string[]
  }): Promise<PredictiveSuggestion[]> {
    const suggestions: PredictiveSuggestion[] = []

    // Analyze workflow patterns
    if (context.currentWorkflow && context.currentWorkflow.length > 0) {
      const workflowSuggestions = this.analyzeWorkflowPatterns(context.currentWorkflow)
      suggestions.push(...workflowSuggestions)
    }

    // Analyze error patterns
    if (context.recentErrors && context.recentErrors.length > 0) {
      const errorSuggestions = this.analyzeErrorPatterns(context.recentErrors)
      suggestions.push(...errorSuggestions)
    }

    // Analyze system state
    if (context.systemState) {
      const systemSuggestions = this.analyzeSystemState(context.systemState)
      suggestions.push(...systemSuggestions)
    }

    // Analyze user behavior patterns
    if (context.userBehavior) {
      const behaviorSuggestions = this.analyzeUserBehavior(context.userBehavior)
      suggestions.push(...behaviorSuggestions)
    }

    // Sort by priority and confidence
    return suggestions
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
        if (priorityDiff !== 0) return priorityDiff
        return b.confidence - a.confidence
      })
      .slice(0, 5) // Return top 5 suggestions
  }

  /**
   * Analyze workflow patterns for optimization opportunities
   */
  private analyzeWorkflowPatterns(workflow: string[]): PredictiveSuggestion[] {
    const suggestions: PredictiveSuggestion[] = []

    // Check for common inefficient patterns
    if (workflow.includes('check_status') && workflow.includes('list_nodes')) {
      suggestions.push({
        type: 'optimization',
        priority: 'medium',
        title: 'Optimize Status Checks',
        description: 'Detected redundant status checks and node listing in workflow',
        suggestedAction: 'Combine status checks into a single operation or cache results',
        expectedBenefit: 'Reduce execution time by ~30%',
        confidence: 0.75,
        basedOn: ['workflow_pattern_analysis']
      })
    }

    // Check for missing error handling patterns
    if (workflow.length > 3 && !workflow.some(step => step.includes('error') || step.includes('fallback'))) {
      suggestions.push({
        type: 'preventive',
        priority: 'high',
        title: 'Add Error Handling',
        description: 'Complex workflow lacks explicit error handling steps',
        suggestedAction: 'Add error handling and rollback steps for critical operations',
        expectedBenefit: 'Improve reliability and reduce data corruption risk',
        confidence: 0.85,
        basedOn: ['workflow_complexity_analysis']
      })
    }

    // Suggest parallel operations
    const independentOperations = this.findIndependentOperations(workflow)
    if (independentOperations.length >= 2) {
      suggestions.push({
        type: 'optimization',
        priority: 'medium',
        title: 'Parallelize Independent Operations',
        description: `Found ${independentOperations.length} operations that can run in parallel`,
        suggestedAction: `Execute ${independentOperations.join(', ')} in parallel`,
        expectedBenefit: 'Reduce total execution time by ~40%',
        confidence: 0.8,
        basedOn: ['dependency_analysis']
      })
    }

    return suggestions
  }

  /**
   * Analyze error patterns for preventive suggestions
   */
  private analyzeErrorPatterns(errors: string[]): PredictiveSuggestion[] {
    const suggestions: PredictiveSuggestion[] = []
    const errorFrequency: Record<string, number> = {}

    errors.forEach(error => {
      const errorType = this.extractErrorType(error)
      errorFrequency[errorType] = (errorFrequency[errorType] || 0) + 1
    })

    // Check for repeated error types
    for (const [errorType, count] of Object.entries(errorFrequency)) {
      if (count >= 3) {
        suggestions.push({
          type: 'preventive',
          priority: 'high',
          title: `Address Recurring ${errorType}`,
          description: `${errorType} has occurred ${count} times recently`,
          suggestedAction: this.getPreventiveAction(errorType),
          expectedBenefit: 'Reduce error rate and improve system stability',
          confidence: Math.min(0.9, count * 0.15),
          basedOn: ['error_pattern_analysis']
        })
      }
    }

    return suggestions
  }

  /**
   * Analyze system state for optimization opportunities
   */
  private analyzeSystemState(systemState: Record<string, unknown>): PredictiveSuggestion[] {
    const suggestions: PredictiveSuggestion[] = []

    // Check for high memory usage
    if (typeof systemState.memoryUsage === 'number' && systemState.memoryUsage > 80) {
      suggestions.push({
        type: 'preventive',
        priority: 'medium',
        title: 'High Memory Usage Detected',
        description: `Memory usage is at ${systemState.memoryUsage}%`,
        suggestedAction: 'Review memory-intensive operations, consider implementing caching or cleanup',
        expectedBenefit: 'Prevent out-of-memory errors and improve performance',
        confidence: 0.85,
        basedOn: ['resource_monitoring']
      })
    }

    // Check for high CPU usage
    if (typeof systemState.cpuUsage === 'number' && systemState.cpuUsage > 75) {
      suggestions.push({
        type: 'optimization',
        priority: 'medium',
        title: 'High CPU Usage Detected',
        description: `CPU usage is at ${systemState.cpuUsage}%`,
        suggestedAction: 'Review CPU-intensive operations, consider optimizing algorithms or adding caching',
        expectedBenefit: 'Improve response times and system responsiveness',
        confidence: 0.8,
        basedOn: ['resource_monitoring']
      })
    }

    return suggestions
  }

  /**
   * Analyze user behavior for personalized suggestions
   */
  private analyzeUserBehavior(behavior: string[]): PredictiveSuggestion[] {
    const suggestions: PredictiveSuggestion[] = []

    // Check for repetitive patterns
    const patternFrequency: Record<string, number> = {}
    behavior.forEach(action => {
      patternFrequency[action] = (patternFrequency[action] || 0) + 1
    })

    for (const [action, count] of Object.entries(patternFrequency)) {
      if (count >= 5) {
        suggestions.push({
          type: 'workflow',
          priority: 'low',
          title: `Create Workflow Template`,
          description: `You frequently perform "${action}" (${count} times)`,
          suggestedAction: `Create a workflow template for ${action} to automate this process`,
          expectedBenefit: 'Save time and reduce manual effort',
          confidence: 0.7,
          basedOn: ['user_behavior_analysis']
        })
      }
    }

    return suggestions
  }

  /**
   * Optimize workflow based on historical patterns and best practices
   */
  optimizeWorkflow(originalWorkflow: string[]): WorkflowOptimization {
    const optimizedWorkflow = [...originalWorkflow]
    const improvements: string[] = []

    // Remove redundant operations
    const redundantOps = this.findRedundantOperations(originalWorkflow)
    if (redundantOps.length > 0) {
      redundantOps.forEach(op => {
        const index = optimizedWorkflow.indexOf(op)
        if (index > -1) {
          optimizedWorkflow.splice(index, 1)
          improvements.push(`Removed redundant ${op}`)
        }
      })
    }

    // Reorder for efficiency
    const reorderedWorkflow = this.reorderForEfficiency(optimizedWorkflow)
    if (reorderedWorkflow.join(',') !== optimizedWorkflow.join(',')) {
      improvements.push('Reordered operations for better efficiency')
      optimizedWorkflow.length = 0
      optimizedWorkflow.push(...reorderedWorkflow)
    }

    // Add parallel execution opportunities
    const parallelGroups = this.findIndependentOperations(optimizedWorkflow)
    if (parallelGroups.length >= 2) {
      improvements.push(`Identified ${parallelGroups.length} operations for parallel execution`)
    }

    return {
      originalWorkflow,
      optimizedWorkflow,
      improvements,
      timeSaved: improvements.length * 15, // Estimate 15 seconds per improvement
      riskReduction: improvements.length > 0 ? 'Low' : 'None'
    }
  }

  /**
   * Helper methods
   */
  private calculateErrorRate(sessions: any[]): number {
    const failedSessions = sessions.filter(s => s.status === 'failed').length
    return failedSessions / sessions.length
  }

  private calculateAverageResponseTime(sessions: any[]): number {
    const durations = sessions
      .filter(s => s.completedAt && s.createdAt)
      .map(s => new Date(s.completedAt).getTime() - new Date(s.createdAt).getTime())
    
    if (durations.length === 0) return 0
    return durations.reduce((a, b) => a + b, 0) / durations.length
  }

  private extractErrorType(error: string): string {
    if (error.includes('timeout')) return 'Timeout'
    if (error.includes('connection')) return 'Connection Error'
    if (error.includes('permission')) return 'Permission Error'
    if (error.includes('not found')) return 'Not Found'
    return 'Unknown Error'
  }

  private getPreventiveAction(errorType: string): string {
    const actions: Record<string, string> = {
      'Timeout': 'Increase timeout values or optimize slow operations',
      'Connection Error': 'Implement retry logic with exponential backoff',
      'Permission Error': 'Review and update permissions',
      'Not Found': 'Add validation checks before resource access'
    }
    return actions[errorType] || 'Review error handling and add appropriate fallbacks'
  }

  private findIndependentOperations(workflow: string[]): string[] {
    // Simplified logic - in real implementation, this would analyze dependencies
    const independentOps: string[] = []
    
    // These operations are typically independent
    const typicallyIndependent = ['enumerate_domain', 'analyze_ip_threats', 'analyze_domain_threats']
    typicallyIndependent.forEach(op => {
      if (workflow.includes(op)) {
        independentOps.push(op)
      }
    })

    return independentOps
  }

  private findRedundantOperations(workflow: string[]): string[] {
    const redundant: string[] = []
    const seen = new Set<string>()

    workflow.forEach(op => {
      if (seen.has(op)) {
        redundant.push(op)
      }
      seen.add(op)
    })

    return redundant
  }

  private reorderForEfficiency(workflow: string[]): string[] {
    // Simplified reordering logic
    const priorityOrder = ['check_status', 'enumerate_domain', 'analyze_domain_threats', 'generate_report']
    const reordered: string[] = []
    const remaining = [...workflow]

    priorityOrder.forEach(priorityOp => {
      const index = remaining.indexOf(priorityOp)
      if (index > -1) {
        reordered.push(remaining.splice(index, 1)[0])
      }
    })

    return [...reordered, ...remaining]
  }

  /**
   * Get proactive health check
   */
  async getProactiveHealthCheck(): Promise<{
    overallHealth: 'healthy' | 'degraded' | 'critical'
    anomalies: AnomalyDetection[]
    suggestions: PredictiveSuggestion[]
    metrics: SystemMetrics
  }> {
    const currentMetrics: SystemMetrics = {
      timestamp: Date.now(),
      errorRate: await this.getCurrentErrorRate(),
      responseTime: await this.getCurrentResponseTime(),
      throughput: await this.getCurrentThroughput()
    }

    const anomalies = this.detectAnomalies(currentMetrics)
    const suggestions = await this.generatePredictiveSuggestions({
      systemState: currentMetrics as unknown as Record<string, unknown>
    })

    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy'
    const highSeverityAnomalies = anomalies.filter(a => a.severity === 'high')
    if (highSeverityAnomalies.length > 0) {
      overallHealth = 'critical'
    } else if (anomalies.length > 0) {
      overallHealth = 'degraded'
    }

    return {
      overallHealth,
      anomalies,
      suggestions,
      metrics: currentMetrics
    }
  }

  private async getCurrentErrorRate(): Promise<number> {
    try {
      const recentSessions = await prisma.workflowSession.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
          }
        },
        take: 100
      })
      return this.calculateErrorRate(recentSessions)
    } catch {
      return 0
    }
  }

  private async getCurrentResponseTime(): Promise<number> {
    try {
      const recentSessions = await prisma.workflowSession.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000)
          },
          completedAt: { not: null }
        },
        take: 50
      })
      return this.calculateAverageResponseTime(recentSessions)
    } catch {
      return 0
    }
  }

  private async getCurrentThroughput(): Promise<number> {
    try {
      const recentSessions = await prisma.workflowSession.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000)
          }
        },
        take: 100
      })
      return recentSessions.length // sessions per hour
    } catch {
      return 0
    }
  }
}

// Singleton instance
let proactiveIntelligenceInstance: ProactiveIntelligence | null = null

export function getProactiveIntelligence(): ProactiveIntelligence {
  if (!proactiveIntelligenceInstance) {
    proactiveIntelligenceInstance = new ProactiveIntelligence()
    proactiveIntelligenceInstance.initialize()
  }
  return proactiveIntelligenceInstance
}