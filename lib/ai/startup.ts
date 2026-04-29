import { aiInitializer } from './ai-initializer'

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

      const result = await aiInitializer.initialize({
        enableTaskScheduling: process.env.ENABLE_AI_SCHEDULING !== 'false',
        enableSelfOptimization: process.env.ENABLE_AI_OPTIMIZATION !== 'false',
        enablePredictiveCaching: process.env.ENABLE_AI_PREDICTIVE_CACHE !== 'false',
        enableThreatCorrelation: process.env.ENABLE_AI_THREAT_CORRELATION !== 'false',
        enableAnomalyDetection: process.env.ENABLE_AI_ANOMALY_DETECTION !== 'false',
        redisUrl: process.env.REDIS_URL,
        optimizationInterval: parseInt(process.env.AI_OPTIMIZATION_INTERVAL || '300000', 10),
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
if (process.env.AUTO_INIT_AI !== 'false') {
  // Don't await - let it initialize in the background
  initializeAISystems().catch(console.error)
}

export { aiInitializer }