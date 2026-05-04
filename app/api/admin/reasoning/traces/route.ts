/**
 * API Route: Reasoning Traces
 * 
 * Provides endpoints for:
 * - Listing reasoning traces
 * - Getting trace details
 * - Exporting traces
 * - Getting trace statistics
 */

import { NextRequest, NextResponse } from 'next/server'
import { reasoningTraceSystem } from '@/lib/ai/reasoning/reasoning-trace'
import { metaCognitionEngine } from '@/lib/ai/reasoning/meta-cognition'
import { cotEngine } from '@/lib/ai/reasoning/chain-of-thought'

/**
 * GET /api/admin/reasoning/traces
 * List reasoning traces with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const sessionId = searchParams.get('sessionId')
    const since = searchParams.get('since')
    const minConfidence = searchParams.get('minConfidence')
    const hasErrors = searchParams.get('hasErrors')

    const filter: any = {}
    if (sessionId) filter.sessionId = sessionId
    if (since) filter.since = parseInt(since, 10)
    if (minConfidence) filter.minConfidence = parseFloat(minConfidence)
    if (hasErrors) filter.hasErrors = hasErrors === 'true'

    const traces = reasoningTraceSystem.getTraces(filter)

    return NextResponse.json({
      success: true,
      traces,
      count: traces.length,
    })
  } catch (error) {
    console.error('Error listing reasoning traces:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list traces',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/reasoning/traces
 * Clear old traces
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const maxAge = searchParams.get('maxAge')
    
    if (maxAge) {
      reasoningTraceSystem.clearOldTraces(parseInt(maxAge, 10))
    } else {
      reasoningTraceSystem.clearAll()
    }

    return NextResponse.json({
      success: true,
      message: 'Traces cleared successfully',
    })
  } catch (error) {
    console.error('Error clearing reasoning traces:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear traces',
      },
      { status: 500 }
    )
  }
}