import { NextRequest, NextResponse } from 'next/server'
import { WorkflowEngine } from '@/lib/workflow/engine'
import { readSession } from '@/lib/auth/session'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/workflow/sessions/[sessionId]' })

/**
 * GET /api/workflow/sessions/[sessionId] - Get a specific workflow session
 */
export async function GET(
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

    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()

    const session = await prisma.workflowSession.findUnique({
      where: { id: sessionId },
      include: { steps: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Check if the session belongs to the operator
    if (session.userId !== operator.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ session })
  } catch (error) {
    log.error({ err: error }, 'Error getting workflow session')
    return NextResponse.json(
      { error: 'Failed to get workflow session' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/workflow/sessions/[sessionId]/process - Process a workflow session
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

    const engine = new WorkflowEngine()
    const result = await engine.processSession(sessionId)

    return NextResponse.json(result)
  } catch (error) {
    log.error({ err: error }, 'Error processing workflow session')
    return NextResponse.json(
      { error: 'Failed to process workflow session' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/workflow/sessions/[sessionId] - Cancel/delete a workflow session
 */
export async function DELETE(
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

    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()

    // Check if session exists and belongs to operator
    const session = await prisma.workflowSession.findUnique({
      where: { id: sessionId },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.userId !== operator.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Update session status to cancelled
    await prisma.workflowSession.update({
      where: { id: sessionId },
      data: { status: 'cancelled', completedAt: new Date() },
    })

    return NextResponse.json({ success: true, message: 'Session cancelled' })
  } catch (error) {
    log.error({ err: error }, 'Error cancelling workflow session')
    return NextResponse.json(
      { error: 'Failed to cancel workflow session' },
      { status: 500 }
    )
  }
}