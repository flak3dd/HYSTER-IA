import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { AiChatRequest } from "@/lib/ai/types"
import { runChat } from "@/lib/ai/chat"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const admin = await verifyAdmin(req)
    const body = await req.json()
    const input = AiChatRequest.parse(body)
    const result = await runChat(
      input.conversationId,
      input.message,
      admin.uid,
    )
    if (result.error) {
      return NextResponse.json(
        { messages: result.messages, error: result.error },
        { status: 500 },
      )
    }
    return NextResponse.json({ messages: result.messages })
  } catch (err) {
    return toErrorResponse(err)
  }
}
