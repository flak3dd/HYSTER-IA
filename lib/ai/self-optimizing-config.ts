import { z } from 'zod'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const ConfigParameter = z.enum([
  'cache_ttl',
  'rate_limit_threshold',
  'max_concurrent_tasks',
  'api_timeout',
  'retry_attempts',
  'log_level',
  'memory_limit',
  'cpu_threshold',
])
export type ConfigParameter = z.infer<typeof ConfigParameter>

export interface ConfigValue {
  parameter: ConfigParameter
  value: number | string | boolean
  previousValue: number | string | boolean
  optimizedAt: number
  confidence: number
  reasoning: string
  performanceImpact: {
    before: number
    after: number
    improvement: number
  }
}

export interface PerformanceMetric {
  name: string
  value: number
  timestamp: number
  target?: number
  threshold?: number
}

export interface OptimizationRecommendation {
  parameter: ConfigParameter
  currentValue: number | string | boolean
  recommendedValue: number | string | boolean
  confidence: number
  reasoning: string
  expectedImpact: string
  riskLevel: 'low' | 'medium' | 'high'
}

/* ------------------------------------------------------------------ */
/*  Self-Optimizing Configuration Manager                              */
/* ------------------------------------------------------------------ */

class SelfOptimizingConfig {
  private configValues: Map<ConfigParameter, ConfigValue>
  private performanceHistory: Map<string, PerformanceMetric[]>
  private optimizationRules: Map<ConfigParameter, OptimizationRule>
  private isOptimizationEnabled: boolean
  private optimizationInterval: NodeJS.Timeout | null
  private baselineMetrics: Map<string, number>

  constructor() {
    this.configValues = new Map()
    this.performanceHistory = new Map()
    this.optimizationRules = new Map()
    this.isOptimizationEnabled = true
    this.optimizationInterval = null
    this.baselineMetrics = new Map()

    this.initializeDefaultConfig()
    this.initializeOptimizationRules()
  }

  /* ------------------------------------------------------------------ */
  /*  Initialization                                                    */
  /* ------------------------------------------------------------------ */

  private initializeDefaultConfig(): void {
    const defaults: Record<ConfigParameter, number | string | boolean> = {
      cache_ttl: 1800, // 30 minutes
      rate_limit_threshold: 0.8, // 80% of limit
      max_concurrent_tasks: 5,
      api_timeout: 30000, // 30 seconds
      retry_attempts: 3,
      log_level: 'info',
      memory_limit: 512, // MB
      cpu_threshold: 80, // percentage
    }

    for (const [param, value] of Object.entries(defaults)) {
      this.configValues.set(param as ConfigParameter, {
        parameter: param as ConfigParameter,
        value,
        previousValue: value,
        optimizedAt: Date.now(),
        confidence: 0.5,
        reasoning: 'Default value',
        performanceImpact: { before: 0, after: 0, improvement: 0 },
      })
    }
  }

  private initializeOptimizationRules(): void {
    // Cache TTL optimization rule
    this.optimizationRules.set('cache_ttl', {
      name: 'Cache TTL Optimization',
      evaluate: (metrics) => this.evaluateCacheTtl(metrics),
      apply: (value) => this.applyCacheTtl(value as number),
      rollback: (value) => this.rollbackCacheTtl(value as number),
    })

    // Rate limit optimization rule
    this.optimizationRules.set('rate_limit_threshold', {
      name: 'Rate Limit Optimization',
      evaluate: (metrics) => this.evaluateRateLimit(metrics),
      apply: (value) => this.applyRateLimit(value as number),
      rollback: (value) => this.rollbackRateLimit(value as number),
    })

    // Concurrent tasks optimization
    this.optimizationRules.set('max_concurrent_tasks', {
      name: 'Concurrent Tasks Optimization',
      evaluate: (metrics) => this.evaluateMaxConcurrentTasks(metrics),
      apply: (value) => this.applyMaxConcurrentTasks(value as number),
      rollback: (value) => this.rollbackMaxConcurrentTasks(value as number),
    })

    // API timeout optimization
    this.optimizationRules.set('api_timeout', {
      name: 'API Timeout Optimization',
      evaluate: (metrics) => this.evaluateApiTimeout(metrics),
      apply: (value) => this.applyApiTimeout(value as number),
      rollback: (value) => this.rollbackApiTimeout(value as number),
    })
  }

  /* ------------------------------------------------------------------ */
  /*  Autonomous Optimization                                           */
  /* ------------------------------------------------------------------ */

  async startAutonomousOptimization(intervalMs: number = 300000): Promise<void> {
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval)
    }

    this.optimizationInterval = setInterval(async () => {
      if (!this.isOptimizationEnabled) return

      try {
        await this.performOptimizationCycle()
      } catch (error) {
        console.error('Autonomous optimization error:', error)
      }
    }, intervalMs)
  }

  stopAutonomousOptimization(): void {
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval)
      this.optimizationInterval = null
    }
  }

  private async performOptimizationCycle(): Promise<void> {
    const recommendations = await this.generateOptimizationRecommendations()

    for (const recommendation of recommendations) {
      if (recommendation.confidence > 0.7 && recommendation.riskLevel !== 'high') {
        await this.applyOptimization(recommendation)
      }
    }
  }

  async generateOptimizationRecommendations(): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = []
    const currentMetrics = this.getCurrentMetrics()

    for (const [parameter, rule] of this.optimizationRules) {
      const evaluation = await rule.evaluate(currentMetrics)
      
      if (evaluation.shouldOptimize) {
        const currentValue = this.configValues.get(parameter)?.value
        recommendations.push({
          parameter,
          currentValue: currentValue || 0,
          recommendedValue: evaluation.recommendedValue,
          confidence: evaluation.confidence,
          reasoning: evaluation.reasoning,
          expectedImpact: evaluation.expectedImpact,
          riskLevel: evaluation.riskLevel,
        })
      }
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence)
  }

  async applyOptimization(recommendation: OptimizationRecommendation): Promise<void> {
    const rule = this.optimizationRules.get(recommendation.parameter)
    if (!rule) return

    const currentConfig = this.configValues.get(recommendation.parameter)
    if (!currentConfig) return

    try {
      // Apply the optimization
      await rule.apply(recommendation.recommendedValue)

      // Update config value
      const newConfig: ConfigValue = {
        parameter: recommendation.parameter,
        value: recommendation.recommendedValue,
        previousValue: currentConfig.value,
        optimizedAt: Date.now(),
        confidence: recommendation.confidence,
        reasoning: recommendation.reasoning,
        performanceImpact: {
          before: currentConfig.performanceImpact.after,
          after: 0, // Will be updated after monitoring
          improvement: 0,
        },
      }

      this.configValues.set(recommendation.parameter, newConfig)

      // Monitor performance impact
      setTimeout(async () => {
        await this.monitorOptimizationImpact(recommendation.parameter)
      }, 60000) // Check after 1 minute

    } catch (error) {
      console.error(`Failed to apply optimization for ${recommendation.parameter}:`, error)
      
      // Rollback on error
      await rule.rollback(currentConfig.previousValue)
    }
  }

  private async monitorOptimizationImpact(parameter: ConfigParameter): Promise<void> {
    const config = this.configValues.get(parameter)
    if (!config) return

    const currentMetrics = this.getCurrentMetrics()
    const relevantMetric = this.getRelevantMetric(parameter, currentMetrics)

    if (relevantMetric) {
      const improvement = ((relevantMetric.value - config.performanceImpact.before) / 
                          config.performanceImpact.before) * 100

      config.performanceImpact.after = relevantMetric.value
      config.performanceImpact.improvement = improvement

      // If performance degraded significantly, rollback
      if (improvement < -10) {
        console.warn(`Performance degraded for ${parameter}, rolling back`)
        const rule = this.optimizationRules.get(parameter)
        if (rule) {
          await rule.rollback(config.previousValue)
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Optimization Rules                                                */
  /* ------------------------------------------------------------------ */

  private async evaluateCacheTtl(metrics: PerformanceMetric[]): Promise<{
    shouldOptimize: boolean
    recommendedValue: number
    confidence: number
    reasoning: string
    expectedImpact: string
    riskLevel: 'low' | 'medium' | 'high'
  }> {
    const cacheHitRate = metrics.find(m => m.name === 'cache_hit_rate')?.value || 0
    const memoryUsage = metrics.find(m => m.name === 'memory_usage')?.value || 0

    if (cacheHitRate < 0.5 && memoryUsage < 70) {
      return {
        shouldOptimize: true,
        recommendedValue: 3600, // Increase to 1 hour
        confidence: 0.8,
        reasoning: 'Low cache hit rate and available memory suggest increasing TTL',
        expectedImpact: 'Improved cache hit rate, reduced API calls',
        riskLevel: 'low',
      }
    }

    if (cacheHitRate > 0.9 && memoryUsage > 80) {
      return {
        shouldOptimize: true,
        recommendedValue: 900, // Decrease to 15 minutes
        confidence: 0.7,
        reasoning: 'High cache hit rate but memory pressure suggest reducing TTL',
        expectedImpact: 'Reduced memory usage, maintained cache performance',
        riskLevel: 'medium',
      }
    }

    return {
      shouldOptimize: false,
      recommendedValue: 1800,
      confidence: 0,
      reasoning: 'Current TTL is optimal',
      expectedImpact: 'No change',
      riskLevel: 'low',
    }
  }

  private async evaluateRateLimit(metrics: PerformanceMetric[]): Promise<{
    shouldOptimize: boolean
    recommendedValue: number
    confidence: number
    reasoning: string
    expectedImpact: string
    riskLevel: 'low' | 'medium' | 'high'
  }> {
    const rateLimitUtilization = metrics.find(m => m.name === 'rate_limit_utilization')?.value || 0
    const errorRate = metrics.find(m => m.name === 'error_rate')?.value || 0

    if (rateLimitUtilization > 0.9 && errorRate > 5) {
      return {
        shouldOptimize: true,
        recommendedValue: 0.7, // Reduce to 70%
        confidence: 0.85,
        reasoning: 'High rate limit utilization and error rate suggest reducing threshold',
        expectedImpact: 'Reduced rate limit errors, improved reliability',
        riskLevel: 'low',
      }
    }

    if (rateLimitUtilization < 0.5) {
      return {
        shouldOptimize: true,
        recommendedValue: 0.9, // Increase to 90%
        confidence: 0.75,
        reasoning: 'Low rate limit utilization suggests headroom for increased threshold',
        expectedImpact: 'Increased throughput, better resource utilization',
        riskLevel: 'medium',
      }
    }

    return {
      shouldOptimize: false,
      recommendedValue: 0.8,
      confidence: 0,
      reasoning: 'Current rate limit threshold is optimal',
      expectedImpact: 'No change',
      riskLevel: 'low',
    }
  }

  private async evaluateMaxConcurrentTasks(metrics: PerformanceMetric[]): Promise<{
    shouldOptimize: boolean
    recommendedValue: number
    confidence: number
    reasoning: string
    expectedImpact: string
    riskLevel: 'low' | 'medium' | 'high'
  }> {
    const cpuUsage = metrics.find(m => m.name === 'cpu_usage')?.value || 0
    const memoryUsage = metrics.find(m => m.name === 'memory_usage')?.value || 0
    const queueLength = metrics.find(m => m.name === 'queue_length')?.value || 0

    if (cpuUsage < 50 && memoryUsage < 60 && queueLength > 10) {
      return {
        shouldOptimize: true,
        recommendedValue: 8, // Increase concurrent tasks
        confidence: 0.8,
        reasoning: 'Low resource usage with queue backlog suggests increasing concurrency',
        expectedImpact: 'Reduced queue wait times, improved throughput',
        riskLevel: 'medium',
      }
    }

    if (cpuUsage > 80 || memoryUsage > 85) {
      return {
        shouldOptimize: true,
        recommendedValue: 3, // Decrease concurrent tasks
        confidence: 0.9,
        reasoning: 'High resource usage suggests reducing concurrency',
        expectedImpact: 'Improved system stability, reduced resource contention',
        riskLevel: 'low',
      }
    }

    return {
      shouldOptimize: false,
      recommendedValue: 5,
      confidence: 0,
      reasoning: 'Current concurrency level is optimal',
      expectedImpact: 'No change',
      riskLevel: 'low',
    }
  }

  private async evaluateApiTimeout(metrics: PerformanceMetric[]): Promise<{
    shouldOptimize: boolean
    recommendedValue: number
    confidence: number
    reasoning: string
    expectedImpact: string
    riskLevel: 'low' | 'medium' | 'high'
  }> {
    const avgResponseTime = metrics.find(m => m.name === 'avg_response_time')?.value || 0
    const timeoutRate = metrics.find(m => m.name === 'timeout_rate')?.value || 0

    if (avgResponseTime > 20000 && timeoutRate > 5) {
      return {
        shouldOptimize: true,
        recommendedValue: 60000, // Increase to 60 seconds
        confidence: 0.85,
        reasoning: 'High response times and timeout rate suggest increasing timeout',
        expectedImpact: 'Reduced timeout errors, improved reliability',
        riskLevel: 'low',
      }
    }

    if (avgResponseTime < 5000 && timeoutRate < 1) {
      return {
        shouldOptimize: true,
        recommendedValue: 15000, // Decrease to 15 seconds
        confidence: 0.7,
        reasoning: 'Fast response times suggest timeout can be reduced',
        expectedImpact: 'Faster error detection, improved resource utilization',
        riskLevel: 'medium',
      }
    }

    return {
      shouldOptimize: false,
      recommendedValue: 30000,
      confidence: 0,
      reasoning: 'Current timeout is optimal',
      expectedImpact: 'No change',
      riskLevel: 'low',
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Configuration Application                                          */
  /* ------------------------------------------------------------------ */

  private async applyCacheTtl(value: number): Promise<void> {
    // Implementation would update cache configuration
    console.log(`Setting cache TTL to ${value} seconds`)
  }

  private async rollbackCacheTtl(value: number): Promise<void> {
    console.log(`Rolling back cache TTL to ${value} seconds`)
  }

  private async applyRateLimit(value: number): Promise<void> {
    console.log(`Setting rate limit threshold to ${value}`)
  }

  private async rollbackRateLimit(value: number): Promise<void> {
    console.log(`Rolling back rate limit threshold to ${value}`)
  }

  private async applyMaxConcurrentTasks(value: number): Promise<void> {
    console.log(`Setting max concurrent tasks to ${value}`)
  }

  private async rollbackMaxConcurrentTasks(value: number): Promise<void> {
    console.log(`Rolling back max concurrent tasks to ${value}`)
  }

  private async applyApiTimeout(value: number): Promise<void> {
    console.log(`Setting API timeout to ${value} ms`)
  }

  private async rollbackApiTimeout(value: number): Promise<void> {
    console.log(`Rolling back API timeout to ${value} ms`)
  }

  /* ------------------------------------------------------------------ */
  /*  Performance Monitoring                                            */
  /* ------------------------------------------------------------------ */

  recordMetric(metric: PerformanceMetric): void {
    const history = this.performanceHistory.get(metric.name) || []
    history.push(metric)
    
    // Keep only last 100 data points
    if (history.length > 100) {
      history.shift()
    }
    
    this.performanceHistory.set(metric.name, history)

    // Set baseline if this is the first measurement
    if (!this.baselineMetrics.has(metric.name)) {
      this.baselineMetrics.set(metric.name, metric.value)
    }
  }

  private getCurrentMetrics(): PerformanceMetric[] {
    const metrics: PerformanceMetric[] = []
    const now = Date.now()

    for (const history of this.performanceHistory.values()) {
      if (history.length > 0) {
        const latest = history[history.length - 1]
        metrics.push({
          name: latest.name,
          value: latest.value,
          timestamp: now,
          target: latest.target,
          threshold: latest.threshold,
        })
      }
    }

    // Add default metrics if not available
    const defaultMetrics = [
      { name: 'cache_hit_rate', value: 0.7 },
      { name: 'memory_usage', value: 60 },
      { name: 'cpu_usage', value: 45 },
      { name: 'rate_limit_utilization', value: 0.6 },
      { name: 'error_rate', value: 2 },
      { name: 'avg_response_time', value: 8000 },
      { name: 'timeout_rate', value: 1 },
      { name: 'queue_length', value: 3 },
    ]

    for (const defaultMetric of defaultMetrics) {
      if (!metrics.find(m => m.name === defaultMetric.name)) {
        metrics.push({
          ...defaultMetric,
          timestamp: now,
        })
      }
    }

    return metrics
  }

  private getRelevantMetric(parameter: ConfigParameter, metrics: PerformanceMetric[]): PerformanceMetric | undefined {
    const metricMapping: Record<ConfigParameter, string> = {
      cache_ttl: 'cache_hit_rate',
      rate_limit_threshold: 'rate_limit_utilization',
      max_concurrent_tasks: 'queue_length',
      api_timeout: 'avg_response_time',
      retry_attempts: 'error_rate',
      log_level: 'error_rate',
      memory_limit: 'memory_usage',
      cpu_threshold: 'cpu_usage',
    }

    const metricName = metricMapping[parameter]
    return metrics.find(m => m.name === metricName)
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  getConfig(parameter: ConfigParameter): ConfigValue | undefined {
    return this.configValues.get(parameter)
  }

  getAllConfigs(): ConfigValue[] {
    return Array.from(this.configValues.values())
  }

  setConfig(parameter: ConfigParameter, value: number | string | boolean, reasoning: string = 'Manual override'): void {
    const currentConfig = this.configValues.get(parameter)
    this.configValues.set(parameter, {
      parameter,
      value,
      previousValue: currentConfig?.value || value,
      optimizedAt: Date.now(),
      confidence: 1.0, // Manual changes have high confidence
      reasoning,
      performanceImpact: {
        before: currentConfig?.performanceImpact.after || 0,
        after: 0,
        improvement: 0,
      },
    })
  }

  setOptimizationEnabled(enabled: boolean): void {
    this.isOptimizationEnabled = enabled
  }

  getPerformanceHistory(metricName: string): PerformanceMetric[] {
    return this.performanceHistory.get(metricName) || []
  }

  getOptimizationRecommendations(): Promise<OptimizationRecommendation[]> {
    return this.generateOptimizationRecommendations()
  }
}

interface OptimizationRule {
  name: string
  evaluate: (metrics: PerformanceMetric[]) => Promise<{
    shouldOptimize: boolean
    recommendedValue: number | string | boolean
    confidence: number
    reasoning: string
    expectedImpact: string
    riskLevel: 'low' | 'medium' | 'high'
  }>
  apply: (value: number | string | boolean) => Promise<void>
  rollback: (value: number | string | boolean) => Promise<void>
}

// Global singleton instance (globalThis-guarded to survive HMR)
const gSOC = globalThis as typeof globalThis & { __selfOptimizingConfig?: SelfOptimizingConfig }
const selfOptimizingConfig = gSOC.__selfOptimizingConfig ?? new SelfOptimizingConfig()
if (!gSOC.__selfOptimizingConfig) gSOC.__selfOptimizingConfig = selfOptimizingConfig

export { SelfOptimizingConfig, selfOptimizingConfig }
