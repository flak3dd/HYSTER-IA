import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { sendResendEmail, logEmailToDatabase } from "@/lib/mailer/resend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    
    const body = await req.json()
    const { to, subject, html, text, from, attachments, type, tunnelType, nodeId, notificationType } = body
    
    if (!to || !subject) {
      return NextResponse.json({ error: "Missing required fields: to, subject" }, { status: 400 })
    }
    
    // Send email via Resend
    const emailResult = await sendResendEmail({
      to,
      subject,
      html,
      text,
      from,
      attachments,
      tags: type ? [{ name: 'email_type', value: type }] : undefined
    })
    
    if (!emailResult.success) {
      return NextResponse.json({ error: emailResult.error }, { status: 500 })
    }
    
    // Log to database
    const logResult = await logEmailToDatabase(
      Array.isArray(to) ? to[0] : to,
      subject,
      type || 'notification',
      (emailResult.data as { id?: string })?.id,
      tunnelType,
      nodeId,
      notificationType
    )
    
    return NextResponse.json({
      success: true,
      messageId: (emailResult.data as { id?: string })?.id,
      logged: logResult.success
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}