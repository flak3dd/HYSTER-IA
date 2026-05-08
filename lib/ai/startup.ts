import { aiInitializer } from './ai-initializer'
import { serverEnv } from '@/lib/env'

/* ------------------------------------------------------------------ */
/*  Automatic AI System Startup                                         */
/* ------------------------------------------------------------------ */

/**
 * This file is automatically imported during application startup
 * to initialize AI systems with minimal human interaction required.
 */

let initializationPromise: Promise<void> | null = null

export async function initializeAISystems(): Promise<void> {
  if (initializationPromise) {
    return initializationPromise
  }

  initializationPromise = (async () => {
    try {
      console.log('🤖 Initializing AI Systems...')
      const env = serverEnv();

      const result = await aiInitializer.initialize({
        enableTaskScheduling: env.ENABLE_AI_SCHEDULING,
        enableSelfOptimization: env.ENABLE_AI_OPTIMIZATION,
        enablePredictiveCaching: env.ENABLE_AI_PREDICTIVE_CACHE,
        enableThreatCorrelation: env.ENABLE_AI_THREAT_CORRELATION,
        enableAnomalyDetection: env.ENABLE_AI_ANOMALY_DETECTION,
        redisUrl: env.REDIS_URL,
        optimizationInterval: env.AI_OPTIMIZATION_INTERVAL,
      })

      if (result.success) {
        console.log('✅ AI Systems initialized successfully')
        console.log('📊 Systems status:', result.systems)
      } else {
        console.error('❌ AI Systems initialization failed:', result.systems)
      }
    } catch (error) {
      console.error('❌ AI Systems startup error:', error)
    }
  })()

  return initializationPromise
}

// Auto-initialize on module import (can be disabled via environment variable)
const g = globalThis as typeof globalThis & { __aiSystemsInitializing?: boolean }
const env = serverEnv();
if (env.AUTO_INIT_AI && !g.__aiSystemsInitializing) {
  g.__aiSystemsInitializing = true
  // Don't await - let it initialize in the background
  initializeAISystems().catch(console.error)
}

export { aiInitializer }