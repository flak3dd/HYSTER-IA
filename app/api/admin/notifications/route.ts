import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/admin'
import {
  getNotifications,
  markAllAsRead,
  getUnreadCount,
} from '@/lib/notifications/notification-system'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/admin/notifications' })

export async function GET(request: NextRequest) {
  let auth
  try {
    auth = await verifyAdmin(request)
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const result = await getNotifications(auth.id, {
      unreadOnly,
      limit,
      offset,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    log.error({ err: error }, 'Failed to get notifications')
    return NextResponse.json(
      { error: 'Failed to get notifications', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  let auth
  try {
    auth = await verifyAdmin(request)
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action } = body

    if (action === 'markAllAsRead') {
      const count = await markAllAsRead(auth.id)
      return NextResponse.json({ success: true, marked: count })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    log.error({ err: error }, 'Failed to update notifications')
    return NextResponse.json(
      { error: 'Failed to update notifications', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}