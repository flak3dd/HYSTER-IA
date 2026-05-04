/**
 * API Route: Reasoning Statistics
 * 
 * Provides endpoints for:
 * - Getting overall reasoning statistics
 * - Getting calibration statistics
 * - Getting uncertainty history
 * - Getting knowledge gaps
 */

import { NextRequest, NextResponse } from 'next/server'
import { reasoningTraceSystem } from '@/lib/ai/reasoning/reasoning-trace'
import { metaCognitionEngine } from '@/lib/ai/reasoning/meta-cognition'

/**
 * GET /api/admin/reasoning/stats
 * Get reasoning statistics
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'all'

    const response: any = {
      success: true,
    }

    if (type === 'all' || type === 'traces') {
      response.traceStats = reasoningTraceSystem.getStatistics()
    }

    if (type === 'all' || type === 'calibration') {
      response.calibrationStats = metaCognitionEngine.getCalibrationStats()
    }

    if (type === 'all' || type === 'uncertainty') {
      const since = searchParams.get('since')
      const uncertaintyHistory = metaCognitionEngine.getUncertaintyHistory(
        since ? { since: parseInt(since, 10) } : undefined
      )
      response.uncertaintyHistory = uncertaintyHistory.slice(0, 100) // Limit to 100
    }

    if (type === 'all' || type === 'gaps') {
      const includeResolved = searchParams.get('includeResolved') === 'true'
      response.knowledgeGaps = metaCognitionEngine.getKnowledgeGaps(includeResolved)
    }

    if (type === 'all' || type === 'metacognitive') {
      response.metacognitiveState = metaCognitionEngine.getMetacognitiveState()
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error getting reasoning statistics:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get statistics',
      },
      { status: 500 }
    )
  }
}