import { prisma } from "@/lib/db"
import { Logger } from "@/lib/logger"

const logger = new Logger('notifications')

export type NotificationType = 'info' | 'warning' | 'error' | 'success'

export interface NotificationCreate {
  operatorId: string
  type: NotificationType
  title: string
  message: string
  metadata?: Record<string, unknown>
}

export interface Notification {
  id: string
  operatorId: string
  type: NotificationType
  title: string
  message: string
  metadata: Record<string, unknown>
  read: boolean
  createdAt: Date
}

/**
 * Create a new notification
 */
export async function createNotification(input: NotificationCreate): Promise<Notification> {
  try {
    const notification = await prisma.notification.create({
      data: {
        operatorId: input.operatorId,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata || {},
      },
    })

    logger.info(`Created notification for operator ${input.operatorId}: ${input.title}`)

    return {
      id: notification.id,
      operatorId: notification.operatorId,
      type: notification.type as NotificationType,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata as Record<string, unknown>,
      read: notification.read,
      createdAt: notification.createdAt,
    }
  } catch (error) {
    logger.error(`Failed to create notification: ${error}`)
    throw error
  }
}

/**
 * Get notifications for an operator
 */
export async function getNotifications(
  operatorId: string,
  opts?: {
    unreadOnly?: boolean
    limit?: number
    offset?: number
  }
): Promise<{ notifications: Notification[]; total: number }> {
  const where: any = { operatorId }
  if (opts?.unreadOnly) {
    where.read = false
  }

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts?.limit || 50,
      skip: opts?.offset || 0,
    }),
    prisma.notification.count({ where }),
  ])

  return {
    notifications: notifications.map(n => ({
      id: n.id,
      operatorId: n.operatorId,
      type: n.type as NotificationType,
      title: n.title,
      message: n.message,
      metadata: n.metadata as Record<string, unknown>,
      read: n.read,
      createdAt: n.createdAt,
    })),
    total,
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<boolean> {
  try {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    })
    return true
  } catch (error) {
    logger.error(`Failed to mark notification as read: ${error}`)
    return false
  }
}

/**
 * Mark all notifications as read for an operator
 */
export async function markAllAsRead(operatorId: string): Promise<number> {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        operatorId,
        read: false,
      },
      data: { read: true },
    })
    return result.count
  } catch (error) {
    logger.error(`Failed to mark all notifications as read: ${error}`)
    return 0
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string): Promise<boolean> {
  try {
    await prisma.notification.delete({
      where: { id: notificationId },
    })
    return true
  } catch (error) {
    logger.error(`Failed to delete notification: ${error}`)
    return false
  }
}

/**
 * Get unread notification count for an operator
 */
export async function getUnreadCount(operatorId: string): Promise<number> {
  try {
    return await prisma.notification.count({
      where: {
        operatorId,
        read: false,
      },
    })
  } catch (error) {
    logger.error(`Failed to get unread count: ${error}`)
    return 0
  }
}

/**
 * Create a system notification for all operators
 */
export async function createSystemNotification(
  type: NotificationType,
  title: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const operators = await prisma.operator.findMany({
      where: { isActive: true },
    })

    for (const operator of operators) {
      await createNotification({
        operatorId: operator.id,
        type,
        title,
        message,
        metadata,
      })
    }

    logger.info(`Created system notification for ${operators.length} operators: ${title}`)
  } catch (error) {
    logger.error(`Failed to create system notification: ${error}`)
    throw error
  }
}

/**
 * Clean up old notifications (older than specified days)
 */
export async function cleanupOldNotifications(daysOld: number = 30): Promise<number> {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    const result = await prisma.notification.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
        read: true, // Only delete read notifications
      },
    })

    logger.info(`Cleaned up ${result.count} old notifications`)
    return result.count
  } catch (error) {
    logger.error(`Failed to cleanup old notifications: ${error}`)
    return 0
  }
}