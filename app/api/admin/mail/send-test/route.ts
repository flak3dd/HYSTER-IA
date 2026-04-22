import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { SendTestPayload } from "@/lib/mail/types"
import { sendTestEmail, testSmtpConnection } from "@/lib/mail/sender"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const raw: unknown = await req.json()
    const payload = SendTestPayload.parse(raw)

    // If no "to" address means just test the connection
    if (!payload.to) {
      const result = await testSmtpConnection(payload.smtp)
      return NextResponse.json(result)
    }

    const result = await sendTestEmail(payload)
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
