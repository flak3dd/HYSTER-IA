import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  listSmtpConfigs,
  createSmtpConfig,
  SmtpConfigInput,
} from "@/lib/mailer/smtp-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/admin/mail/smtp-configs
 * List all saved SMTP configurations (passwords excluded)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const configs = await listSmtpConfigs()
    return NextResponse.json({ configs })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * POST /api/admin/mail/smtp-configs
 * Create a new SMTP configuration
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json()
    const validated = SmtpConfigInput.parse(body)
    const config = await createSmtpConfig(validated)
    return NextResponse.json({ success: true, config })
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: (err as any).issues },
        { status: 400 }
      )
    }
    return toErrorResponse(err)
  }
}
