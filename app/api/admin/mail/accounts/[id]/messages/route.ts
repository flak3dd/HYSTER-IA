import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { getMailAccount } from "@/lib/mail/accounts"
import { listMessages } from "@/lib/mail/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await ctx.params
    const account = await getMailAccount(id)
    if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 })

    const limitParam = new URL(req.url).searchParams.get("limit")
    const limit = limitParam ? Math.max(1, Math.min(200, Number.parseInt(limitParam, 10) || 25)) : 25

    const messages = await listMessages(account, limit)
    return NextResponse.json({ messages })
  } catch (err) {
    return toErrorResponse(err)
  }
}
