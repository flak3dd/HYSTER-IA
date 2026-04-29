import { NextRequest, NextResponse } from 'next/server'
import { readSession } from '@/lib/auth/session'
import { randomUUID } from 'crypto'

/**
 * GET /api/workflow/scheduled - Get all scheduled workflows
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

    const scheduledWorkflows = await prisma.scheduledWorkflow.findMany({
      where: { userId: operator.id },
      orderBy: { scheduledFor: 'asc' },
    })

    return NextResponse.json({ scheduledWorkflows })
  } catch (error) {
    console.error('Error getting scheduled workflows:', error)
    return NextResponse.json(
      { error: 'Failed to get scheduled workflows' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/workflow/scheduled - Create a new scheduled workflow
 */
export async function POST(request: NextRequest) {
  try {
    // Verify operator authentication
    const operator = await readSession()
    if (!operator) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, initialRequest, scheduledFor, interval, context } = body

    if (!name || !initialRequest || !scheduledFor) {
      return NextResponse.json(
        { error: 'name, initialRequest, and scheduledFor are required' },
        { status: 400 }
      )
    }

    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()

    const scheduledWorkflow = await prisma.scheduledWorkflow.create({
      data: {
        id: randomUUID(),
        userId: operator.id,
        name,
        description,
        initialRequest,
        scheduledFor: new Date(scheduledFor),
        interval,
        context: context || {},
        nextRunAt: new Date(scheduledFor),
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Workflow scheduled successfully',
      scheduledWorkflow,
    })
  } catch (error) {
    console.error('Error creating scheduled workflow:', error)
    return NextResponse.json(
      { error: 'Failed to create scheduled workflow' },
      { status: 500 }
    )
  }
}