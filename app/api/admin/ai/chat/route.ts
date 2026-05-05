import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { AiChatRequest } from "@/lib/ai/types"
import { runChat } from "@/lib/ai/chat"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ProgressEvent = {
  type: "step" | "tool_start" | "tool_complete" | "tool_error"
  step?: string
  toolName?: string
  toolArgs?: string
  toolResult?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const admin = await verifyAdmin(req)
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
      }
    )
    
    return NextResponse.json({
      messages: result.messages,
      error: result.error,
      progress: progressEvents,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
