import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { testSmtpConfigById } from "@/lib/mailer/smtp-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/admin/mail/smtp-configs/:id/test
 * Test connection to a saved SMTP configuration
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { id } = await params
    const result = await testSmtpConfigById(id)
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
