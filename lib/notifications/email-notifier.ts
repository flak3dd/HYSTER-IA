import { Logger } from "@/lib/logger"
import { serverEnv } from "@/lib/env"

const logger = new Logger('email-notifier')

export interface EmailNotification {
  to: string
  subject: string
  html: string
  text?: string
}

/**
 * Send email notification using Resend
 */
export async function sendEmailNotification(email: EmailNotification): Promise<boolean> {
  try {
    const resendApiKey = serverEnv.RESEND_API_KEY
    if (!resendApiKey) {
      logger.warn('Resend API key not configured, skipping email notification')
      return false
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: serverEnv.MAIL_FROM || 'noreply@hysteria2.local',
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      logger.error(`Failed to send email: ${error}`)
      return false
    }

    logger.info(`Email sent successfully to ${email.to}`)
    return true
  } catch (error) {
    logger.error(`Error sending email notification: ${error}`)
    return false
  }
}

/**
 * Send notification email with template
 */
export async function sendNotificationEmail(
  to: string,
  type: 'info' | 'warning' | 'error' | 'success',
  title: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  const colors = {
    info: '#3b82f6',
    warning: '#f59e0b',
    error: '#ef4444',
    success: '#10b981',
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${colors[type]}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
        .footer { margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">${title}</h2>
        </div>
        <div class="content">
          <p>${message}</p>
          ${metadata ? `<pre style="background: #fff; padding: 10px; border-radius: 3px; overflow-x: auto;">${JSON.stringify(metadata, null, 2)}</pre>` : ''}
        </div>
        <div class="footer">
          <p>This is an automated notification from Hysteria 2 Admin Panel.</p>
        </div>
      </div>
    </body>
    </html>
  `

  const text = `${title}\n\n${message}\n\n${metadata ? JSON.stringify(metadata, null, 2) : ''}\n\nThis is an automated notification from Hysteria 2 Admin Panel.`

  return await sendEmailNotification({
    to,
    subject: `[Hysteria2] ${title}`,
    html,
    text,
  })
}

/**
 * Send subscription rotation notification
 */
export async function sendSubscriptionRotationNotification(
  to: string,
  subscriptionId: string,
  subscriptionName: string
): Promise<boolean> {
  return await sendNotificationEmail(
    to,
    'info',
    'Subscription Token Rotated',
    `The token for subscription "${subscriptionName}" has been successfully rotated.`,
    {
      subscriptionId,
      subscriptionName,
      timestamp: new Date().toISOString(),
    }
  )
}

/**
 * Send node status change notification
 */
export async function sendNodeStatusNotification(
  to: string,
  nodeName: string,
  oldStatus: string,
  newStatus: string
): Promise<boolean> {
  const type = newStatus === 'errored' ? 'error' : newStatus === 'running' ? 'success' : 'info'

  return await sendNotificationEmail(
    to,
    type,
    `Node Status Changed: ${nodeName}`,
    `Node "${nodeName}" status changed from "${oldStatus}" to "${newStatus}".`,
    {
      nodeName,
      oldStatus,
      newStatus,
      timestamp: new Date().toISOString(),
    }
  )
}

/**
 * Send security alert notification
 */
export async function sendSecurityAlert(
  to: string,
  alertType: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  return await sendNotificationEmail(
    to,
    'warning',
    `Security Alert: ${alertType}`,
    message,
    {
      alertType,
      timestamp: new Date().toISOString(),
      ...metadata,
    }
  )
}