import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { runShadowGrokAgent } from "@/lib/grok/agent-runner-enhanced"
import { prisma } from "@/lib/db"
import type { Persona } from "@/lib/ai/system-prompt"
import { reasoningTraceSystem } from "@/lib/ai/reasoning/reasoning-trace"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ShadowGrokRequest {
  prompt: string
  conversationId?: string
  allowedTools?: string[]
  maxSteps?: number
  model?: string
  dryRun?: boolean
  /** Operational persona: "stealth" | "aggressive" | "exfil" | "destruction" */
  persona?: Persona
  /** High-level operation goal injected into the runtime context */
  operationGoal?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const admin = await verifyAdmin(req)
    const body = await req.json() as ShadowGrokRequest

    if (!body.prompt || typeof body.prompt !== 'string') {
      return NextResponse.json(
        { error: 'prompt is required and must be a string' },
        { status: 400 }
      )
    }

    const result = await runShadowGrokAgent({
      prompt: body.prompt,
      userId: admin.id,
      conversationId: body.conversationId,
      allowedTools: body.allowedTools,
      maxSteps: body.maxSteps,
      model: body.model,
      dryRun: body.dryRun,
      persona: body.persona,
      operationGoal: body.operationGoal,
    })

    // Get reasoning trace if available
    let reasoningTrace = null
    if (result.traceSessionId) {
      try {
        reasoningTrace = reasoningTraceSystem.getTrace(result.traceSessionId)
      } catch (error) {
        console.error('Failed to get reasoning trace:', error)
      }
    }

    return NextResponse.json({
      executionId: result.executionId,
      agentTaskId: result.agentTaskId,
      finalResponse: result.finalResponse,
      toolResults: result.toolResults,
      steps: result.steps,
      reasoningTrace,
    })

  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const admin = await verifyAdmin(req)
    const { searchParams } = new URL(req.url)
    const executionId = searchParams.get('executionId')
    const agentTaskId = searchParams.get('agentTaskId')

    if (executionId) {
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
    }

    if (agentTaskId) {
      const agentTask = await prisma.agentTask.findUnique({
        where: { id: agentTaskId },
        include: {
          steps: {
            orderBy: { index: 'asc' },
          },
        },
      })

      if (!agentTask) {
        return NextResponse.json(
          { error: 'Agent task not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({ agentTask })
    }

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

  } catch (err) {
    return toErrorResponse(err)
  }
}