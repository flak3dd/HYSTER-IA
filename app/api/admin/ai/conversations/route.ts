import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  listConversations,
  createConversation,
} from "@/lib/ai/conversations"
import { AiConversationCreate } from "@/lib/ai/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const admin = await verifyAdmin(req)
    const conversations = await listConversations(admin.id)
    return NextResponse.json({ conversations })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const admin = await verifyAdmin(req)
    const body = await req.json()
    const input = AiConversationCreate.parse(body)
    const conversation = await createConversation(input, admin.id)
    return NextResponse.json({ conversation }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
