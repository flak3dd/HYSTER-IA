import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  getConversation,
  updateConversationTitle,
  deleteConversation,
} from "@/lib/ai/conversations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const conversation = await getConversation(id)
    if (!conversation) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }
    return NextResponse.json({ conversation })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const body = await req.json()
    const title = typeof body.title === "string" ? body.title.trim() : ""
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 })
    }
    const ok = await updateConversationTitle(id, title)
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const ok = await deleteConversation(id)
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
