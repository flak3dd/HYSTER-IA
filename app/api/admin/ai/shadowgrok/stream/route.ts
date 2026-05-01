import { NextRequest } from "next/server"
import { verifyAdmin } from "@/lib/auth/admin"
import { runShadowGrokAgent } from "@/lib/grok/agent-runner-enhanced"
import { prisma } from "@/lib/db"
import type { Persona } from "@/lib/ai/system-prompt"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ShadowGrokStreamRequest {
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

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const admin = await verifyAdmin(req)
        const body = await req.json() as ShadowGrokStreamRequest

        if (!body.prompt || typeof body.prompt !== 'string') {
          controller.enqueue(encoder.encode(JSON.stringify({ error: 'prompt is required and must be a string' }) + '\n'))
          controller.close()
          return
        }

        const sendEvent = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        sendEvent({ type: 'start', message: 'Starting ShadowGrok agent execution...' })

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

        sendEvent({
          type: 'complete',
          executionId: result.executionId,
          agentTaskId: result.agentTaskId,
          finalResponse: result.finalResponse,
          toolResults: result.toolResults,
          steps: result.steps,
        })

        controller.close()

      } catch (error: any) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: error.message }) + '\n'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}