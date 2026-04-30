import { z } from "zod"

export const QueueConfig = z.object({
  maxConcurrent: z.number().int().min(1).default(5),
  rateLimitPerMinute: z.number().int().min(1).default(30),
  retryAttempts: z.number().int().min(0).default(3),
  retryDelayMs: z.number().int().min(1000).default(5000),
})
export type QueueConfig = z.infer<typeof QueueConfig>

export const QueuedEmail = z.object({
  id: z.string(),
  to: z.string().email(),
  subject: z.string(),
  htmlContent: z.string(),
  textContent: z.string(),
  from: z.string(),
  priority: z.number().int().min(1).max(10).default(5),
  attempts: z.number().int().min(0).default(0),
  status: z.enum(["pending", "processing", "sent", "failed"]),
  queuedAt: z.string(),
  sentAt: z.string().optional(),
  error: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})
export type QueuedEmail = z.infer<typeof QueuedEmail>

export const QueueStats = z.object({
  pending: z.number(),
  processing: z.number(),
  sent: z.number(),
  failed: z.number(),
  total: z.number(),
})
export type QueueStats = z.infer<typeof QueueStats>

// In-memory queue storage (in production, this would be a database + job queue like Bull)
const emailQueue: QueuedEmail[] = []
const config: QueueConfig = {
  maxConcurrent: 5,
  rateLimitPerMinute: 30,
  retryAttempts: 3,
  retryDelayMs: 5000,
}

let processingCount = 0
let sentInLastMinute = 0
let rateLimitTimer: ReturnType<typeof setInterval> | null = null

// Reset rate limit counter every minute
function startRateLimitTimer() {
  if (rateLimitTimer) return
  rateLimitTimer = setInterval(() => {
    sentInLastMinute = 0
  }, 60_000)
}

export function configureQueue(newConfig: Partial<QueueConfig>): QueueConfig {
  Object.assign(config, newConfig)
  startRateLimitTimer()
  return { ...config }
}

export function getQueueConfig(): QueueConfig {
  return { ...config }
}

export function addToQueue(email: Omit<QueuedEmail, "id" | "status" | "queuedAt" | "attempts">): QueuedEmail {
  const queuedEmail: QueuedEmail = {
    ...email,
    id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: "pending",
    queuedAt: new Date().toISOString(),
    attempts: 0,
  }
  
  emailQueue.push(queuedEmail)
  
  // Sort by priority (higher priority first)
  emailQueue.sort((a, b) => b.priority - a.priority)
  
  return queuedEmail
}

export function getQueueStats(): QueueStats {
  const pending = emailQueue.filter(e => e.status === "pending").length
  const processing = emailQueue.filter(e => e.status === "processing").length
  const sent = emailQueue.filter(e => e.status === "sent").length
  const failed = emailQueue.filter(e => e.status === "failed").length
  
  return {
    pending,
    processing,
    sent,
    failed,
    total: emailQueue.length,
  }
}

export function getQueuedEmails(limit = 50): QueuedEmail[] {
  return emailQueue.slice(0, limit)
}

export function getQueuedEmail(id: string): QueuedEmail | null {
  return emailQueue.find(e => e.id === id) ?? null
}

export function updateEmailStatus(
  id: string,
  status: QueuedEmail["status"],
  error?: string,
): QueuedEmail | null {
  const email = emailQueue.find(e => e.id === id)
  if (!email) return null
  
  email.status = status
  if (error) email.error = error
  if (status === "sent") {
    email.sentAt = new Date().toISOString()
    sentInLastMinute++
  }
  if (status === "processing") {
    processingCount++
  }
  if (status === "sent" || status === "failed") {
    processingCount--
  }
  
  return email
}

export function canProcessNext(): boolean {
  return (
    processingCount < config.maxConcurrent &&
    sentInLastMinute < config.rateLimitPerMinute
  )
}

export function getNextPendingEmail(): QueuedEmail | null {
  if (!canProcessNext()) return null
  
  const email = emailQueue.find(e => e.status === "pending")
  if (!email) return null
  
  email.status = "processing"
  email.attempts++
  processingCount++
  
  return email
}

export function shouldRetry(email: QueuedEmail): boolean {
  return email.attempts < config.retryAttempts
}

export function clearQueue(): void {
  emailQueue.length = 0
  processingCount = 0
  sentInLastMinute = 0
}

export function removeEmail(id: string): boolean {
  const index = emailQueue.findIndex(e => e.id === id)
  if (index === -1) return false
  
  const email = emailQueue[index]
  if (email.status === "processing") {
    processingCount--
  }
  
  emailQueue.splice(index, 1)
  return true
}

export function retryFailedEmails(): number {
  let retried = 0
  
  for (const email of emailQueue) {
    if (email.status === "failed" && shouldRetry(email)) {
      email.status = "pending"
      email.error = undefined
      retried++
    }
  }
  
  return retried
}