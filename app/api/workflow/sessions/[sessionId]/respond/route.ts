import { NextRequest, NextResponse } from 'next/server'
import { WorkflowEngine } from '@/lib/workflow/engine'
import { readSession } from '@/lib/auth/session'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/workflow/sessions/[sessionId]/respond' })

/**
 * POST /api/workflow/sessions/[sessionId]/respond - Handle user response to a workflow step
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    // Verify operator authentication
    const operator = await readSession()
    if (!operator) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId } = await params

    const body = await request.json()
    const { stepId, response } = body

    if (!stepId || !response) {
      return NextResponse.json(
        { error: 'stepId and response are required' },
        { status: 400 }
      )
    }

    const engine = new WorkflowEngine()
    const result = await engine.handleUserResponse({
      sessionId,
      stepId,
      response,
    })

    return NextResponse.json(result)
  } catch (error) {
    log.error({ err: error }, 'Error handling user response')
    return NextResponse.json(
      { error: 'Failed to handle user response' },
      { status: 500 }
    )
  }
}