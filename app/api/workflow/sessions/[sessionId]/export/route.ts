import { NextRequest, NextResponse } from 'next/server'
import { readSession } from '@/lib/auth/session'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/workflow/sessions/[sessionId]/export' })

/**
 * GET /api/workflow/sessions/[sessionId]/export - Export a workflow session as JSON
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

    // Create export object
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      session: {
        id: session.id,
        workflowType: session.workflowType,
        status: session.status,
        context: session.context,
        currentStepOrder: session.currentStepOrder,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        completedAt: session.completedAt?.toISOString(),
        steps: session.steps.map(step => ({
          id: step.id,
          type: step.type,
          order: step.order,
          content: step.content,
          aiPrompt: step.aiPrompt,
          userResponse: step.userResponse,
          functionToExecute: step.functionToExecute,
          functionParameters: step.functionParameters,
          executionResult: step.executionResult,
          error: step.error,
          completed: step.completed,
          timestamp: step.timestamp.toISOString(),
        })),
      },
    }

    // Return as JSON file download
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="workflow-${session.id.slice(0, 8)}.json"`,
      },
    })
  } catch (error) {
    log.error({ err: error }, 'Error exporting workflow session')
    return NextResponse.json(
      { error: 'Failed to export workflow session' },
      { status: 500 }
    )
  }
}