import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { getMailAccount } from "@/lib/mail/accounts"
import { downloadAttachments } from "@/lib/mail/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string; uid: string }> }

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id, uid } = await ctx.params
    const account = await getMailAccount(id)
    if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 })

    const uidNum = Number.parseInt(uid, 10)
    if (!Number.isFinite(uidNum)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 })
    }

    const attachments = await downloadAttachments(account, uidNum)
    return NextResponse.json({
      attachments: attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        checksum: a.checksum,
      })),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
