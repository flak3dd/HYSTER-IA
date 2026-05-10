/**
 * Bulk Campaign Processing for Large Contact Lists
 * Handles CSV parsing, sanitization, batching, and rate-limited sending
 */

import { sendResendEmail, sendResendBatchEmails, type ResendEmailOptions } from './resend'
import logger from '@/lib/logger'

const log = logger.child({ module: 'bulk-campaign' })

export interface ContactRecord {
  firstName: string
  lastName: string
  email: string
  country: string
  countryCode: string
  phone: string
  rowNumber?: number
}

export interface CampaignConfig {
  name: string
  templateId: 'tunnel' | 'tunnel-with-payloads' | 'custom'
  subject?: string
  rateLimitPerHour: number
  batchSize: number
  delayMs: number
  unsubscribeUrl?: string
}

export interface CampaignResult {
  total: number
  valid: number
  invalid: number
  duplicates: number
  queued: number
  batches: number
  estimatedMinutes: number
  errors: Array<{ row: number; email: string; error: string }>
}

/**
 * Parse CSV content into contact records
 */
export function parseCSV(content: string): ContactRecord[] {
  const lines = content.split('\n').filter(line => line.trim())
  const records: ContactRecord[] = []

  // Skip header if present (detect by checking for "firstName" or email pattern)
  const startIndex = lines[0]?.toLowerCase().includes('first') || 
                     lines[0]?.toLowerCase().includes('email') ? 1 : 0

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Parse CSV line handling quoted values
    const parts: string[] = []
    let current = ''
    let inQuotes = false

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    parts.push(current.trim())

    // Expected: firstName, lastName, email, country, countryCode, phone
    if (parts.length >= 6) {
      records.push({
        firstName: parts[0]?.replace(/^"|"$/g, ''),
        lastName: parts[1]?.replace(/^"|"$/g, ''),
        email: parts[2]?.replace(/^"|"$/g, '').toLowerCase().trim(),
        country: parts[3]?.replace(/^"|"$/g, ''),
        countryCode: parts[4]?.replace(/^"|"$/g, ''),
        phone: parts[5]?.replace(/^"|"$/g, ''),
        rowNumber: i + 1,
      })
    }
  }

  return records
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 254
}

/**
 * Check for disposable email domains
 */
export function isDisposableEmail(email: string): boolean {
  const disposableDomains = [
    'tempmail.com', 'throwaway.com', 'mailinator.com', 'guerrillamail.com',
    'sharklasers.com', 'spam4.me', 'trashmail.com', 'yopmail.com',
    'temp.inbox.com', 'mailnesia.com', 'burnermail.io',
  ]
  const domain = email.split('@')[1]?.toLowerCase()
  return domain ? disposableDomains.some(d => domain.includes(d)) : false
}

/**
 * Sanitize and deduplicate contact list
 */
export function sanitizeContacts(records: ContactRecord[]): {
  valid: ContactRecord[]
  invalid: Array<{ record: ContactRecord; reason: string }>
  duplicates: number
} {
  const valid: ContactRecord[] = []
  const invalid: Array<{ record: ContactRecord; reason: string }> = []
  const seenEmails = new Set<string>()
  let duplicates = 0

  for (const record of records) {
    const email = record.email?.toLowerCase().trim()

    // Check for duplicates
    if (seenEmails.has(email)) {
      duplicates++
      continue
    }

    // Validate email
    if (!email || !isValidEmail(email)) {
      invalid.push({ record, reason: 'Invalid email format' })
      continue
    }

    // Check disposable
    if (isDisposableEmail(email)) {
      invalid.push({ record, reason: 'Disposable email domain' })
      continue
    }

    // Mark as seen and add to valid
    seenEmails.add(email)
    valid.push(record)
  }

  return { valid, invalid, duplicates }
}

/**
 * Chunk array into batches
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Generate personalized email content for a contact
 */
export function generatePersonalizedEmail(
  contact: ContactRecord,
  config: CampaignConfig,
  templateData?: {
    nodeId?: string
    tunnelType?: string
    customMessage?: string
  }
): ResendEmailOptions {
  const firstName = contact.firstName || 'Trader'

  const subject = config.subject ||
    `${firstName}, your secure trading tunnel is ready`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
    <h1 style="color: #2c3e50; margin-top: 0;">Hello ${firstName},</h1>
    
    <p style="margin-bottom: 20px;">
      ${templateData?.customMessage || 
        'Your secure trading infrastructure is now available. Access your personalized tunnel configuration below.'}
    </p>
    
    <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
      <strong style="color: #856404;">⚠️ Security Notice:</strong>
      <p style="margin: 5px 0 0 0; color: #856404;">
        This configuration contains sensitive authentication information. 
        Keep it secure and never share it with unauthorized parties.
      </p>
    </div>
    
    ${config.unsubscribeUrl ? `
    <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
    <p style="color: #6c757d; font-size: 12px; margin: 0;">
      <a href="${config.unsubscribeUrl}" style="color: #6c757d;">Unsubscribe</a> | 
      Sent to ${contact.email}
    </p>
    ` : ''}
    
    <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
    <p style="color: #6c757d; font-size: 12px; margin: 0;">
      Sent at ${new Date().toISOString()} by Hysteria 2 Admin Panel
    </p>
  </div>
</body>
</html>`

  const text = `Hello ${firstName},

${templateData?.customMessage || 
  'Your secure trading infrastructure is now available. Access your personalized tunnel configuration below.'}

⚠️ SECURITY NOTICE:
This configuration contains sensitive authentication information. 
Keep it secure and never share it with unauthorized parties.

${config.unsubscribeUrl ? `---
Unsubscribe: ${config.unsubscribeUrl}
Sent to: ${contact.email}
` : ''}
---
Sent at ${new Date().toISOString()} by Hysteria 2 Admin Panel`

  return {
    to: contact.email,
    subject,
    html,
    text,
    tags: [
      { name: 'email_type', value: 'bulk_campaign' },
      { name: 'campaign', value: config.name },
      { name: 'country', value: contact.country || 'unknown' },
    ],
  }
}

/**
 * Process bulk campaign with rate limiting
 */
export async function processBulkCampaign(
  records: ContactRecord[],
  config: CampaignConfig,
  onProgress?: (sent: number, total: number, errors: number) => void
): Promise<CampaignResult> {
  const startTime = Date.now()

  // Sanitize
  const { valid, invalid, duplicates } = sanitizeContacts(records)

  log.info({
    campaign: config.name,
    total: records.length,
    valid: valid.length,
    invalid: invalid.length,
    duplicates,
  }, 'Campaign sanitized')

  // Calculate batches
  const batches = chunk(valid, config.batchSize)
  const estimatedMinutes = Math.ceil((valid.length / config.rateLimitPerHour) * 60)

  let sent = 0
  let errorCount = 0
  const errors: Array<{ row: number; email: string; error: string }> = []

  // Process batches with delay
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const batchEmails = batch.map(contact =>
      generatePersonalizedEmail(contact, config)
    )

    try {
      const results = await sendResendBatchEmails(batchEmails)

      // Track results
      results.forEach((result, idx) => {
        if (result.success) {
          sent++
        } else {
          errorCount++
          errors.push({
            row: batch[idx].rowNumber || 0,
            email: batch[idx].email,
            error: result.error || 'Unknown error',
          })
        }
      })

      // Progress callback
      onProgress?.(sent, valid.length, errorCount)

      // Rate limiting delay between batches
      if (i < batches.length - 1) {
        await sleep(config.delayMs)
      }
    } catch (error) {
      log.error({ error, batch: i }, 'Batch processing error')
      errorCount += batch.length
      errors.push(...batch.map(c => ({
        row: c.rowNumber || 0,
        email: c.email,
        error: error instanceof Error ? error.message : 'Batch failed',
      })))
    }
  }

  const duration = Date.now() - startTime

  log.info({
    campaign: config.name,
    sent,
    errors: errorCount,
    durationMs: duration,
  }, 'Campaign completed')

  return {
    total: records.length,
    valid: valid.length,
    invalid: invalid.length,
    duplicates,
    queued: sent,
    batches: batches.length,
    estimatedMinutes,
    errors,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
