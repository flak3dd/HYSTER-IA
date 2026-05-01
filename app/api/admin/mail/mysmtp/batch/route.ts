import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { sendMySmtpBatchEmails } from "@/lib/mailer/mysmtp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    
    const body = await req.json()
    const { emails } = body
    
    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: "Missing required field: emails (array)" }, { status: 400 })
    }
    
    // Send batch emails via my.smtp.com
    const results = await sendMySmtpBatchEmails(emails)
    
    return NextResponse.json({
      success: true,
      results,
      total: emails.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}