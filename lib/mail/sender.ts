import nodemailer from "nodemailer"
import type { SmtpConfig, SendTestPayload } from "@/lib/mail/types"

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
