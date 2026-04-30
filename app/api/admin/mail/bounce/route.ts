import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  getBounceEvents,
  getBounceStats,
  isEmailSuppressed,
  suppressEmail,
  unsuppressEmail,
  getSuppressedEmails,
  clearBounceEvents,
  clearSuppressedEmails,
  parseBounceEmail,
  createBounceEvent,
  recordBounce,
  shouldRetrySend,
} from "@/lib/mailer/bounce"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { searchParams } = new URL(req.url)
    const action = searchParams.get("action")
    const messageId = searchParams.get("messageId")
    const email = searchParams.get("email")
    
    if (action === "stats") {
      return NextResponse.json(getBounceStats())
    }
    
    if (action === "suppressed") {
      return NextResponse.json({ emails: getSuppressedEmails() })
    }
    
    if (action === "check-suppressed" && email) {
      const suppressed = isEmailSuppressed(email)
      return NextResponse.json({ suppressed, email })
    }
    
    if (messageId) {
      return NextResponse.json({ events: getBounceEvents(messageId) })
    }
    
    return NextResponse.json({ events: getBounceEvents() })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json()
    const action = body.action
    
    if (action === "suppress") {
      const { email } = body
      suppressEmail(email)
      return NextResponse.json({ success: true })
    }
    
    if (action === "unsuppress") {
      const { email } = body
      const removed = unsuppressEmail(email)
      return NextResponse.json({ success: true, removed })
    }
    
    if (action === "parse") {
      const { rawEmail } = body
      const parsed = await parseBounceEmail(rawEmail)
      return NextResponse.json(parsed)
    }
    
    if (action === "record") {
      const { messageId, recipient, bounceType, bounceReason, bounceMessage, originalSubject } = body
      const event = createBounceEvent(
        messageId,
        recipient,
        bounceType,
        bounceReason,
        bounceMessage,
        originalSubject,
      )
      recordBounce(event)
      return NextResponse.json(event)
    }
    
    if (action === "should-retry") {
      const { bounceType } = body
      const shouldRetry = shouldRetrySend(bounceType)
      return NextResponse.json({ shouldRetry })
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
    const action = searchParams.get("action")
    
    if (action === "clear-events") {
      clearBounceEvents()
      return NextResponse.json({ success: true })
    }
    
    if (action === "clear-suppressed") {
      clearSuppressedEmails()
      return NextResponse.json({ success: true })
    }
    
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err) {
    return toErrorResponse(err)
  }
}