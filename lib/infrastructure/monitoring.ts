import { EventEmitter } from "node:events"
import { randomUUID } from "node:crypto"
import { z } from "zod"

export const HealthStatus = z.enum(["healthy", "degraded", "unhealthy", "unknown"])
export type HealthStatus = z.infer<typeof HealthStatus>

export const AlertSeverity = z.enum(["low", "medium", "high", "critical"])
export type AlertSeverity = z.infer<typeof AlertSeverity>

export const MetricType = z.enum([
  "latency",
  "bandwidth",
  "error_rate",
  "connection_count",
  "cpu_usage",
  "memory_usage",
  "disk_usage",
  "packet_loss"
])
export type MetricType = z.infer<typeof MetricType>

export const HealthCheck = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["http", "tcp", "icmp", "hysteria"]),
  target: z.string().min(1),
  interval: z.number().int().min(1000).default(30000),
  timeout: z.number().int().min(1000).default(5000),
  retries: z.number().int().min(0).max(5).default(3),
  enabled: z.boolean().default(true),
  status: HealthStatus.default("unknown"),
  lastCheck: z.number().int().nullable().default(null),
  lastSuccess: z.number().int().nullable().default(null),
  lastFailure: z.number().int().nullable().default(null),
  consecutiveFailures: z.number().int().default(0),
  totalChecks: z.number().int().default(0),
  successfulChecks: z.number().int().default(0),
  metadata: z.record(z.string(), z.unknown()).optional()
})
export type HealthCheck = z.infer<typeof HealthCheck>

export const Alert = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: AlertSeverity,
  source: z.string().min(1),
  metric: MetricType.optional(),
  value: z.number().optional(),
  threshold: z.number().optional(),
  status: z.enum(["active", "acknowledged", "resolved"]).default("active"),
  createdAt: z.number().int(),
  acknowledgedAt: z.number().int().nullable().default(null),
  resolvedAt: z.number().int().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).optional()
})
export type Alert = z.infer<typeof Alert>

export const Metric = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: MetricType,
  source: z.string().min(1),
  value: z.number(),
  unit: z.string().optional(),
  timestamp: z.number().int(),
  labels: z.record(z.string(), z.string()).optional()
})
export type Metric = z.infer<typeof Metric>

export class InfrastructureMonitor extends EventEmitter {
  private healthChecks: Map<string, HealthCheck> = new Map()
  private alerts: Map<string, Alert> = new Map()
  private metrics: Map<string, Metric[]> = new Map()
  private timers: Map<string, NodeJS.Timeout> = new Map()
  private thresholds: Map<MetricType, { warning: number; critical: number }> = new Map()

  constructor() {
    super()
    this.setupDefaultThresholds()
  }

  /**
   * Setup default alert thresholds
   */
  private setupDefaultThresholds(): void {
    this.thresholds.set("latency", { warning: 1000, critical: 5000 })
    this.thresholds.set("error_rate", { warning: 5, critical: 20 })
    this.thresholds.set("cpu_usage", { warning: 70, critical: 90 })
    this.thresholds.set("memory_usage", { warning: 80, critical: 95 })
    this.thresholds.set("disk_usage", { warning: 85, critical: 95 })
    this.thresholds.set("packet_loss", { warning: 1, critical: 5 })
  }

  /**
   * Add a new health check
   */
  addHealthCheck(checkData: Omit<HealthCheck, "id">): HealthCheck {
    const check: HealthCheck = {
      ...checkData,
      id: randomUUID()
    }

    this.healthChecks.set(check.id, check)
    
    if (check.enabled) {
      this.scheduleHealthCheck(check.id)
    }

    this.emit("healthCheckAdded", check)
    return check
  }

  /**
   * Remove a health check
   */
  removeHealthCheck(id: string): boolean {
    const check = this.healthChecks.get(id)
    if (!check) return false

    // Stop scheduled checks
    const timer = this.timers.get(id)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(id)
    }

    this.healthChecks.delete(id)
    this.emit("healthCheckRemoved", check)
    return true
  }

  /**
   * Schedule a health check
   */
  private scheduleHealthCheck(id: string): void {
    const check = this.healthChecks.get(id)
    if (!check || !check.enabled) return

    const timer = setInterval(async () => {
      await this.performHealthCheck(id)
    }, check.interval)

    this.timers.set(id, timer)
  }

  /**
   * Perform a health check
   */
  private async performHealthCheck(id: string): Promise<void> {
    const check = this.healthChecks.get(id)
    if (!check) return

    const startTime = Date.now()
    check.lastCheck = startTime
    check.totalChecks++

    let success = false
    let latency: number | null = null

    try {
      switch (check.type) {
        case "http":
          success = await this.performHttpCheck(check)
          break
        case "tcp":
          success = await this.performTcpCheck(check)
          break
        case "icmp":
          success = await this.performIcmpCheck(check)
          break
        case "hysteria":
          success = await this.performHysteriaCheck(check)
          break
        default:
          success = false
      }

      latency = Date.now() - startTime

      if (success) {
        check.lastSuccess = startTime
        check.consecutiveFailures = 0
        check.successfulChecks++
        
        if (check.status !== "healthy") {
          check.status = "healthy"
          this.emit("healthStatusChanged", { check, status: "healthy" })
        }

        // Record latency metric
        this.recordMetric({
          name: "health_check_latency",
          type: "latency",
          source: check.name,
          value: latency,
          unit: "ms",
          timestamp: startTime,
          labels: { checkType: check.type, target: check.target }
        })
      } else {
        throw new Error("Health check failed")
      }

    } catch (error) {
      check.lastFailure = startTime
      check.consecutiveFailures++

      const newStatus = check.consecutiveFailures >= 3 ? "unhealthy" : "degraded"
      if (check.status !== newStatus) {
        check.status = newStatus
        this.emit("healthStatusChanged", { check, status: newStatus })
      }

      // Create alert for consecutive failures
      if (check.consecutiveFailures === 3) {
        this.createAlert({
          title: `Health Check Failure: ${check.name}`,
          description: `Health check for ${check.target} has failed ${check.consecutiveFailures} times consecutively`,
          severity: "high",
          source: check.name,
          status: "active" as const,
          metric: "error_rate",
          value: check.consecutiveFailures,
          threshold: 3,
          acknowledgedAt: null,
          resolvedAt: null
        })
      }
    }

    this.emit("healthCheckCompleted", { check, success, latency })
  }

  /**
   * Perform HTTP health check
   */
  private async performHttpCheck(check: HealthCheck): Promise<boolean> {
    const url = check.target.startsWith('http') ? check.target : `https://${check.target}`
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), check.timeout)
    
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "InfrastructureMonitor/1.0"
      }
    })
    
    clearTimeout(timeoutId)

    return response.ok
  }

  /**
   * Perform TCP health check
   */
  private async performTcpCheck(check: HealthCheck): Promise<boolean> {
    const [hostname, port] = check.target.split(':')
    
    return new Promise((resolve) => {
      const net = require('net')
      const socket = new net.Socket()
      
      socket.setTimeout(check.timeout)
      
      socket.on('connect', () => {
        socket.destroy()
        resolve(true)
      })
      
      socket.on('timeout', () => {
        socket.destroy()
        resolve(false)
      })
      
      socket.on('error', () => {
        resolve(false)
      })
      
      socket.connect(parseInt(port), hostname)
    })
  }

  /**
   * Perform ICMP health check
   */
  private async performIcmpCheck(check: HealthCheck): Promise<boolean> {
    const { exec } = require('child_process')
    
    return new Promise((resolve) => {
      exec(`ping -c 1 -W ${check.timeout / 1000} ${check.target}`, (error: any) => {
        resolve(!error)
      })
    })
  }

  /**
   * Perform Hysteria health check
   */
  private async performHysteriaCheck(check: HealthCheck): Promise<boolean> {
    // This would implement Hysteria-specific health checks
    // For now, fall back to TCP check
    return this.performTcpCheck(check)
  }

  /**
   * Record a metric
   */
  recordMetric(metric: Omit<Metric, "id">): void {
    const metricWithId: Metric = {
      ...metric,
      id: randomUUID()
    }

    const sourceMetrics = this.metrics.get(metric.source) || []
    sourceMetrics.push(metricWithId)

    // Keep only last 1000 metrics per source
    if (sourceMetrics.length > 1000) {
      sourceMetrics.splice(0, sourceMetrics.length - 1000)
    }

    this.metrics.set(metric.source, sourceMetrics)

    // Check thresholds and create alerts
    this.checkMetricThresholds(metricWithId)
    this.emit("metricRecorded", metricWithId)
  }

  /**
   * Check metric thresholds and create alerts
   */
  private checkMetricThresholds(metric: Metric): void {
    const threshold = this.thresholds.get(metric.type)
    if (!threshold) return

    if (metric.value >= threshold.critical) {
      this.createAlert({
        title: `Critical Threshold Exceeded: ${metric.name}`,
        description: `${metric.type} for ${metric.source} is ${metric.value} (critical threshold: ${threshold.critical})`,
        severity: "critical",
        source: metric.source,
        status: "active" as const,
        metric: metric.type,
        value: metric.value,
        threshold: threshold.critical,
        acknowledgedAt: null,
        resolvedAt: null
      })
    } else if (metric.value >= threshold.warning) {
      this.createAlert({
        title: `Warning Threshold Exceeded: ${metric.name}`,
        description: `${metric.type} for ${metric.source} is ${metric.value} (warning threshold: ${threshold.warning})`,
        severity: "medium",
        source: metric.source,
        status: "active" as const,
        metric: metric.type,
        value: metric.value,
        threshold: threshold.warning,
        acknowledgedAt: null,
        resolvedAt: null
      })
    }
  }

  /**
   * Create an alert
   */
  createAlert(alertData: Omit<Alert, "id" | "createdAt">): Alert {
    const alert: Alert = {
      ...alertData,
      id: randomUUID(),
      createdAt: Date.now()
    }

    this.alerts.set(alert.id, alert)
    this.emit("alertCreated", alert)
    return alert
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(id: string): boolean {
    const alert = this.alerts.get(id)
    if (!alert || alert.status !== "active") return false

    alert.status = "acknowledged"
    alert.acknowledgedAt = Date.now()
    this.emit("alertAcknowledged", alert)
    return true
  }

  /**
   * Resolve an alert
   */
  resolveAlert(id: string): boolean {
    const alert = this.alerts.get(id)
    if (!alert) return false

    alert.status = "resolved"
    alert.resolvedAt = Date.now()
    this.emit("alertResolved", alert)
    return true
  }

  /**
   * Get system health summary
   */
  getHealthSummary() {
    const checks = Array.from(this.healthChecks.values())
    const healthy = checks.filter(c => c.status === "healthy").length
    const degraded = checks.filter(c => c.status === "degraded").length
    const unhealthy = checks.filter(c => c.status === "unhealthy").length

    const alerts = Array.from(this.alerts.values())
    const activeAlerts = alerts.filter(a => a.status === "active").length
    const criticalAlerts = alerts.filter(a => a.status === "active" && a.severity === "critical").length

    return {
      totalChecks: checks.length,
      healthy,
      degraded,
      unhealthy,
      overallStatus: unhealthy > 0 ? "unhealthy" : degraded > 0 ? "degraded" : "healthy",
      totalAlerts: alerts.length,
      activeAlerts,
      criticalAlerts,
      lastUpdate: Date.now()
    }
  }

  /**
   * Get metrics for a source
   */
  getMetrics(source: string, type?: MetricType, limit: number = 100): Metric[] {
    const metrics = this.metrics.get(source) || []
    let filtered = metrics

    if (type) {
      filtered = metrics.filter(m => m.type === type)
    }

    return filtered.slice(-limit)
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(severity?: AlertSeverity): Alert[] {
    const alerts = Array.from(this.alerts.values())
      .filter(alert => alert.status === "active")

    if (severity) {
      return alerts.filter(alert => alert.severity === severity)
    }

    return alerts
  }

  /**
   * Get all health checks
   */
  getHealthChecks(): HealthCheck[] {
    return Array.from(this.healthChecks.values())
  }

  /**
   * Cleanup old metrics and resolved alerts
   */
  cleanup(): void {
    const now = Date.now()
    const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days

    // Cleanup old metrics
    for (const [source, metrics] of this.metrics.entries()) {
      const filtered = metrics.filter(m => now - m.timestamp < maxAge)
      this.metrics.set(source, filtered)
    }

    // Cleanup old resolved alerts
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.status === "resolved" && alert.resolvedAt && now - alert.resolvedAt > maxAge) {
        this.alerts.delete(id)
      }
    }

    this.emit("cleanupCompleted")
  }

  /**
   * Stop all monitoring
   */
  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer)
    }
    this.timers.clear()
    this.removeAllListeners()
  }
}