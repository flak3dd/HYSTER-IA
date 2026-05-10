import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/admin'
import {
  markNotificationAsRead,
  deleteNotification,
} from '@/lib/notifications/notification-system'
import logger from '@/lib/logger'

const log = logger.child({ module: 'api/admin/notifications/[notificationId]' })

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  try {
    await verifyAdmin(request)
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { notificationId } = await params
    const success = await markNotificationAsRead(notificationId)
    if (success) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ error: 'Failed to mark notification as read' }, { status: 500 })
    }
  } catch (error) {
    log.error({ err: error }, 'Failed to update notification')
    return NextResponse.json(
      { error: 'Failed to update notification', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  try {
    await verifyAdmin(request)
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { notificationId } = await params
    const success = await deleteNotification(notificationId)
    if (success) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 })
    }
  } catch (error) {
    log.error({ err: error }, 'Failed to delete notification')
    return NextResponse.json(
      { error: 'Failed to delete notification', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}