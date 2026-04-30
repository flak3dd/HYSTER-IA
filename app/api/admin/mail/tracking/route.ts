import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  getTrackingEvents,
  getMessageStats,
  getAllTrackingEvents,
  clearTrackingEvents,
} from "@/lib/mailer/tracking"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { searchParams } = new URL(req.url)
    const messageId = searchParams.get("messageId")
    
    if (messageId) {
      const events = getTrackingEvents(messageId)
      const stats = getMessageStats(messageId)
      return NextResponse.json({ events, stats })
    }
    
    return NextResponse.json({ events: getAllTrackingEvents() })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { searchParams } = new URL(req.url)
    const messageId = searchParams.get("messageId")
    
    clearTrackingEvents(messageId || undefined)
    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}