/**
 * API Route: Reasoning Trace Details
 * 
 * Provides endpoints for:
 * - Getting a specific trace by ID
 * - Exporting trace as JSON
 * - Exporting trace as decision tree (DOT format)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { reasoningTraceSystem } from '@/lib/ai/reasoning/reasoning-trace'

/**
 * GET /api/admin/reasoning/traces/[traceId]
 * Get a specific reasoning trace by ID
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ traceId: string }> }
) {
  try {
    await verifyAdmin(request)
    const { traceId } = await context.params
    const searchParams = request.nextUrl.searchParams
    const format = searchParams.get('format') // 'json' or 'dot'

    const trace = reasoningTraceSystem.getTrace(traceId)

    if (!trace) {
      return NextResponse.json(
        {
          success: false,
          error: 'Trace not found',
        },
        { status: 404 }
      )
    }

    if (format === 'dot') {
      const dot = reasoningTraceSystem.exportDecisionTree(traceId)
      return NextResponse.json({
        success: true,
        format: 'dot',
        dot,
        traceId,
      })
    }

    return NextResponse.json({
      success: true,
      trace,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}