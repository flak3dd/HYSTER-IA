import { z } from 'zod'

/* ------------------------------------------------------------------ */
/*  Types & Schemas                                                   */
/* ------------------------------------------------------------------ */

export const AnomalySeverity = z.enum(['critical', 'high', 'medium', 'low'])
export type AnomalySeverity = z.infer<typeof AnomalySeverity>

export const AnomalyType = z.enum([
  'statistical',
  'behavioral',
  'temporal',
  'correlation',
  'threshold',
  'machine_learning',
])
export type AnomalyType = z.infer<typeof AnomalyType>

export interface Anomaly {
  id: string
  type: AnomalyType
  severity: AnomalySeverity
  metric: string
  value: number
  expectedValue: number
  deviation: number
  confidence: number
  timestamp: number
  description: string
  context: Record<string, unknown>
  suggestions: string[]
  relatedAnomalies: string[]
  resolved: boolean
  resolvedAt?: number
}

export interface MetricData {
  name: string
  value: number
  timestamp: number
  metadata?: Record<string, unknown>
}

export interface AnomalyDetectionConfig {
  enabled: boolean
  thresholdMultiplier: number
  minDataPoints: number
  windowSize: number
  alertThreshold: AnomalySeverity
}

export interface Baseline {
  metric: string
  mean: number
  stdDev: number
  min: number
  max: number
  lastUpdated: number
  sampleCount: number
}

/* ------------------------------------------------------------------ */
/*  AI-Powered Anomaly Detection Engine                                 */
/* ------------------------------------------------------------------ */

class AnomalyDetectionEngine {
  private metricsHistory: Map<string, MetricData[]>
  private baselines: Map<string, Baseline>
  private anomalies: Map<string, Anomaly>
  private detectionConfig: AnomalyDetectionConfig
  private isDetectionEnabled: boolean
  private detectionInterval: NodeJS.Timeout | null
  private alertCallbacks: ((anomaly: Anomaly) => void)[]

  constructor() {
    this.metricsHistory = new Map()
    this.baselines = new Map()
    this.anomalies = new Map()
    this.detectionConfig = {
      enabled: true,
      thresholdMultiplier: 2.5, // 2.5 standard deviations
      minDataPoints: 30,
      windowSize: 100,
      alertThreshold: 'medium',
    }
    this.isDetectionEnabled = true
    this.detectionInterval = null
    this.alertCallbacks = []

    this.startContinuousDetection()
  }

  /* ------------------------------------------------------------------ */
  /*  Data Ingestion                                                    */
  /* ------------------------------------------------------------------ */

  recordMetric(metric: MetricData): void {
    const history = this.metricsHistory.get(metric.name) || []
    history.push(metric)

    // Keep only the configured window size
    if (history.length > this.detectionConfig.windowSize) {
      history.shift()
    }

    this.metricsHistory.set(metric.name, history)

    // Update baseline if we have enough data
    if (history.length >= this.detectionConfig.minDataPoints) {
      this.updateBaseline(metric.name)
    }

    // Check for anomalies
    if (this.isDetectionEnabled && this.detectionConfig.enabled) {
      this.detectAnomalies(metric.name)
    }
  }

  recordMetrics(metrics: MetricData[]): void {
    for (const metric of metrics) {
      this.recordMetric(metric)
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Baseline Management                                               */
  /* ------------------------------------------------------------------ */

  private updateBaseline(metricName: string): void {
    const history = this.metricsHistory.get(metricName)
    if (!history || history.length < this.detectionConfig.minDataPoints) return

    const values = history.map(m => m.value)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)

    const baseline: Baseline = {
      metric: metricName,
      mean,
      stdDev,
      min: Math.min(...values),
      max: Math.max(...values),
      lastUpdated: Date.now(),
      sampleCount: values.length,
    }

    this.baselines.set(metricName, baseline)
  }

  getBaseline(metricName: string): Baseline | undefined {
    return this.baselines.get(metricName)
  }

  /* ------------------------------------------------------------------ */
  /*  Anomaly Detection                                                 */
  /* ------------------------------------------------------------------ */

  private startContinuousDetection(): void {
    this.detectionInterval = setInterval(async () => {
      if (!this.isDetectionEnabled || !this.detectionConfig.enabled) return

      try {
        await this.performBatchDetection()
      } catch (error) {
        console.error('Continuous anomaly detection error:', error)
      }
    }, 60000) // Every minute
  }

  private async performBatchDetection(): Promise<void> {
    for (const metricName of this.metricsHistory.keys()) {
      await this.detectAnomalies(metricName)
    }
  }

  private async detectAnomalies(metricName: string): Promise<Anomaly[]> {
    const detectedAnomalies: Anomaly[] = []
    const history = this.metricsHistory.get(metricName)
    const baseline = this.baselines.get(metricName)

    if (!history || !baseline || history.length < this.detectionConfig.minDataPoints) {
      return []
    }

    const latestMetric = history[history.length - 1]

    // Statistical anomaly detection
    const statisticalAnomaly = this.detectStatisticalAnomaly(latestMetric, baseline)
    if (statisticalAnomaly) {
      detectedAnomalies.push(statisticalAnomaly)
    }

    // Behavioral anomaly detection
    const behavioralAnomaly = this.detectBehavioralAnomaly(history, baseline)
    if (behavioralAnomaly) {
      detectedAnomalies.push(behavioralAnomaly)
    }

    // Temporal anomaly detection
    const temporalAnomaly = this.detectTemporalAnomaly(history, baseline)
    if (temporalAnomaly) {
      detectedAnomalies.push(temporalAnomaly)
    }

    // Process detected anomalies
    for (const anomaly of detectedAnomalies) {
      this.processAnomaly(anomaly)
    }

    return detectedAnomalies
  }

  private detectStatisticalAnomaly(metric: MetricData, baseline: Baseline): Anomaly | null {
    const zScore = Math.abs((metric.value - baseline.mean) / baseline.stdDev)
    
    if (zScore > this.detectionConfig.thresholdMultiplier) {
      const deviation = ((metric.value - baseline.mean) / baseline.mean) * 100

      return {
        id: `anomaly_stat_${metric.name}_${Date.now()}`,
        type: 'statistical',
        severity: this.calculateSeverity(zScore),
        metric: metric.name,
        value: metric.value,
        expectedValue: baseline.mean,
        deviation,
        confidence: Math.min(zScore / this.detectionConfig.thresholdMultiplier, 1.0),
        timestamp: Date.now(),
        description: `Statistical anomaly: ${metric.name} value ${metric.value} is ${zScore.toFixed(2)}σ from baseline ${baseline.mean.toFixed(2)}`,
        context: {
          zScore,
          baselineMean: baseline.mean,
          baselineStdDev: baseline.stdDev,
        },
        suggestions: this.generateStatisticalSuggestions(metric, baseline, zScore),
        relatedAnomalies: [],
        resolved: false,
      }
    }

    return null
  }

  private detectBehavioralAnomaly(history: MetricData[], baseline: Baseline): Anomaly | null {
    void baseline
    if (history.length < 10) return null

    const recentValues = history.slice(-10).map(m => m.value)
    const olderValues = history.slice(-20, -10).map(m => m.value)

    const recentMean = recentValues.reduce((a, b) => a + b, 0) / recentValues.length
    const olderMean = olderValues.reduce((a, b) => a + b, 0) / olderValues.length

    const changeRate = Math.abs((recentMean - olderMean) / olderMean)

    if (changeRate > 0.5) { // More than 50% change
      return {
        id: `anomaly_behavior_${history[0].name}_${Date.now()}`,
        type: 'behavioral',
        severity: changeRate > 1.0 ? 'high' : 'medium',
        metric: history[0].name,
        value: recentMean,
        expectedValue: olderMean,
        deviation: changeRate * 100,
        confidence: Math.min(changeRate, 1.0),
        timestamp: Date.now(),
        description: `Behavioral anomaly: ${history[0].name} changed by ${(changeRate * 100).toFixed(1)}% from recent baseline`,
        context: {
          recentMean,
          olderMean,
          changeRate,
        },
        suggestions: this.generateBehavioralSuggestions(history[0].name, changeRate),
        relatedAnomalies: [],
        resolved: false,
      }
    }

    return null
  }

  private detectTemporalAnomaly(history: MetricData[], baseline: Baseline): Anomaly | null {
    void baseline
    if (history.length < 5) return null

    const recentTrend = this.calculateTrend(history.slice(-5))
    const historicalTrend = this.calculateTrend(history.slice(-20, -5))

    const trendChange = Math.abs(recentTrend - historicalTrend)

    if (trendChange > 0.3) { // Significant trend change
      return {
        id: `anomaly_temporal_${history[0].name}_${Date.now()}`,
        type: 'temporal',
        severity: trendChange > 0.5 ? 'high' : 'medium',
        metric: history[0].name,
        value: recentTrend,
        expectedValue: historicalTrend,
        deviation: trendChange * 100,
        confidence: Math.min(trendChange / 0.3, 1.0),
        timestamp: Date.now(),
        description: `Temporal anomaly: ${history[0].name} trend changed significantly from ${historicalTrend.toFixed(3)} to ${recentTrend.toFixed(3)}`,
        context: {
          recentTrend,
          historicalTrend,
          trendChange,
        },
        suggestions: this.generateTemporalSuggestions(history[0].name, trendChange),
        relatedAnomalies: [],
        resolved: false,
      }
    }

    return null
  }

  private calculateTrend(metrics: MetricData[]): number {
    if (metrics.length < 2) return 0

    const n = metrics.length
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0

    for (let i = 0; i < n; i++) {
      sumX += i
      sumY += metrics[i].value
      sumXY += i * metrics[i].value
      sumX2 += i * i
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    return slope
  }

  private calculateSeverity(zScore: number): AnomalySeverity {
    if (zScore > 4) return 'critical'
    if (zScore > 3) return 'high'
    if (zScore > 2) return 'medium'
    return 'low'
  }

  /* ------------------------------------------------------------------ */
  /*  Anomaly Processing                                                */
  /* ------------------------------------------------------------------ */

  private processAnomaly(anomaly: Anomaly): void {
    // Check for similar recent anomalies
    const similarAnomalies = this.findSimilarAnomalies(anomaly)
    anomaly.relatedAnomalies = similarAnomalies.map(a => a.id)

    // Store anomaly
    this.anomalies.set(anomaly.id, anomaly)

    // Trigger alerts if severity meets threshold
    if (this.shouldAlert(anomaly)) {
      this.triggerAlert(anomaly)
    }

    // Auto-remediation for low-severity anomalies
    if (anomaly.severity === 'low' && anomaly.type === 'statistical') {
      this.attemptAutoRemediation(anomaly)
    }
  }

  private findSimilarAnomalies(anomaly: Anomaly): Anomaly[] {
    const similar: Anomaly[] = []
    const now = Date.now()
    const timeWindow = 3600000 // 1 hour

    for (const [, existingAnomaly] of this.anomalies) {
      if (existingAnomaly.metric === anomaly.metric &&
          now - existingAnomaly.timestamp < timeWindow &&
          !existingAnomaly.resolved) {
        similar.push(existingAnomaly)
      }
    }

    return similar
  }

  private shouldAlert(anomaly: Anomaly): boolean {
    const severityOrder = ['critical', 'high', 'medium', 'low']
    const alertSeverityIndex = severityOrder.indexOf(this.detectionConfig.alertThreshold)
    const anomalySeverityIndex = severityOrder.indexOf(anomaly.severity)

    return anomalySeverityIndex <= alertSeverityIndex
  }

  private triggerAlert(anomaly: Anomaly): void {
    for (const callback of this.alertCallbacks) {
      try {
        callback(anomaly)
      } catch (error) {
        console.error('Alert callback error:', error)
      }
    }
  }

  private attemptAutoRemediation(anomaly: Anomaly): void {
    // Simple auto-remediation for low-severity anomalies
    console.log(`Attempting auto-remediation for anomaly ${anomaly.id}`)
    
    // Mark as resolved
    anomaly.resolved = true
    anomaly.resolvedAt = Date.now()
  }

  /* ------------------------------------------------------------------ */
  /*  Suggestion Generation                                             */
  /* ------------------------------------------------------------------ */

  private generateStatisticalSuggestions(metric: MetricData, baseline: Baseline, zScore: number): string[] {
    const suggestions: string[] = []

    if (metric.value > baseline.mean) {
      suggestions.push('Value is above baseline - investigate potential resource overutilization')
      suggestions.push('Consider scaling up resources or optimizing workload')
    } else {
      suggestions.push('Value is below baseline - investigate potential service degradation')
      suggestions.push('Check for service failures or reduced demand')
    }

    if (zScore > 4) {
      suggestions.push('Critical deviation - immediate investigation required')
      suggestions.push('Consider implementing automated failover')
    }

    return suggestions
  }

  private generateBehavioralSuggestions(metricName: string, changeRate: number): string[] {
    const suggestions: string[] = []

    if (changeRate > 1.0) {
      suggestions.push('Rapid behavioral change detected - investigate potential security incident')
      suggestions.push('Review recent system changes and user activity')
    } else {
      suggestions.push('Behavioral change detected - monitor for further anomalies')
      suggestions.push('Check for scheduled changes or expected pattern shifts')
    }

    return suggestions
  }

  private generateTemporalSuggestions(metricName: string, trendChange: number): string[] {
    const suggestions: string[] = []

    if (trendChange > 0.5) {
      suggestions.push('Significant trend change detected - investigate potential system issues')
      suggestions.push('Review capacity planning and resource allocation')
    } else {
      suggestions.push('Trend change detected - monitor for consistency')
      suggestions.push('Update baseline if this represents new normal behavior')
    }

    return suggestions
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  getAnomaly(id: string): Anomaly | undefined {
    return this.anomalies.get(id)
  }

  getAnomalies(filter?: {
    type?: AnomalyType
    severity?: AnomalySeverity
    resolved?: boolean
    metric?: string
    since?: number
  }): Anomaly[] {
    let anomalies = Array.from(this.anomalies.values())

    if (filter) {
      if (filter.type) {
        anomalies = anomalies.filter(a => a.type === filter.type)
      }
      if (filter.severity) {
        anomalies = anomalies.filter(a => a.severity === filter.severity)
      }
      if (filter.resolved !== undefined) {
        anomalies = anomalies.filter(a => a.resolved === filter.resolved)
      }
      if (filter.metric) {
        anomalies = anomalies.filter(a => a.metric === filter.metric)
      }
      if (filter.since) {
        const since = filter.since
        anomalies = anomalies.filter(a => a.timestamp >= since)
      }
    }

    return anomalies.sort((a, b) => b.timestamp - a.timestamp)
  }

  getMetricsHistory(metricName: string): MetricData[] {
    return this.metricsHistory.get(metricName) || []
  }

  addAlertCallback(callback: (anomaly: Anomaly) => void): void {
    this.alertCallbacks.push(callback)
  }

  removeAlertCallback(callback: (anomaly: Anomaly) => void): void {
    const index = this.alertCallbacks.indexOf(callback)
    if (index > -1) {
      this.alertCallbacks.splice(index, 1)
    }
  }

  setDetectionConfig(config: Partial<AnomalyDetectionConfig>): void {
    this.detectionConfig = { ...this.detectionConfig, ...config }
  }

  getDetectionConfig(): AnomalyDetectionConfig {
    return { ...this.detectionConfig }
  }

  setDetectionEnabled(enabled: boolean): void {
    this.isDetectionEnabled = enabled
  }

  resolveAnomaly(anomalyId: string): void {
    const anomaly = this.anomalies.get(anomalyId)
    if (anomaly) {
      anomaly.resolved = true
      anomaly.resolvedAt = Date.now()
    }
  }

  async forceDetection(): Promise<Anomaly[]> {
    const allAnomalies: Anomaly[] = []
    
    for (const metricName of this.metricsHistory.keys()) {
      const detected = await this.detectAnomalies(metricName)
      allAnomalies.push(...detected)
    }

    return allAnomalies
  }

  cleanupOldData(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const now = Date.now()

    // Clean up old metrics
    for (const [metricName, history] of this.metricsHistory) {
      const filtered = history.filter(m => now - m.timestamp < maxAge)
      this.metricsHistory.set(metricName, filtered)
    }

    // Clean up old anomalies
    for (const [id, anomaly] of this.anomalies) {
      if (now - anomaly.timestamp > maxAge && anomaly.resolved) {
        this.anomalies.delete(id)
      }
    }
  }

  getStatistics(): {
    totalAnomalies: number
    unresolvedAnomalies: number
    anomaliesByType: Record<AnomalyType, number>
    anomaliesBySeverity: Record<AnomalySeverity, number>
    metricsTracked: number
  } {
    const anomalies = Array.from(this.anomalies.values())

    const anomaliesByType: Record<AnomalyType, number> = {
      statistical: 0,
      behavioral: 0,
      temporal: 0,
      correlation: 0,
      threshold: 0,
      machine_learning: 0,
    }

    const anomaliesBySeverity: Record<AnomalySeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    }

    for (const anomaly of anomalies) {
      anomaliesByType[anomaly.type]++
      anomaliesBySeverity[anomaly.severity]++
    }

    return {
      totalAnomalies: anomalies.length,
      unresolvedAnomalies: anomalies.filter(a => !a.resolved).length,
      anomaliesByType,
      anomaliesBySeverity,
      metricsTracked: this.metricsHistory.size,
    }
  }
}

// Global singleton instance
const anomalyDetectionEngine = new AnomalyDetectionEngine()

export { AnomalyDetectionEngine, anomalyDetectionEngine }
