import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { generateTunnelScriptEmail } from "@/lib/mailer/enhanced-mailer"
import { sendMySmtpEmail } from "@/lib/mailer/mysmtp"
import { sendResendEmail } from "@/lib/mailer/resend"
import { logEmailToDatabase } from "@/lib/mailer/resend"
import { resolveSmtpConfig } from "@/lib/mailer/smtp-config"
import { z } from "zod"

const TunnelScriptSchema = z.object({
  to: z.string().email(),
  provider: z.enum(['smtp', 'resend', 'mysmtp']).default('mysmtp'),
  tunnelScriptType: z.enum(['hysteria2', 'hysteria2-obfs', 'multi-hop', 'shadowsocks', 'vmess']).default('hysteria2'),
  nodeId: z.string().optional(),
  customSubject: z.string().optional(),
  customMessage: z.string().optional(),
  tunnelConfig: z.string().optional(),
  payloads: z.array(z.any()).optional(),
  trackingEnabled: z.boolean().default(true),
  smtpConfigId: z.string().optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const body = await req.json()
    const validated = TunnelScriptSchema.parse(body)

    // Generate enhanced tunnel script email
    const emailContent = await generateTunnelScriptEmail({
      tunnelScriptType: validated.tunnelScriptType,
      nodeId: validated.nodeId,
      customSubject: validated.customSubject,
      customMessage: validated.customMessage,
      tunnelConfig: validated.tunnelConfig,
      payloads: validated.payloads
    })

    let emailResult: any

    // Send email using selected provider
    switch (validated.provider) {
      case 'mysmtp':
        emailResult = await sendMySmtpEmail({
          to: validated.to,
          subject: emailContent.subject,
          html: emailContent.htmlContent,
          text: emailContent.textContent,
          attachments: emailContent.attachments
        })
        break

      case 'resend':
        emailResult = await sendResendEmail({
          to: validated.to,
          subject: emailContent.subject,
          html: emailContent.htmlContent,
          text: emailContent.textContent,
          attachments: emailContent.attachments
        })
        break

      case 'smtp':
        // Use saved SMTP config (by ID or default/env fallback)
        const { sendEnhancedEmail } = await import('@/lib/mail/sender')
        const smtpConfig = await resolveSmtpConfig(validated.smtpConfigId)
        if (!smtpConfig) {
          return NextResponse.json(
            { error: "No SMTP configuration found. Please save an SMTP config or set SMTP_HOST environment variable." },
            { status: 500 }
          )
        }

        const enhancedResult = await sendEnhancedEmail(
          smtpConfig,
          {
            to: validated.to,
            subject: emailContent.subject,
            htmlContent: emailContent.htmlContent,
            textContent: emailContent.textContent,
            attachments: emailContent.attachments?.map(att => ({
              filename: att.filename,
              content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content),
              contentType: att.contentType || 'application/octet-stream',
              size: Buffer.isBuffer(att.content) ? att.content.length : Buffer.from(att.content).length
            })),
            tracking: validated.trackingEnabled ? {
              enabled: true,
              messageId: `msg-${Date.now()}`
            } : undefined
          },
          process.env.TRACKING_DOMAIN
        )
        emailResult = {
          success: enhancedResult.ok,
          messageId: enhancedResult.messageId,
          trackingId: enhancedResult.trackingId,
        }
        break
    }

    if (!emailResult.success) {
      return NextResponse.json({ error: emailResult.error || 'Failed to send email' }, { status: 500 })
    }

    // Log to database
    await logEmailToDatabase(
      validated.to,
      emailContent.subject,
      'tunnel_script',
      emailResult.messageId,
      validated.tunnelScriptType,
      validated.nodeId,
      'tunnel_configuration'
    )

    return NextResponse.json({
      success: true,
      messageId: emailResult.messageId,
      provider: validated.provider,
      tunnelScriptType: validated.tunnelScriptType,
      trackingId: emailResult.trackingId
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body", details: err.issues }, { status: 400 })
    }
    return toErrorResponse(err)
  }
}