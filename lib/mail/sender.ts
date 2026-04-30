import nodemailer from "nodemailer"
import type { SmtpConfig, SendTestPayload, EmailSendOptions } from "@/lib/mail/types"
import { injectTrackingPixel, injectLinkTracking, generateTrackingId, createTrackingEvent, recordTrackingEvent } from "@/lib/mailer/tracking"

export async function testSmtpConnection(
  smtp: SmtpConfig,
): Promise<{ ok: true; greeting: string }> {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
  })
  try {
    const ok = await transport.verify()
    if (!ok) throw new Error("SMTP verify returned false")
    return { ok: true, greeting: `${smtp.host}:${smtp.port} ready` }
  } finally {
    transport.close()
  }
}

export async function sendTestEmail(
  payload: SendTestPayload,
): Promise<{ ok: true; messageId: string }> {
  const { smtp, to, subject, body } = payload
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
  })
  try {
    const info = await transport.sendMail({
      from: smtp.from ?? smtp.user,
      to,
      subject,
      text: body,
      html: `<div style="font-family:sans-serif;padding:20px;">
        <h2 style="color:#333;">D-Panel Mail Test</h2>
        <p>${body}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
        <p style="color:#999;font-size:12px;">
          Sent at ${new Date().toISOString()} by D-Panel Auto-Mailer Test System
        </p>
      </div>`,
    })
    return { ok: true, messageId: info.messageId }
  } finally {
    transport.close()
  }
}

export async function sendEnhancedEmail(
  smtp: SmtpConfig,
  options: EmailSendOptions,
  trackingDomain?: string,
): Promise<{ ok: true; messageId: string; trackingId?: string }> {
  const { to, subject, htmlContent, textContent, from, attachments, tracking, metadata } = options
  
  let processedHtml = htmlContent
  let trackingId: string | undefined
  
  // Inject tracking if enabled
  if (tracking?.enabled && trackingDomain) {
    trackingId = tracking.messageId || generateTrackingId()
    processedHtml = injectTrackingPixel(processedHtml, `${trackingDomain}/track/pixel`, trackingId)
    processedHtml = injectLinkTracking(processedHtml, trackingDomain, trackingId)
    
    // Record initial tracking event
    const event = createTrackingEvent("pixel", trackingId, to, {
      subject,
      ...metadata,
    })
    recordTrackingEvent(event)
  }
  
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
  })
  
  try {
    const mailOptions: nodemailer.SendMailOptions = {
      from: from ?? smtp.from ?? smtp.user,
      to,
      subject,
      text: textContent,
      html: processedHtml,
      attachments: attachments?.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
    }
    
    const info = await transport.sendMail(mailOptions)
    return { ok: true, messageId: info.messageId, trackingId }
  } finally {
    transport.close()
  }
}
