import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/admin'
import { getUnreadCount } from '@/lib/notifications/notification-system'

export async function GET(request: NextRequest) {
  let auth
  try {
    auth = await verifyAdmin(request)
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const count = await getUnreadCount(auth.id)
    return NextResponse.json({ success: true, count })
  } catch (error) {
    console.error('Failed to get unread count:', error)
    return NextResponse.json(
      { error: 'Failed to get unread count', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}