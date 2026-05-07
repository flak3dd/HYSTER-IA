import { z } from 'zod'
import { getCache, setCache, CACHE_TTL } from '../infrastructure/cache'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const CachePredictionType = z.enum([
  'temporal',
  'sequential',
  'correlation',
  'user_behavior',
  'system_pattern',
])
export type CachePredictionType = z.infer<typeof CachePredictionType>

export interface CachePrediction {
  id: string
  key: string
  type: CachePredictionType
  confidence: number
  predictedAccessTime: number
  dataGenerator: () => Promise<unknown>
  priority: number
  metadata: Record<string, unknown>
}

export interface CacheAccessPattern {
  key: string
  accessCount: number
  lastAccessTime: number
  accessInterval: number[]
  avgInterval: number
  nextPredictedAccess: number
  patternType: CachePredictionType
}

export interface PrefetchDecision {
  key: string
  shouldPrefetch: boolean
  confidence: number
  reason: string
  estimatedBenefit: number
  cost: number
}

/* ------------------------------------------------------------------ */
/*  Predictive Caching Engine                                          */
/* ------------------------------------------------------------------ */

class PredictiveCachingEngine {
  private accessPatterns: Map<string, CacheAccessPattern>
  private predictions: Map<string, CachePrediction>
  private isLearningEnabled: boolean
  private prefetchQueue: CachePrediction[]
  private maxQueueSize: number
  private predictionWindow: number
  private learningInterval: NodeJS.Timeout | null

  constructor() {
    this.accessPatterns = new Map()
    this.predictions = new Map()
    this.isLearningEnabled = true
    this.prefetchQueue = []
    this.maxQueueSize = 50
    this.predictionWindow = 3600000 // 1 hour
    this.learningInterval = null

    this.startLearning()
  }

  /* ------------------------------------------------------------------ */
  /*  Access Pattern Learning                                           */
  /* ------------------------------------------------------------------ */

  recordAccess(key: string): void {
    if (!this.isLearningEnabled) return

    const now = Date.now()
    let pattern = this.accessPatterns.get(key)

    if (!pattern) {
      pattern = {
        key,
        accessCount: 0,
        lastAccessTime: now,
        accessInterval: [],
        avgInterval: 0,
        nextPredictedAccess: 0,
        patternType: 'sequential',
      }
      this.accessPatterns.set(key, pattern)
    }

    // Calculate interval since last access
    if (pattern.lastAccessTime > 0) {
      const interval = now - pattern.lastAccessTime
      pattern.accessInterval.push(interval)
      
      // Keep only last 20 intervals
      if (pattern.accessInterval.length > 20) {
        pattern.accessInterval.shift()
      }
      
      // Calculate average interval
      pattern.avgInterval = pattern.accessInterval.reduce((a, b) => a + b, 0) / pattern.accessInterval.length
    }

    pattern.accessCount++
    pattern.lastAccessTime = now

    // Update next predicted access
    pattern.nextPredictedAccess = now + pattern.avgInterval

    // Detect pattern type
    pattern.patternType = this.detectPatternType(pattern)
  }

  private detectPatternType(pattern: CacheAccessPattern): CachePredictionType {
    const intervals = pattern.accessInterval
    if (intervals.length < 3) return 'sequential'

    // Check for regular intervals (temporal pattern)
    const variance = this.calculateVariance(intervals)
    if (variance < pattern.avgInterval * 0.2) {
      return 'temporal'
    }

    // Check for sequential access patterns
    if (this.isSequentialPattern(pattern)) {
      return 'sequential'
    }

    // Check for correlation-based patterns
    if (this.isCorrelationPattern(pattern)) {
      return 'correlation'
    }

    return 'sequential'
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2))
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length
  }

  private isSequentialPattern(pattern: CacheAccessPattern): boolean {
    // Simple heuristic: check if accesses are happening in rapid succession
    if (pattern.accessInterval.length < 2) return false
    const recentIntervals = pattern.accessInterval.slice(-3)
    return recentIntervals.every(interval => interval < 60000) // Within 1 minute
  }

  private isCorrelationPattern(pattern: CacheAccessPattern): boolean {
    void pattern
    // Check if this key is accessed around the same time as other keys
    // This would require cross-key analysis
    return false
  }

  /* ------------------------------------------------------------------ */
  /*  Predictive Prefetching                                            */
  /* ------------------------------------------------------------------ */

  async generatePredictions(): Promise<CachePrediction[]> {
    const predictions: CachePrediction[] = []
    const now = Date.now()

    for (const [key, pattern] of this.accessPatterns) {
      // Skip if already cached
      if (getCache(key)) continue

      // Skip if not enough data
      if (pattern.accessCount < 3) continue

      // Calculate confidence based on pattern consistency
      const confidence = this.calculatePredictionConfidence(pattern)

      if (confidence < 0.6) continue

      // Check if prediction is within window
      const timeUntilAccess = pattern.nextPredictedAccess - now
      if (timeUntilAccess > this.predictionWindow || timeUntilAccess < 0) continue

      // Generate prediction
      const prediction: CachePrediction = {
        id: `pred_${key}_${Date.now()}`,
        key,
        type: pattern.patternType,
        confidence,
        predictedAccessTime: pattern.nextPredictedAccess,
        dataGenerator: async () => {
          // This would be implemented based on key type
          return null
        },
        priority: this.calculatePrefetchPriority(pattern, timeUntilAccess),
        metadata: {
          accessCount: pattern.accessCount,
          avgInterval: pattern.avgInterval,
          patternType: pattern.patternType,
        },
      }

      predictions.push(prediction)
    }

    // Sort by priority and confidence
    predictions.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      return b.confidence - a.confidence
    })

    return predictions.slice(0, this.maxQueueSize)
  }

  private calculatePredictionConfidence(pattern: CacheAccessPattern): number {
    // Confidence based on access count and pattern consistency
    const accessScore = Math.min(pattern.accessCount / 10, 1.0) // Max 1.0 at 10 accesses
    const consistencyScore = this.calculatePatternConsistency(pattern)
    
    return (accessScore * 0.6 + consistencyScore * 0.4)
  }

  private calculatePatternConsistency(pattern: CacheAccessPattern): number {
    if (pattern.accessInterval.length < 3) return 0

    const variance = this.calculateVariance(pattern.accessInterval)
    const cv = variance / pattern.avgInterval // Coefficient of variation
    
    // Lower CV = higher consistency
    return Math.max(0, 1 - cv)
  }

  private calculatePrefetchPriority(pattern: CacheAccessPattern, timeUntilAccess: number): number {
    // Higher priority for:
    // - Frequently accessed items
    // - Items accessed soon
    // - Items with consistent patterns
    
    const frequencyScore = Math.min(pattern.accessCount / 20, 1.0)
    const urgencyScore = 1 - (timeUntilAccess / this.predictionWindow)
    const consistencyScore = this.calculatePatternConsistency(pattern)

    return (frequencyScore * 0.4 + urgencyScore * 0.4 + consistencyScore * 0.2) * 100
  }

  async executePrefetch(predictions: CachePrediction[]): Promise<void> {
    for (const prediction of predictions) {
      try {
        const decision = await this.evaluatePrefetchDecision(prediction)
        
        if (decision.shouldPrefetch) {
          console.log(`Prefetching ${prediction.key} (confidence: ${prediction.confidence})`)
          
          const data = await prediction.dataGenerator()
          const ttl = this.calculateOptimalTtl(prediction)
          
          setCache(prediction.key, data, ttl)
          
          // Record successful prefetch
          this.predictions.set(prediction.id, prediction)
        }
      } catch (error) {
        console.error(`Prefetch failed for ${prediction.key}:`, error)
      }
    }
  }

  private async evaluatePrefetchDecision(prediction: CachePrediction): Promise<PrefetchDecision> {
    const cost = await this.estimatePrefetchCost(prediction)
    const benefit = await this.estimatePrefetchBenefit(prediction)

    // Prefetch if benefit significantly outweighs cost
    const shouldPrefetch = benefit > cost * 1.5 && prediction.confidence > 0.7

    return {
      key: prediction.key,
      shouldPrefetch,
      confidence: prediction.confidence,
      reason: shouldPrefetch 
        ? `Benefit (${benefit.toFixed(2)}) outweighs cost (${cost.toFixed(2)})`
        : `Cost (${cost.toFixed(2)}) too high compared to benefit (${benefit.toFixed(2)})`,
      estimatedBenefit: benefit,
      cost,
    }
  }

  private async estimatePrefetchCost(prediction: CachePrediction): Promise<number> {
    // Cost based on:
    // - API quota usage
    // - Computational resources
    // - Storage requirements
    
    let cost = 0.1 // Base cost

    // Higher cost for low-confidence predictions
    cost += (1 - prediction.confidence) * 0.2

    // Higher cost for complex data types
    if (prediction.key.includes('domain')) cost += 0.1
    if (prediction.key.includes('threat')) cost += 0.15

    return cost
  }

  private async estimatePrefetchBenefit(prediction: CachePrediction): Promise<number> {
    // Benefit based on:
    // - Time saved on actual access
    // - Reduced API quota usage
    // - Improved user experience
    
    let benefit = 0.5 // Base benefit

    // Higher benefit for high-confidence predictions
    benefit += prediction.confidence * 0.3

    // Higher benefit for frequently accessed items
    const pattern = this.accessPatterns.get(prediction.key)
    if (pattern) {
      benefit += Math.min(pattern.accessCount / 10, 0.2)
    }

    // Higher benefit for time-sensitive predictions
    const timeUntilAccess = prediction.predictedAccessTime - Date.now()
    if (timeUntilAccess < 300000) { // Within 5 minutes
      benefit += 0.2
    }

    return benefit
  }

  private calculateOptimalTtl(prediction: CachePrediction): number {
    // TTL based on prediction type and confidence
    const baseTtls: Record<CachePredictionType, number> = {
      temporal: 3600, // 1 hour for temporal patterns
      sequential: 1800, // 30 minutes for sequential patterns
      correlation: 2700, // 45 minutes for correlation patterns
      user_behavior: 5400, // 1.5 hours for user behavior patterns
      system_pattern: 7200, // 2 hours for system patterns
    }

    let ttl = baseTtls[prediction.type]
    
    // Adjust based on confidence
    ttl *= prediction.confidence

    // Adjust based on access frequency
    const pattern = this.accessPatterns.get(prediction.key)
    if (pattern && pattern.accessCount > 10) {
      ttl *= 1.5
    }

    return Math.floor(ttl)
  }

  /* ------------------------------------------------------------------ */
  /*  Autonomous Learning Loop                                         */
  /* ------------------------------------------------------------------ */

  private startLearning(): void {
    this.learningInterval = setInterval(async () => {
      if (!this.isLearningEnabled) return

      try {
        await this.learningCycle()
      } catch (error) {
        console.error('Predictive caching learning error:', error)
      }
    }, 60000) // Every minute
  }

  private async learningCycle(): Promise<void> {
    // Generate new predictions
    const predictions = await this.generatePredictions()
    
    // Execute prefetching
    await this.executePrefetch(predictions)

    // Clean up old patterns
    this.cleanupOldPatterns()

    // Optimize prediction window
    this.optimizePredictionWindow()
  }

  private cleanupOldPatterns(): void {
    const now = Date.now()
    const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days

    for (const [key, pattern] of this.accessPatterns) {
      if (now - pattern.lastAccessTime > maxAge && pattern.accessCount < 5) {
        this.accessPatterns.delete(key)
      }
    }
  }

  private optimizePredictionWindow(): void {
    // Adjust prediction window based on prefetch accuracy
    let totalAccuracy = 0
    let accuratePredictions = 0

    for (const prediction of this.predictions.values()) {
      const actualAccess = this.accessPatterns.get(prediction.key)?.lastAccessTime || 0
      const predictedAccess = prediction.predictedAccessTime
      const error = Math.abs(actualAccess - predictedAccess)

      if (error < 300000) { // Within 5 minutes
        accuratePredictions++
      }

      totalAccuracy++
    }

    if (totalAccuracy > 0) {
      const accuracy = accuratePredictions / totalAccuracy
      
      if (accuracy > 0.8) {
        this.predictionWindow = Math.min(this.predictionWindow * 1.1, 7200000) // Max 2 hours
      } else if (accuracy < 0.5) {
        this.predictionWindow = Math.max(this.predictionWindow * 0.9, 1800000) // Min 30 minutes
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Smart Cache Operations                                            */
  /* ------------------------------------------------------------------ */

  async smartGet<T>(key: string, dataGenerator: () => Promise<T>, ttl?: number): Promise<T> {
    // Record access for learning
    this.recordAccess(key)

    // Try to get from cache
    const cached = getCache<T>(key)
    if (cached !== null) {
      return cached
    }

    // Generate data
    const data = await dataGenerator()
    
    // Cache with intelligent TTL
    const optimalTtl = ttl || this.calculateSmartTtl(key)
    setCache(key, data, optimalTtl)

    return data
  }

  private calculateSmartTtl(key: string): number {
    const pattern = this.accessPatterns.get(key)
    
    if (!pattern) {
      return CACHE_TTL.api // Default TTL
    }

    // Calculate TTL based on access pattern
    const avgInterval = pattern.avgInterval
    const accessCount = pattern.accessCount

    // More frequently accessed items get longer TTL
    const frequencyMultiplier = Math.min(accessCount / 10, 2.0)
    
    // TTL based on average access interval
    let ttl = avgInterval * frequencyMultiplier

    // Clamp to reasonable bounds
    ttl = Math.max(ttl, 300) // Min 5 minutes
    ttl = Math.min(ttl, 7200) // Max 2 hours

    return Math.floor(ttl)
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  getAccessPattern(key: string): CacheAccessPattern | undefined {
    return this.accessPatterns.get(key)
  }

  getAllAccessPatterns(): CacheAccessPattern[] {
    return Array.from(this.accessPatterns.values())
  }

  getPredictions(): CachePrediction[] {
    return Array.from(this.predictions.values())
  }

  setLearningEnabled(enabled: boolean): void {
    this.isLearningEnabled = enabled
  }

  setPredictionWindow(windowMs: number): void {
    this.predictionWindow = windowMs
  }

  async forcePrefetchCycle(): Promise<void> {
    await this.learningCycle()
  }

  getCacheStats(): {
    accessPatterns: number
    predictions: number
    predictionWindow: number
    avgConfidence: number
  } {
    const predictions = Array.from(this.predictions.values())
    const avgConfidence = predictions.length > 0
      ? predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length
      : 0

    return {
      accessPatterns: this.accessPatterns.size,
      predictions: predictions.length,
      predictionWindow: this.predictionWindow,
      avgConfidence,
    }
  }
}

// Global singleton instance (globalThis-guarded to survive HMR)
const gPC = globalThis as typeof globalThis & { __predictiveCaching?: PredictiveCachingEngine }
const predictiveCaching = gPC.__predictiveCaching ?? new PredictiveCachingEngine()
if (!gPC.__predictiveCaching) gPC.__predictiveCaching = predictiveCaching

export { PredictiveCachingEngine, predictiveCaching }
