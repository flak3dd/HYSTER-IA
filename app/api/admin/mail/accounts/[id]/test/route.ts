import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { getMailAccount } from "@/lib/mail/accounts"
import { testConnection } from "@/lib/mail/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await ctx.params
    const account = await getMailAccount(id)
    if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 })
    const result = await testConnection(account)
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
