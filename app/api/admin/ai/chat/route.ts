import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { AiChatRequest } from "@/lib/ai/types"
import { runChat } from "@/lib/ai/chat"
import { enforceRateLimit } from "@/lib/infrastructure/rate-limiter"
import logger from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ProgressEvent = {
  type: "step" | "tool_start" | "tool_complete" | "tool_error"
  step?: string
  toolName?: string
  toolArgs?: string
  toolResult?: string
}

const log = logger.child({ module: "api-admin-ai-chat" })

function statusFromErrorCode(code?: string): number {
  switch (code) {
    case "not_found":
      return 404
    case "timeout":
      return 408
    case "max_rounds_exceeded":
      return 422
    case "llm_failed":
      return 502
    default:
      return 500
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const requestId = req.headers.get("x-request-id") ?? `chat-${Date.now()}`
    const admin = await verifyAdmin(req)
    const rateLimited = await enforceRateLimit(req, 'aiChat', admin.id)
    if (rateLimited) return rateLimited
    const adminIdSafe = admin.id.slice(0, 8)
    const body = await req.json()
    const input = AiChatRequest.parse(body)
    
    // Collect progress events
    const progressEvents: ProgressEvent[] = []
    
    const result = await runChat(
      input.conversationId,
      input.message,
      admin.id,
      (progress) => {
        progressEvents.push(progress)
      },
      {
        clientMessageId: input.clientMessageId,
        requestId,
      },
    )

    const payload = {
      requestId,
      messages: result.messages,
      error: result.error,
      errorCode: result.errorCode,
      fromIdempotency: result.fromIdempotency ?? false,
      progress: progressEvents,
    }

    if (result.error) {
      const status = statusFromErrorCode(result.errorCode)
      log.warn(
        {
          requestId,
          adminIdSafe,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId ?? null,
          errorCode: result.errorCode,
          error: result.error,
        },
        "chat request failed",
      )
      return NextResponse.json(payload, { status })
    }

    return NextResponse.json(payload)
  } catch (err) {
    return toErrorResponse(err)
  }
}
