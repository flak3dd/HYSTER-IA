import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { SendTestPayload } from "@/lib/mail/types"
import { sendTestEmail, testSmtpConnection } from "@/lib/mail/sender"
import { resolveSmtpConfig } from "@/lib/mailer/smtp-config"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SendTestWithConfigId = z.object({
  configId: z.string().min(1),
  to: z.string().email().optional(),
  subject: z.string().min(1).default("D-Panel Mail Test"),
  body: z.string().min(1).default("This is an automated test message from D-Panel."),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const raw: unknown = await req.json()

    // If configId is provided, load saved SMTP config
    if (raw && typeof raw === "object" && "configId" in raw) {
      const { configId, to, subject, body } = SendTestWithConfigId.parse(raw)
      const smtp = await resolveSmtpConfig(configId)
      if (!smtp) {
        return NextResponse.json(
          { error: "SMTP config not found" },
          { status: 404 }
        )
      }

      if (!to) {
        const result = await testSmtpConnection(smtp)
        return NextResponse.json(result)
      }

      const result = await sendTestEmail({ smtp, to, subject, body })
      return NextResponse.json(result)
    }

    // Otherwise use inline SMTP config
    const payload = SendTestPayload.parse(raw)

    if (!payload.to) {
      const result = await testSmtpConnection(payload.smtp)
      return NextResponse.json(result)
    }

    const result = await sendTestEmail(payload)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.issues },
        { status: 400 }
      )
    }
    return toErrorResponse(err)
  }
}
