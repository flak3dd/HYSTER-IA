import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/verify-admin'
import { getUnreadCount } from '@/lib/notifications/notification-system'

export async function GET(request: NextRequest) {
  const auth = await verifyAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const count = await getUnreadCount(auth.userId)
    return NextResponse.json({ success: true, count })
  } catch (error) {
    console.error('Failed to get unread count:', error)
    return NextResponse.json(
      { error: 'Failed to get unread count', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}