import { NextRequest, NextResponse } from 'next/server'
import { readSession } from '@/lib/auth/session'

/**
 * DELETE /api/workflow/scheduled/[id] - Delete a scheduled workflow
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify operator authentication
    const operator = await readSession()
    if (!operator) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()

    // Check if scheduled workflow exists and belongs to operator
    const scheduledWorkflow = await prisma.scheduledWorkflow.findUnique({
      where: { id },
    })

    if (!scheduledWorkflow) {
      return NextResponse.json({ error: 'Scheduled workflow not found' }, { status: 404 })
    }

    if (scheduledWorkflow.userId !== operator.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.scheduledWorkflow.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: 'Scheduled workflow deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting scheduled workflow:', error)
    return NextResponse.json(
      { error: 'Failed to delete scheduled workflow' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/workflow/scheduled/[id] - Update a scheduled workflow
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify operator authentication
    const operator = await readSession()
    if (!operator) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { name, description, scheduledFor, interval, status } = body

    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()

    // Check if scheduled workflow exists and belongs to operator
    const scheduledWorkflow = await prisma.scheduledWorkflow.findUnique({
      where: { id },
    })

    if (!scheduledWorkflow) {
      return NextResponse.json({ error: 'Scheduled workflow not found' }, { status: 404 })
    }

    if (scheduledWorkflow.userId !== operator.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}
    if (name) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (scheduledFor) {
      updateData.scheduledFor = new Date(scheduledFor)
      updateData.nextRunAt = new Date(scheduledFor)
    }
    if (interval !== undefined) updateData.interval = interval
    if (status) updateData.status = status

    const updated = await prisma.scheduledWorkflow.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      message: 'Scheduled workflow updated successfully',
      scheduledWorkflow: updated,
    })
  } catch (error) {
    console.error('Error updating scheduled workflow:', error)
    return NextResponse.json(
      { error: 'Failed to update scheduled workflow' },
      { status: 500 }
    )
  }
}