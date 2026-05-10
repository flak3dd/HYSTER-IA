import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin, toErrorResponse } from '@/lib/auth/admin'
import { orchestrationEngine, TaskType } from '@/lib/ai/orchestration-engine'
import { intelligentScheduler } from '@/lib/ai/intelligent-scheduler'
import { selfOptimizingConfig } from '@/lib/ai/self-optimizing-config'
import { predictiveCaching } from '@/lib/ai/predictive-caching'
import { threatCorrelationEngine } from '@/lib/ai/threat-correlation'
import { anomalyDetectionEngine } from '@/lib/ai/anomaly-detection'
import { aiInitializer } from '@/lib/ai/ai-initializer'

// POST /api/admin/ai/autonomous/task - Create autonomous task
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)

    const body = await request.json()
    const { action, type, target, parameters } = body

    switch (action) {
      case 'create_task':
        return await handleCreateTask(type, target, parameters)
      case 'schedule_task':
        return await handleScheduleTask(type, target, parameters)
      case 'optimize_system':
        return await handleOptimizeSystem()
      case 'prefetch_cache':
        return await handlePrefetchCache()
      case 'correlate_threats':
        return await handleCorrelateThreats()
      case 'detect_anomalies':
        return await handleDetectAnomalies()
      case 'initialize':
        return await handleInitializeAI(parameters)
      case 'shutdown':
        return await handleShutdownAI()
      case 'reconfigure':
        return await handleReconfigureAI(parameters)
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error) {
    return toErrorResponse(error)
  }
}

// GET /api/admin/ai/autonomous - Get autonomous system status
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)

    const searchParams = request.nextUrl.searchParams
    const statusType = searchParams.get('type') || 'overview'

    switch (statusType) {
      case 'overview':
        return await handleOverview()
      case 'tasks':
        return await handleTasksStatus()
      case 'optimization':
        return await handleOptimizationStatus()
      case 'cache':
        return await handleCacheStatus()
      case 'threats':
        return await handleThreatStatus()
      case 'anomalies':
        return await handleAnomalyStatus()
      case 'initializer':
        return await handleInitializerStatus()
      default:
        return NextResponse.json({ error: 'Unknown status type' }, { status: 400 })
    }
  } catch (error) {
    return toErrorResponse(error)
  }
}

/* ------------------------------------------------------------------ */
/*  Task Handlers                                                      */
/* ------------------------------------------------------------------ */

async function handleCreateTask(
  type: TaskType,
  target: string,
  parameters: Record<string, unknown> = {}
): Promise<NextResponse> {
  const task = await orchestrationEngine.createAutonomousTask(type, target, parameters)
  return NextResponse.json({
    success: true,
    task,
  })
}

async function handleScheduleTask(
  type: TaskType,
  target: string,
  parameters: Record<string, unknown> = {}
): Promise<NextResponse> {
  const task = await orchestrationEngine.createAutonomousTask(type, target, parameters)
  const decision = await intelligentScheduler.scheduleTask(task)
  
  return NextResponse.json({
    success: true,
    task,
    scheduleDecision: decision,
  })
}

/* ------------------------------------------------------------------ */
/*  Optimization Handlers                                              */
/* ------------------------------------------------------------------ */

async function handleOptimizeSystem(): Promise<NextResponse> {
  const optimizations = await orchestrationEngine.performAutonomousOptimization()
  const recommendations = await selfOptimizingConfig.getOptimizationRecommendations()

  return NextResponse.json({
    success: true,
    optimizations,
    recommendations,
    timestamp: Date.now(),
  })
}

/* ------------------------------------------------------------------ */
/*  Cache Handlers                                                     */
/* ------------------------------------------------------------------ */

async function handlePrefetchCache(): Promise<NextResponse> {
  await predictiveCaching.forcePrefetchCycle()
  const stats = predictiveCaching.getCacheStats()

  return NextResponse.json({
    success: true,
    stats,
    timestamp: Date.now(),
  })
}

/* ------------------------------------------------------------------ */
/*  Threat Intelligence Handlers                                       */
/* ------------------------------------------------------------------ */

async function handleCorrelateThreats(): Promise<NextResponse> {
  await threatCorrelationEngine.forceCorrelationAnalysis()
  const intelligence = threatCorrelationEngine.generateThreatIntelligence()

  return NextResponse.json({
    success: true,
    intelligence,
    timestamp: Date.now(),
  })
}

/* ------------------------------------------------------------------ */
/*  Anomaly Detection Handlers                                         */
/* ------------------------------------------------------------------ */

async function handleDetectAnomalies(): Promise<NextResponse> {
  const anomalies = await anomalyDetectionEngine.forceDetection()
  const statistics = anomalyDetectionEngine.getStatistics()

  return NextResponse.json({
    success: true,
    anomalies,
    statistics,
    timestamp: Date.now(),
  })
}

/* ------------------------------------------------------------------ */
/*  Status Handlers                                                    */
/* ------------------------------------------------------------------ */

async function handleOverview(): Promise<NextResponse> {
  const tasks = orchestrationEngine.getAllTasks()
  const metrics = orchestrationEngine.getMetrics()
  const queueStatus = await intelligentScheduler.getQueueStatus()
  const cacheStats = predictiveCaching.getCacheStats()
  const anomalyStats = anomalyDetectionEngine.getStatistics()

  return NextResponse.json({
    success: true,
    overview: {
      tasks: {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        running: tasks.filter(t => t.status === 'running').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed: tasks.filter(t => t.status === 'failed').length,
      },
      queue: queueStatus,
      cache: cacheStats,
      anomalies: anomalyStats,
      systemMetrics: metrics,
    },
    timestamp: Date.now(),
  })
}

async function handleTasksStatus(): Promise<NextResponse> {
  const tasks = orchestrationEngine.getAllTasks()
  const queueStatus = await intelligentScheduler.getQueueStatus()

  return NextResponse.json({
    success: true,
    tasks,
    queueStatus,
    timestamp: Date.now(),
  })
}

async function handleOptimizationStatus(): Promise<NextResponse> {
  const configs = selfOptimizingConfig.getAllConfigs()
  const history = orchestrationEngine.getOptimizationHistory()

  return NextResponse.json({
    success: true,
    configs,
    optimizationHistory: history,
    timestamp: Date.now(),
  })
}

async function handleCacheStatus(): Promise<NextResponse> {
  const accessPatterns = predictiveCaching.getAllAccessPatterns()
  const predictions = predictiveCaching.getPredictions()
  const stats = predictiveCaching.getCacheStats()

  return NextResponse.json({
    success: true,
    accessPatterns: accessPatterns.slice(0, 20), // Limit to 20 for performance
    predictions: predictions.slice(0, 20),
    stats,
    timestamp: Date.now(),
  })
}

async function handleThreatStatus(): Promise<NextResponse> {
  const intelligence = threatCorrelationEngine.generateThreatIntelligence()

  return NextResponse.json({
    success: true,
    intelligence,
    timestamp: Date.now(),
  })
}

async function handleAnomalyStatus(): Promise<NextResponse> {
  const anomalies = anomalyDetectionEngine.getAnomalies({ resolved: false })
  const statistics = anomalyDetectionEngine.getStatistics()
  const config = anomalyDetectionEngine.getDetectionConfig()

  return NextResponse.json({
    success: true,
    anomalies: anomalies.slice(0, 50), // Limit to 50 for performance
    statistics,
    config,
    timestamp: Date.now(),
  })
}

async function handleInitializerStatus(): Promise<NextResponse> {
  const status = await aiInitializer.getStatus()
  const config = aiInitializer.getConfig()

  return NextResponse.json({
    success: true,
    initialized: status.initialized,
    systems: status.systems,
    config,
    timestamp: Date.now(),
  })
}

async function handleInitializeAI(parameters: Record<string, unknown> = {}): Promise<NextResponse> {
  const result = await aiInitializer.initialize(parameters)

  return NextResponse.json({
    success: result.success,
    systems: result.systems,
    timestamp: result.timestamp,
  })
}

async function handleShutdownAI(): Promise<NextResponse> {
  const result = await aiInitializer.shutdown()

  return NextResponse.json({
    success: result.success,
    message: result.message,
  })
}

async function handleReconfigureAI(parameters: Record<string, unknown> = {}): Promise<NextResponse> {
  await aiInitializer.reconfigure(parameters)
  const status = await aiInitializer.getStatus()

  return NextResponse.json({
    success: true,
    initialized: status.initialized,
    systems: status.systems,
    config: status.config,
    timestamp: Date.now(),
  })
}
