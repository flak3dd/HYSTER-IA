import { NextRequest, NextResponse } from 'next/server'
import { readSession } from '@/lib/auth/session'
import { randomUUID } from 'crypto'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/workflow/sessions/import' })

/**
 * POST /api/workflow/sessions/import - Import a workflow session from JSON
 */
export async function POST(request: NextRequest) {
  try {
    // Verify operator authentication
    const operator = await readSession()
    if (!operator) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { workflowData } = body

    if (!workflowData) {
      return NextResponse.json({ error: 'workflowData is required' }, { status: 400 })
    }

    // Validate the workflow data structure
    if (!workflowData.session || !workflowData.session.steps) {
      return NextResponse.json({ error: 'Invalid workflow data structure' }, { status: 400 })
    }

    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()

    // Create new session with imported data (new ID for the imported session)
    const newSession = await prisma.workflowSession.create({
      data: {
        id: randomUUID(),
        userId: operator.id,
        status: workflowData.session.status || 'initialized',
        currentStepOrder: workflowData.session.currentStepOrder || 0,
        workflowType: workflowData.session.workflowType,
        context: workflowData.session.context || {},
        createdAt: new Date(workflowData.session.createdAt || new Date()),
        updatedAt: new Date(),
        completedAt: workflowData.session.completedAt ? new Date(workflowData.session.completedAt) : null,
      },
    })

    // Create steps for the imported session
    for (const step of workflowData.session.steps) {
      await prisma.workflowStep.create({
        data: {
          id: randomUUID(), // Generate new IDs for steps
          sessionId: newSession.id,
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
          timestamp: new Date(step.timestamp),
        },
      })
    }

    // Fetch the complete session with steps
    const completeSession = await prisma.workflowSession.findUnique({
      where: { id: newSession.id },
      include: { steps: true },
    })

    return NextResponse.json({
      success: true,
      message: 'Workflow imported successfully',
      session: completeSession,
    })
  } catch (error) {
    log.error({ err: error }, 'Error importing workflow session')
    return NextResponse.json(
      { error: 'Failed to import workflow session' },
      { status: 500 }
    )
  }
}