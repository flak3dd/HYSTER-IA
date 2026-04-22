import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { getMailAccount } from "@/lib/mail/accounts"
import { downloadAttachments } from "@/lib/mail/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string; uid: string; name: string }> }

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id, uid, name } = await ctx.params
    const account = await getMailAccount(id)
    if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 })

    const uidNum = Number.parseInt(uid, 10)
    if (!Number.isFinite(uidNum)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 })
    }

    const decoded = decodeURIComponent(name)
    const attachments = await downloadAttachments(account, uidNum)
    const match = attachments.find((a) => a.filename === decoded)
    if (!match) return NextResponse.json({ error: "not_found" }, { status: 404 })

    return new NextResponse(new Uint8Array(match.content), {
      status: 200,
      headers: {
        "content-type": match.contentType || "application/octet-stream",
        "content-length": String(match.size),
        "content-disposition": `attachment; filename="${encodeURIComponent(match.filename)}"`,
        "x-checksum-sha256": match.checksum,
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
