import { simpleParser } from "mailparser"
import { z } from "zod"

export const BounceType = z.enum([
  "hard",
  "soft",
  "complaint",
  "unknown",
])
export type BounceType = z.infer<typeof BounceType>

export const BounceReason = z.enum([
  "invalid_recipient",
  "mailbox_full",
  "domain_not_found",
  "blocked",
  "spam_complaint",
  "size_exceeded",
  "timeout",
  "unknown",
])
export type BounceReason = z.infer<typeof BounceReason>

export const BounceEvent = z.object({
  id: z.string(),
  messageId: z.string(),
  recipient: z.string().email(),
  bounceType: BounceType,
  bounceReason: BounceReason,
  originalSubject: z.string().optional(),
  bounceMessage: z.string(),
  timestamp: z.string(),
  processed: z.boolean().default(false),
})
export type BounceEvent = z.infer<typeof BounceEvent>

// In-memory bounce storage (in production, this would be a database)
const bounceEvents: BounceEvent[] = []
const suppressedEmails: Set<string> = new Set()

// Bounce detection patterns
const bouncePatterns = {
  hard: [
    /user unknown/i,
    /recipient address rejected/i,
    /no such user/i,
    /invalid recipient/i,
    /address does not exist/i,
    /550 5\.1\.1/i,
    /550 5\.7\.1/i,
  ],
  soft: [
    /mailbox full/i,
    /over quota/i,
    /temporary failure/i,
    /421/i,
    /450/i,
    /452/i,
  ],
  complaint: [
    /spam complaint/i,
    /abuse report/i,
    /feedback loop/i,
  ],
}

const reasonPatterns: Record<BounceReason, RegExp[]> = {
  invalid_recipient: [/user unknown/i, /recipient address rejected/i, /no such user/i],
  mailbox_full: [/mailbox full/i, /over quota/i, /quota exceeded/i],
  domain_not_found: [/domain not found/i, /no such domain/i, /nxdomain/i],
  blocked: [/blocked/i, /blacklisted/i, /spam/i, /rejected/i],
  spam_complaint: [/spam complaint/i, /abuse report/i, /feedback loop/i],
  size_exceeded: [/size limit/i, /too large/i, /message size/i],
  timeout: [/timeout/i, /connection timed/i, /timed out/i],
  unknown: [],
}

export function detectBounceType(message: string): BounceType {
  for (const pattern of bouncePatterns.hard) {
    if (pattern.test(message)) return "hard"
  }
  for (const pattern of bouncePatterns.complaint) {
    if (pattern.test(message)) return "complaint"
  }
  for (const pattern of bouncePatterns.soft) {
    if (pattern.test(message)) return "soft"
  }
  return "unknown"
}

export function detectBounceReason(message: string): BounceReason {
  for (const [reason, patterns] of Object.entries(reasonPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return reason as BounceReason
      }
    }
  }
  return "unknown"
}

export async function parseBounceEmail(rawEmail: string | Buffer): Promise<{
  bounceType: BounceType
  bounceReason: BounceReason
  bounceMessage: string
  originalRecipient?: string
  originalSubject?: string
}> {
  const parsed = await simpleParser(rawEmail)
  
  const bounceMessage = parsed.text || parsed.html || ""
  const bounceType = detectBounceType(bounceMessage)
  const bounceReason = detectBounceReason(bounceMessage)
  
  // Try to extract original recipient from common bounce formats
  let originalRecipient: string | undefined
  const recipientMatch = bounceMessage.match(/(?:to|recipient|address):\s*([^\s<]+@[^\s>]+)/i)
  if (recipientMatch) {
    originalRecipient = recipientMatch[1]
  }
  
  return {
    bounceType,
    bounceReason,
    bounceMessage,
    originalRecipient,
    originalSubject: parsed.subject,
  }
}

export function createBounceEvent(
  messageId: string,
  recipient: string,
  bounceType: BounceType,
  bounceReason: BounceReason,
  bounceMessage: string,
  originalSubject?: string,
): BounceEvent {
  return {
    id: `bounce_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    messageId,
    recipient,
    bounceType,
    bounceReason,
    bounceMessage,
    originalSubject,
    timestamp: new Date().toISOString(),
    processed: false,
  }
}

export function recordBounce(event: BounceEvent): void {
  bounceEvents.push(event)
  
  // Auto-suppress hard bounces and complaints
  if (event.bounceType === "hard" || event.bounceType === "complaint") {
    suppressedEmails.add(event.recipient.toLowerCase())
  }
}

export function getBounceEvents(messageId?: string): BounceEvent[] {
  if (messageId) {
    return bounceEvents.filter(e => e.messageId === messageId)
  }
  return [...bounceEvents]
}

export function getBounceStats(): {
  total: number
  hard: number
  soft: number
  complaints: number
  unknown: number
} {
  return {
    total: bounceEvents.length,
    hard: bounceEvents.filter(e => e.bounceType === "hard").length,
    soft: bounceEvents.filter(e => e.bounceType === "soft").length,
    complaints: bounceEvents.filter(e => e.bounceType === "complaint").length,
    unknown: bounceEvents.filter(e => e.bounceType === "unknown").length,
  }
}

export function isEmailSuppressed(email: string): boolean {
  return suppressedEmails.has(email.toLowerCase())
}

export function suppressEmail(email: string): void {
  suppressedEmails.add(email.toLowerCase())
}

export function unsuppressEmail(email: string): boolean {
  return suppressedEmails.delete(email.toLowerCase())
}

export function getSuppressedEmails(): string[] {
  return Array.from(suppressedEmails)
}

export function clearBounceEvents(): void {
  bounceEvents.length = 0
}

export function clearSuppressedEmails(): void {
  suppressedEmails.clear()
}

export function shouldRetrySend(bounceType: BounceType): boolean {
  // Only retry soft bounces
  return bounceType === "soft"
}