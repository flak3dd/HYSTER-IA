import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  parseEmailCSV,
  sanitizeRecipients,
  sendBulkEmails,
  type BulkEmailRequest,
} from "@/lib/mailer/bulk-email"
import { resolveSmtpConfig } from "@/lib/mailer/smtp-config"
import { z } from "zod"
import logger from "@/lib/logger"

const log = logger.child({ module: "api-bulk-send" })

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BulkSendSchema = z.object({
  csvContent: z.string().min(1),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(50000),
  htmlBody: z.string().max(100000).optional(),
  provider: z.enum(["smtp", "resend", "mysmtp"]).default("smtp"),
  smtpConfigId: z.string().optional(),
  rateLimitPerMinute: z.number().min(1).max(1000).default(60),
  batchSize: z.number().min(1).max(100).default(10),
  delayMs: z.number().min(100).max(60000).default(1000),
  dryRun: z.boolean().default(false),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const body = await req.json()
    const validated = BulkSendSchema.parse(body)

    log.info({
      provider: validated.provider,
      dryRun: validated.dryRun,
      rateLimit: validated.rateLimitPerMinute,
    }, "Bulk email request received")

    // Parse CSV
    const records = parseEmailCSV(validated.csvContent)

    if (records.length === 0) {
      return NextResponse.json(
        { error: "No valid records found in CSV" },
        { status: 400 }
      )
    }

    if (records.length > 100000) {
      return NextResponse.json(
        { error: "CSV too large. Maximum 100,000 records allowed." },
        { status: 400 }
      )
    }

    // Sanitize
    const { valid, invalid, duplicates } = sanitizeRecipients(records)

    log.info({
      total: records.length,
      valid: valid.length,
      invalid: invalid.length,
      duplicates,
    }, "CSV parsed and sanitized")

    // If dry run, return analysis only
    if (validated.dryRun) {
      return NextResponse.json({
        dryRun: true,
        summary: {
          totalRecords: records.length,
          validEmails: valid.length,
          invalidEmails: invalid.length,
          duplicates,
          batches: Math.ceil(valid.length / validated.batchSize),
          estimatedMinutes: Math.ceil(
            (valid.length / validated.rateLimitPerMinute)
          ),
        },
        invalidDetails: invalid.slice(0, 20).map((i) => ({
          email: i.record.email,
          reason: i.reason,
          row: i.record.rowNumber,
        })),
        sample: valid.slice(0, 5).map((r) => ({
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
        })),
        preview: {
          subject: validated.subject,
          body: validated.body,
          firstRecipient: valid[0]
            ? {
                subject: validated.subject.replace(
                  /\{\{firstName\}\}/gi,
                  valid[0].firstName
                ),
                body: validated.body.replace(
                  /\{\{firstName\}\}/gi,
                  valid[0].firstName
                ),
              }
            : null,
        },
      })
    }

    // Resolve SMTP config if needed
    let smtpConfig = undefined
    if (validated.provider === "smtp") {
      smtpConfig = await resolveSmtpConfig(validated.smtpConfigId)
      if (!smtpConfig) {
        return NextResponse.json(
          {
            error:
              "No SMTP configuration found. Please save an SMTP config or set SMTP_HOST environment variable.",
          },
          { status: 500 }
        )
      }
    }

    // Send emails
    const result = await sendBulkEmails(
      valid,
      {
        subject: validated.subject,
        body: validated.body,
        htmlBody: validated.htmlBody,
        provider: validated.provider,
        smtpConfig,
        smtpConfigId: validated.smtpConfigId,
        rateLimitPerMinute: validated.rateLimitPerMinute,
        batchSize: validated.batchSize,
        delayMs: validated.delayMs,
      },
      (sent, total, failed) => {
        log.info({ sent, total, failed }, "Bulk email progress")
      }
    )

    return NextResponse.json({
      success: true,
      results: {
        totalProcessed: result.total,
        validEmails: result.valid,
        invalidEmails: result.invalid,
        duplicatesRemoved: result.duplicates,
        emailsSent: result.sent,
        emailsFailed: result.failed,
        errors: result.errors.length,
        durationMs: result.durationMs,
      },
      errorDetails: result.errors.slice(0, 50),
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", details: err.issues },
        { status: 400 }
      )
    }

    log.error({ error: err }, "Bulk email send failed")
    return toErrorResponse(err)
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    return NextResponse.json({
      endpoints: {
        POST: "/api/admin/mail/bulk-send",
      },
      limits: {
        maxRecords: 100000,
        maxRateLimitPerMinute: 1000,
        maxBatchSize: 100,
      },
      requiredFields: {
        csvContent: "firstName,lastName,email (CSV format)",
        subject: "string (supports {{firstName}}, {{lastName}}, {{email}}, {{name}})",
        body: "string (supports {{firstName}}, {{lastName}}, {{email}}, {{name}})",
        provider: "smtp | resend | mysmtp",
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
