import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  configureQueue,
  getQueueConfig,
  addToQueue,
  getQueueStats,
  getQueuedEmails,
  getQueuedEmail,
  updateEmailStatus,
  getNextPendingEmail,
  shouldRetry,
  clearQueue,
  removeEmail,
  retryFailedEmails,
} from "@/lib/mailer/queue"
import { sendEnhancedEmail } from "@/lib/mail/sender"
import { SmtpConfig } from "@/lib/mail/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { searchParams } = new URL(req.url)
    const action = searchParams.get("action")
    const id = searchParams.get("id")
    
    if (action === "config") {
      return NextResponse.json(getQueueConfig())
    }
    
    if (action === "stats") {
      return NextResponse.json(getQueueStats())
    }
    
    if (id) {
      const email = getQueuedEmail(id)
      if (!email) {
        return NextResponse.json({ error: "Email not found" }, { status: 404 })
      }
      return NextResponse.json(email)
    }
    
    return NextResponse.json({ emails: getQueuedEmails() })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json()
    const action = body.action
    
    if (action === "configure") {
      const config = configureQueue(body.config || {})
      return NextResponse.json(config)
    }
    
    if (action === "add") {
      const { email } = body
      const queued = addToQueue(email)
      return NextResponse.json(queued)
    }
    
    if (action === "process-next") {
      const { smtpConfig, trackingDomain } = body
      
      const email = getNextPendingEmail()
      if (!email) {
        return NextResponse.json({ message: "No emails to process" })
      }
      
      try {
        const smtp = SmtpConfig.parse(smtpConfig)
        const result = await sendEnhancedEmail(
          smtp,
          {
            to: email.to,
            subject: email.subject,
            htmlContent: email.htmlContent,
            textContent: email.textContent,
            from: email.from,
            tracking: email.metadata?.tracking as { enabled: boolean; messageId: string } | undefined,
            metadata: email.metadata,
          },
          trackingDomain,
        )
        
        updateEmailStatus(email.id, "sent")
        return NextResponse.json({ success: true, email, result })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        
        if (shouldRetry(email)) {
          updateEmailStatus(email.id, "pending", error)
        } else {
          updateEmailStatus(email.id, "failed", error)
        }
        
        return NextResponse.json({ success: false, email, error }, { status: 500 })
      }
    }
    
    if (action === "retry-failed") {
      const retried = retryFailedEmails()
      return NextResponse.json({ retried })
    }
    
    if (action === "update-status") {
      const { id, status, error } = body
      const email = updateEmailStatus(id, status, error)
      if (!email) {
        return NextResponse.json({ error: "Email not found" }, { status: 404 })
      }
      return NextResponse.json(email)
    }
    
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    
    if (id) {
      const removed = removeEmail(id)
      if (!removed) {
        return NextResponse.json({ error: "Email not found" }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    }
    
    clearQueue()
    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}