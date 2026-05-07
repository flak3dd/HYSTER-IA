import { intelligentScheduler } from './intelligent-scheduler'
import { selfOptimizingConfig } from './self-optimizing-config'
import { predictiveCaching } from './predictive-caching'
import { threatCorrelationEngine } from './threat-correlation'
import { anomalyDetectionEngine } from './anomaly-detection'

/* ------------------------------------------------------------------ */
/*  AI System Initializer                                              */
/* ------------------------------------------------------------------ */

interface AIInitializationConfig {
  enableTaskScheduling: boolean
  enableSelfOptimization: boolean
  enablePredictiveCaching: boolean
  enableThreatCorrelation: boolean
  enableAnomalyDetection: boolean
  redisUrl?: string
  optimizationInterval: number
}

class AIInitializer {
  private isInitialized: boolean
  private initializationConfig: AIInitializationConfig

  constructor() {
    this.isInitialized = false
    this.initializationConfig = {
      enableTaskScheduling: true,
      enableSelfOptimization: true,
      enablePredictiveCaching: true,
      enableThreatCorrelation: true,
      enableAnomalyDetection: true,
      optimizationInterval: 300000, // 5 minutes
    }
  }

  /**
   * Initialize all AI systems with autonomous capabilities
   */
  async initialize(config?: Partial<AIInitializationConfig>): Promise<{
    success: boolean
    systems: Record<string, { status: string; message: string }>
    timestamp: number
  }> {
    if (this.isInitialized) {
      return {
        success: true,
        systems: {
          all: { status: 'already_initialized', message: 'AI systems already initialized' },
        },
        timestamp: Date.now(),
      }
    }

    // Merge configuration
    this.initializationConfig = { ...this.initializationConfig, ...config }

    const systems: Record<string, { status: string; message: string }> = {}

    try {
      // Initialize Intelligent Scheduler
      if (this.initializationConfig.enableTaskScheduling) {
        await this.initializeScheduler()
        systems.scheduler = { status: 'initialized', message: 'Intelligent task scheduler started' }
      } else {
        systems.scheduler = { status: 'disabled', message: 'Task scheduling disabled' }
      }

      // Initialize Self-Optimizing Config
      if (this.initializationConfig.enableSelfOptimization) {
        await this.initializeSelfOptimization()
        systems.selfOptimization = { status: 'initialized', message: 'Self-optimizing configuration started' }
      } else {
        systems.selfOptimization = { status: 'disabled', message: 'Self-optimization disabled' }
      }

      // Initialize Predictive Caching
      if (this.initializationConfig.enablePredictiveCaching) {
        await this.initializePredictiveCaching()
        systems.predictiveCaching = { status: 'initialized', message: 'Predictive caching engine started' }
      } else {
        systems.predictiveCaching = { status: 'disabled', message: 'Predictive caching disabled' }
      }

      // Initialize Threat Correlation
      if (this.initializationConfig.enableThreatCorrelation) {
        await this.initializeThreatCorrelation()
        systems.threatCorrelation = { status: 'initialized', message: 'Threat correlation engine started' }
      } else {
        systems.threatCorrelation = { status: 'disabled', message: 'Threat correlation disabled' }
      }

      // Initialize Anomaly Detection
      if (this.initializationConfig.enableAnomalyDetection) {
        await this.initializeAnomalyDetection()
        systems.anomalyDetection = { status: 'initialized', message: 'Anomaly detection engine started' }
      } else {
        systems.anomalyDetection = { status: 'disabled', message: 'Anomaly detection disabled' }
      }

      this.isInitialized = true

      return {
        success: true,
        systems,
        timestamp: Date.now(),
      }
    } catch (error) {
      console.error('AI initialization error:', error)
      return {
        success: false,
        systems: {
          error: { status: 'failed', message: error instanceof Error ? error.message : String(error) },
        },
        timestamp: Date.now(),
      }
    }
  }

  /**
   * Shutdown all AI systems gracefully
   */
  async shutdown(): Promise<{ success: boolean; message: string }> {
    try {
      // Shutdown scheduler
      await intelligentScheduler.shutdown()

      // Stop self-optimization
      selfOptimizingConfig.stopAutonomousOptimization()

      // Stop learning systems
      predictiveCaching.setLearningEnabled(false)
      threatCorrelationEngine.setAutoCorrelationEnabled(false)
      anomalyDetectionEngine.setDetectionEnabled(false)

      this.isInitialized = false

      return {
        success: true,
        message: 'All AI systems shutdown successfully',
      }
    } catch (error) {
      console.error('AI shutdown error:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Individual System Initializers                                     */
  /* ------------------------------------------------------------------ */

  private async initializeScheduler(): Promise<void> {
    await intelligentScheduler.initialize(this.initializationConfig.redisUrl)
    console.log('✅ Intelligent Scheduler initialized')
  }

  private async initializeSelfOptimization(): Promise<void> {
    selfOptimizingConfig.startAutonomousOptimization(this.initializationConfig.optimizationInterval)
    console.log('✅ Self-Optimizing Config initialized')
  }

  private async initializePredictiveCaching(): Promise<void> {
    // Predictive caching starts automatically on construction
    console.log('✅ Predictive Caching initialized')
  }

  private async initializeThreatCorrelation(): Promise<void> {
    // Threat correlation starts automatically on construction
    console.log('✅ Threat Correlation initialized')
  }

  private async initializeAnomalyDetection(): Promise<void> {
    // Setup alert callback for anomalies
    anomalyDetectionEngine.addAlertCallback((anomaly) => {
      console.log(`🚨 Anomaly detected: ${anomaly.description}`)
      // Here you could send notifications, trigger automated responses, etc.
    })

    console.log('✅ Anomaly Detection initialized')
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  isReady(): boolean {
    return this.isInitialized
  }

  getConfig(): AIInitializationConfig {
    return { ...this.initializationConfig }
  }

  async getStatus(): Promise<{
    initialized: boolean
    systems: Record<string, boolean>
    config: AIInitializationConfig
  }> {
    return {
      initialized: this.isInitialized,
      systems: {
        scheduler: this.initializationConfig.enableTaskScheduling,
        selfOptimization: this.initializationConfig.enableSelfOptimization,
        predictiveCaching: this.initializationConfig.enablePredictiveCaching,
        threatCorrelation: this.initializationConfig.enableThreatCorrelation,
        anomalyDetection: this.initializationConfig.enableAnomalyDetection,
      },
      config: this.getConfig(),
    }
  }

  async reconfigure(config: Partial<AIInitializationConfig>): Promise<void> {
    // Shutdown existing systems
    if (this.isInitialized) {
      await this.shutdown()
    }

    // Reinitialize with new config
    await this.initialize(config)
  }
}

// Global singleton instance (globalThis-guarded to survive HMR)
const gAI = globalThis as typeof globalThis & { __aiInitializer?: AIInitializer }
const aiInitializer = gAI.__aiInitializer ?? new AIInitializer()
if (!gAI.__aiInitializer) gAI.__aiInitializer = aiInitializer

export { AIInitializer, aiInitializer }
