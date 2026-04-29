import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { runShadowGrokWithTools } from "@/lib/grok/agent-runner"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ShadowGrokExecuteRequest {
  message: string
  conversationId?: string
  nodeContext?: Record<string, unknown>
  requireApproval?: boolean
  maxToolRounds?: number
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Check if ShadowGrok is enabled
    if (process.env.SHADOWGROK_ENABLED !== 'true') {
      return NextResponse.json(
        { error: 'ShadowGrok is not enabled. Set SHADOWGROK_ENABLED=true in environment variables.' },
        { status: 403 }
      )
    }

    // Verify admin authentication
    const admin = await verifyAdmin(req)
    const body = await req.json() as ShadowGrokExecuteRequest

    // Validate request
    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 }
      )
    }

    // Execute ShadowGrok
    const startTime = Date.now()
    const result = await runShadowGrokWithTools(
      body.message,
      admin.id,
      {
        conversationId: body.conversationId,
        nodeContext: body.nodeContext,
        requireApproval: body.requireApproval !== undefined ? body.requireApproval : true,
        maxToolRounds: body.maxToolRounds,
      }
    )
    const executionTimeMs = Date.now() - startTime

    // Log execution to database
    const execution = await prisma.shadowGrokExecution.create({
      data: {
        conversationId: body.conversationId,
        userId: admin.id,
        userMessage: body.message,
        finalResponse: result.finalResponse,
        model: process.env.XAI_MODEL || 'grok-4.20-reasoning',
        toolExecutions: result.toolExecutions.length,
        successfulExecutions: result.toolExecutions.filter(te => te.success).length,
        failedExecutions: result.toolExecutions.filter(te => !te.success).length,
        approvalRequired: result.toolExecutions.some(te => te.requiresApproval),
        status: result.error ? 'failed' : (result.toolExecutions.some(te => te.requiresApproval) ? 'pending_approval' : 'completed'),
        error: result.error,
        executionTimeMs,
      },
    })

    // Log individual tool calls
    for (const toolExecution of result.toolExecutions) {
      await prisma.shadowGrokToolCall.create({
        data: {
          executionId: execution.id,
          toolName: toolExecution.toolName,
          arguments: toolExecution.arguments as any,
          result: toolExecution.result as any,
          success: toolExecution.success,
          requiresApproval: toolExecution.requiresApproval,
        },
      })
    }

    // Create approval records for tools requiring approval
    for (const toolExecution of result.toolExecutions) {
      if (toolExecution.requiresApproval) {
        await prisma.shadowGrokApproval.create({
          data: {
            toolCallId: `${execution.id}-${toolExecution.toolName}`,
            toolName: toolExecution.toolName,
            arguments: toolExecution.arguments as any,
            requestedBy: admin.id,
            status: 'pending',
            expiresAt: new Date(Date.now() + 3600000), // 1 hour expiry
          },
        })
      }
    }

    return NextResponse.json({
      executionId: execution.id,
      finalResponse: result.finalResponse,
      toolExecutions: result.toolExecutions,
      status: execution.status,
      approvalRequired: execution.approvalRequired,
      executionTimeMs,
    })

  } catch (err) {
    return toErrorResponse(err)
  }
}

// GET endpoint to retrieve execution status
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const admin = await verifyAdmin(req)
    const { searchParams } = new URL(req.url)
    const executionId = searchParams.get('executionId')

    if (!executionId) {
      // Return recent executions for this user
      const executions = await prisma.shadowGrokExecution.findMany({
        where: { userId: admin.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          toolCalls: {
            orderBy: { executedAt: 'asc' },
          },
        },
      })

      return NextResponse.json({ executions })
    }

    // Return specific execution
    const execution = await prisma.shadowGrokExecution.findUnique({
      where: { id: executionId },
      include: {
        toolCalls: {
          orderBy: { executedAt: 'asc' },
        },
      },
    })

    if (!execution) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      )
    }

    if (execution.userId !== admin.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    return NextResponse.json({ execution })

  } catch (err) {
    return toErrorResponse(err)
  }
}