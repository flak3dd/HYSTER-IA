/**
 * Bulk Email Send Module
 * Parses firstname,lastname,email CSV and sends personalized emails
 */

import logger from "@/lib/logger"
import { sendTestEmail } from "@/lib/mail/sender"
import type { SmtpConfig } from "@/lib/mail/types"
import { sendResendEmail } from "./resend"
import { sendMySmtpEmail } from "./mysmtp"
import { prisma } from "@/lib/db"

const log = logger.child({ module: "bulk-email" })

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface EmailRecipient {
  firstName: string
  lastName: string
  email: string
  rowNumber?: number
}

export interface BulkEmailRequest {
  subject: string
  body: string
  htmlBody?: string
  provider: "smtp" | "resend" | "mysmtp"
  smtpConfig?: SmtpConfig
  smtpConfigId?: string
  rateLimitPerMinute?: number
  batchSize?: number
  delayMs?: number
}

export interface BulkEmailResult {
  total: number
  valid: number
  invalid: number
  duplicates: number
  sent: number
  failed: number
  errors: Array<{ row: number; email: string; error: string }>
  durationMs: number
}

/* ------------------------------------------------------------------ */
/*  CSV Parser                                                        */
/* ------------------------------------------------------------------ */

export function parseEmailCSV(content: string): EmailRecipient[] {
  const lines = content.split("\n").filter((line) => line.trim())
  const records: EmailRecipient[] = []

  // Skip header if present
  const startIndex =
    lines[0]?.toLowerCase().includes("first") ||
    lines[0]?.toLowerCase().includes("email")
      ? 1
      : 0

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Parse CSV line handling quoted values
    const parts: string[] = []
    let current = ""
    let inQuotes = false

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === "," && !inQuotes) {
        parts.push(current.trim())
        current = ""
      } else {
        current += char
      }
    }
    parts.push(current.trim())

    // Expected: firstName, lastName, email
    if (parts.length >= 3) {
      records.push({
        firstName: parts[0]?.replace(/^"|"$/g, ""),
        lastName: parts[1]?.replace(/^"|"$/g, ""),
        email: parts[2]?.replace(/^"|"$/g, "").toLowerCase().trim(),
        rowNumber: i + 1,
      })
    }
  }

  return records
}

/* ------------------------------------------------------------------ */
/*  Validation                                                        */
/* ------------------------------------------------------------------ */

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 254
}

export function sanitizeRecipients(
  records: EmailRecipient[]
): {
  valid: EmailRecipient[]
  invalid: Array<{ record: EmailRecipient; reason: string }>
  duplicates: number
} {
  const valid: EmailRecipient[] = []
  const invalid: Array<{ record: EmailRecipient; reason: string }> = []
  const seenEmails = new Set<string>()
  let duplicates = 0

  for (const record of records) {
    const email = record.email?.toLowerCase().trim()

    if (seenEmails.has(email)) {
      duplicates++
      continue
    }

    if (!email || !isValidEmail(email)) {
      invalid.push({ record, reason: "Invalid email format" })
      continue
    }

    seenEmails.add(email)
    valid.push(record)
  }

  return { valid, invalid, duplicates }
}

/* ------------------------------------------------------------------ */
/*  Template Substitution                                             */
/* ------------------------------------------------------------------ */

export function renderTemplate(
  template: string,
  recipient: EmailRecipient
): string {
  return template
    .replace(/\{\{firstName\}\}/gi, recipient.firstName || "")
    .replace(/\{\{lastName\}\}/gi, recipient.lastName || "")
    .replace(/\{\{email\}\}/gi, recipient.email || "")
    .replace(/\{\{name\}\}/gi, `${recipient.firstName || ""} ${recipient.lastName || ""}`.trim())
}

/* ------------------------------------------------------------------ */
/*  Bulk Send                                                         */
/* ------------------------------------------------------------------ */

export async function sendBulkEmails(
  recipients: EmailRecipient[],
  request: BulkEmailRequest,
  onProgress?: (sent: number, total: number, failed: number) => void
): Promise<BulkEmailResult> {
  const startTime = Date.now()
  const rateLimit = request.rateLimitPerMinute ?? 60
  const batchSize = request.batchSize ?? 10
  const delayMs = request.delayMs ?? 1000

  let sent = 0
  let failed = 0
  const errors: Array<{ row: number; email: string; error: string }> = []

  const batches: EmailRecipient[][] = []
  for (let i = 0; i < recipients.length; i += batchSize) {
    batches.push(recipients.slice(i, i + batchSize))
  }

  log.info(
    {
      total: recipients.length,
      batches: batches.length,
      provider: request.provider,
    },
    "Starting bulk email send"
  )

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]

    const results = await Promise.allSettled(
      batch.map(async (recipient) => {
        const subject = renderTemplate(request.subject, recipient)
        const textBody = renderTemplate(request.body, recipient)
        const htmlBody = request.htmlBody ? renderTemplate(request.htmlBody, recipient) : undefined

        switch (request.provider) {
          case "smtp": {
            if (!request.smtpConfig) {
              throw new Error("SMTP config required")
            }
            const result = await sendTestEmail({
              smtp: request.smtpConfig,
              to: recipient.email,
              subject,
              body: textBody,
            })
            if (!result.ok) throw new Error("SMTP send failed")
            break
          }
          case "resend": {
            const result = await sendResendEmail({
              to: recipient.email,
              subject,
              html: htmlBody || `<p>${textBody}</p>`,
              text: textBody,
            })
            if (!result.success) throw new Error(result.error || "Resend failed")
            break
          }
          case "mysmtp": {
            const result = await sendMySmtpEmail({
              to: recipient.email,
              subject,
              html: htmlBody || `<p>${textBody}</p>`,
              text: textBody,
            })
            if (!result.success) throw new Error(result.error || "MySMTP failed")
            break
          }
          default:
            throw new Error(`Unknown provider: ${request.provider}`)
        }

        // Log to database
        await logBulkEmail(recipient.email, subject, request.provider)
      })
    )

    results.forEach((result, idx) => {
      const recipient = batch[idx]
      if (result.status === "fulfilled") {
        sent++
      } else {
        failed++
        errors.push({
          row: recipient.rowNumber || 0,
          email: recipient.email,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown error",
        })
      }
    })

    onProgress?.(sent, recipients.length, failed)

    // Rate limiting delay between batches
    if (i < batches.length - 1) {
      const minDelay = Math.max(delayMs, (60000 / rateLimit) * batchSize)
      await sleep(minDelay)
    }
  }

  const durationMs = Date.now() - startTime
  log.info({ sent, failed, durationMs }, "Bulk email send completed")

  return {
    total: recipients.length,
    valid: recipients.length,
    invalid: 0,
    duplicates: 0,
    sent,
    failed,
    errors,
    durationMs,
  }
}

async function logBulkEmail(
  to: string,
  subject: string,
  provider: string
): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        to,
        subject,
        type: "bulk",
        messageId: `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    })
  } catch {
    // Silently ignore logging failures
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
