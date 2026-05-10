import { NextRequest, NextResponse } from 'next/server'
import { WorkflowEngine } from '@/lib/workflow/engine'
import { CreateWorkflowSessionInput } from '@/lib/workflow/types'
import { readSession } from '@/lib/auth/session'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/workflow/sessions' })

/**
 * POST /api/workflow/sessions - Create a new workflow session
 */
export async function POST(request: NextRequest) {
  try {
    // Verify operator authentication
    const operator = await readSession()
    if (!operator) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const input: CreateWorkflowSessionInput = {
      userId: operator.id,
      initialRequest: body.initialRequest,
      workflowType: body.workflowType,
    }

    const engine = new WorkflowEngine()
    const result = await engine.createSession(input)

    // Process the initial request
    const processResult = await engine.processSession(result.session.id)

    return NextResponse.json(processResult)
  } catch (error) {
    log.error({ err: error }, 'Error creating workflow session')
    return NextResponse.json(
      { error: 'Failed to create workflow session' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/workflow/sessions - List workflow sessions
 */
export async function GET(request: NextRequest) {
  try {
    // Verify operator authentication
    const operator = await readSession()
    if (!operator) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()

    const sessions = await prisma.workflowSession.findMany({
      where: { userId: operator.id },
      include: { steps: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ sessions })
  } catch (error) {
    log.error({ err: error }, 'Error listing workflow sessions')
    return NextResponse.json(
      { error: 'Failed to list workflow sessions' },
      { status: 500 }
    )
  }
}