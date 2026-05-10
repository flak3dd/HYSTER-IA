import { NextRequest, NextResponse } from 'next/server'
import { readSession } from '@/lib/auth/session'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/workflow/analytics' })

/**
 * GET /api/workflow/analytics - Get workflow analytics and insights
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

    // Get all sessions for the operator
    const sessions = await prisma.workflowSession.findMany({
      where: { userId: operator.id },
      include: { steps: true },
      orderBy: { createdAt: 'desc' },
    })

    // Calculate analytics
    const totalSessions = sessions.length
    const completedSessions = sessions.filter(s => s.status === 'completed').length
    const failedSessions = sessions.filter(s => s.status === 'failed').length
    const successRate = totalSessions > 0 ? ((completedSessions / totalSessions) * 100).toFixed(1) : '0'

    // Analyze function usage
    const functionUsage: Record<string, number> = {}
    const categoryUsage: Record<string, number> = {}
    
    sessions.forEach(session => {
      session.steps.forEach(step => {
        if (step.functionToExecute) {
          functionUsage[step.functionToExecute] = (functionUsage[step.functionToExecute] || 0) + 1
        }
        if (step.type) {
          categoryUsage[step.type] = (categoryUsage[step.type] || 0) + 1
        }
      })
    })

    // Sort functions by usage
    const sortedFunctions = Object.entries(functionUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }))

    // Calculate average steps per session
    const stepsPerSession = sessions.length > 0
      ? (sessions.reduce((sum, s) => sum + s.steps.length, 0) / sessions.length).toFixed(1)
      : '0'

    // Calculate average completion time
    const completedSessionsWithTime = sessions.filter(s => s.completedAt && s.createdAt)
    const avgCompletionTime = completedSessionsWithTime.length > 0
      ? (
          completedSessionsWithTime.reduce((sum, s) => {
            const duration = new Date(s.completedAt!).getTime() - new Date(s.createdAt).getTime()
            return sum + duration
          }, 0) / completedSessionsWithTime.length
        ).toFixed(0)
      : '0'

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const recentSessions = sessions.filter(s => new Date(s.createdAt) >= sevenDaysAgo)
    const recentActivity = {
      total: recentSessions.length,
      completed: recentSessions.filter(s => s.status === 'completed').length,
      failed: recentSessions.filter(s => s.status === 'failed').length,
    }

    return NextResponse.json({
      analytics: {
        overview: {
          totalSessions,
          completedSessions,
          failedSessions,
          successRate: parseFloat(successRate),
          stepsPerSession: parseFloat(stepsPerSession),
          avgCompletionTime: parseFloat(avgCompletionTime),
        },
        functionUsage: sortedFunctions,
        categoryUsage,
        recentActivity,
        topWorkflows: sessions.slice(0, 5).map(s => ({
          id: s.id,
          status: s.status,
          stepCount: s.steps.length,
          createdAt: s.createdAt.toISOString(),
          workflowType: s.workflowType,
        })),
      },
    })
  } catch (error) {
    log.error({ err: error }, 'Error getting workflow analytics')
    return NextResponse.json(
      { error: 'Failed to get workflow analytics' },
      { status: 500 }
    )
  }
}