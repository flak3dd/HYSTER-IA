import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin, toErrorResponse } from '@/lib/auth/admin'
import { getUnreadCount } from '@/lib/notifications/notification-system'

export async function GET(request: NextRequest) {
  let auth
  try {
    auth = await verifyAdmin(request)
  } catch (error) {
    return toErrorResponse(error)
  }

  try {
    const count = await getUnreadCount(auth.id)
    return NextResponse.json({ success: true, count })
  } catch (error) {
    return toErrorResponse(error)
  }
}