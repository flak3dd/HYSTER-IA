/**
 * Bulk Campaign API Endpoint
 * Processes large contact lists (e.g., 90k Australia Trader Forex Leads)
 */

import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  parseCSV,
  sanitizeContacts,
  processBulkCampaign,
  type CampaignConfig,
  type ContactRecord,
} from "@/lib/mailer/bulk-campaign"
import logger from "@/lib/logger"

const log = logger.child({ module: 'api-bulk-campaign' })

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BulkCampaignRequest = {
  name: z.string().min(1).max(100),
  csvContent: z.string().min(1),
  templateId: z.enum(['tunnel', 'tunnel-with-payloads', 'custom']),
  subject: z.string().optional(),
  rateLimitPerHour: z.number().min(1).max(1000).default(100),
  batchSize: z.number().min(1).max(100).default(10),
  delayMs: z.number().min(100).max(60000).default(5000),
  dryRun: z.boolean().default(false),
  nodeId: z.string().optional(),
  tunnelType: z.string().optional(),
  customMessage: z.string().optional(),
}

import { z } from "zod"

const requestSchema = z.object(BulkCampaignRequest)

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const body = await req.json()
    const validated = requestSchema.parse(body)

    log.info({
      campaign: validated.name,
      dryRun: validated.dryRun,
      rateLimit: validated.rateLimitPerHour,
    }, 'Bulk campaign request received')

    // Parse CSV
    const records = parseCSV(validated.csvContent)

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

    // Sanitize contacts
    const { valid, invalid, duplicates } = sanitizeContacts(records)

    log.info({
      total: records.length,
      valid: valid.length,
      invalid: invalid.length,
      duplicates,
    }, 'CSV parsed and sanitized')

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
          estimatedMinutes: Math.ceil((valid.length / validated.rateLimitPerHour) * 60),
        },
        invalidDetails: invalid.slice(0, 20).map(i => ({
          email: i.record.email,
          reason: i.reason,
          row: i.record.rowNumber,
        })),
        sample: valid.slice(0, 5).map(c => ({
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          country: c.country,
        })),
      })
    }

    // Process campaign
    const config: CampaignConfig = {
      name: validated.name,
      templateId: validated.templateId,
      subject: validated.subject,
      rateLimitPerHour: validated.rateLimitPerHour,
      batchSize: validated.batchSize,
      delayMs: validated.delayMs,
    }

    const result = await processBulkCampaign(
      valid,
      config,
      (sent, total, errors) => {
        log.info({ sent, total, errors }, 'Campaign progress')
      }
    )

    return NextResponse.json({
      success: true,
      campaign: validated.name,
      results: {
        totalProcessed: result.total,
        validEmails: result.valid,
        invalidEmails: result.invalid,
        duplicatesRemoved: result.duplicates,
        emailsSent: result.queued,
        batches: result.batches,
        errors: result.errors.length,
        estimatedMinutes: result.estimatedMinutes,
        actualDurationMinutes: Math.round(result.estimatedMinutes * (result.queued / result.valid)),
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

    log.error({ error: err }, 'Bulk campaign failed')
    return toErrorResponse(err)
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    return NextResponse.json({
      endpoints: {
        POST: "/api/mailer/campaigns/bulk",
      },
      limits: {
        maxRecords: 100000,
        maxRateLimitPerHour: 1000,
        maxBatchSize: 100,
      },
      example: {
        name: "Forex Trader Campaign Q2",
        csvContent: "firstName,lastName,email,country,countryCode,phone\nJohn,Doe,john@example.com,Australia,61,412345678",
        templateId: "tunnel",
        rateLimitPerHour: 100,
        batchSize: 10,
        dryRun: true,
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
