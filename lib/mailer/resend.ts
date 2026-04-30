import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface ResendEmailOptions {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
}

export async function sendResendEmail(options: ResendEmailOptions) {
  const { to, subject, html, text, from, attachments, headers, tags } = options
  
  const defaultFrom = process.env.MAIL_FROM || 'noreply@example.com'
  
  try {
    const emailData: any = {
      from: from || defaultFrom,
      to: Array.isArray(to) ? to : [to],
      subject,
    };
    
    if (html) emailData.html = html;
    if (text) emailData.text = text;
    if (attachments) emailData.attachments = attachments;
    if (headers) emailData.headers = headers;
    if (tags) emailData.tags = tags;
    
    const data = await resend.emails.send(emailData);
    
    return { success: true, data }
  } catch (error) {
    console.error('Resend email error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

export async function sendResendBatchEmails(emails: ResendEmailOptions[]) {
  const results = await Promise.allSettled(
    emails.map(email => sendResendEmail(email))
  )
  
  return results.map((result, index) => ({
    index,
    success: result.status === 'fulfilled' && result.value.success,
    data: result.status === 'fulfilled' ? result.value.data : null,
    error: result.status === 'fulfilled' ? result.value.error : 
            result.status === 'rejected' ? result.reason : null
  }))
}

export async function logEmailToDatabase(
  to: string,
  subject: string,
  type: string,
  messageId?: string,
  tunnelType?: string,
  nodeId?: string,
  notificationType?: string
) {
  try {
    const { prisma } = await import('@/lib/db')
    
    await prisma.emailLog.create({
      data: {
        to,
        subject,
        type,
        messageId,
        tunnelType,
        nodeId,
        notificationType,
      }
    })
    
    return { success: true }
  } catch (error) {
    console.error('Failed to log email to database:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}