import { randomBytes } from "node:crypto"
import { z } from "zod"

export const TrackingConfig = z.object({
  enabled: z.boolean().default(false),
  trackingDomain: z.string().url().optional(),
  trackingPixelPath: z.string().default("/track/pixel"),
  trackingLinkPath: z.string().default("/track/link"),
})
export type TrackingConfig = z.infer<typeof TrackingConfig>

export const TrackingEvent = z.object({
  id: z.string(),
  type: z.enum(["pixel", "link", "bounce"]),
  messageId: z.string(),
  recipient: z.string().email(),
  timestamp: z.string(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type TrackingEvent = z.infer<typeof TrackingEvent>

// In-memory tracking storage (in production, this would be a database)
const trackingEvents: Map<string, TrackingEvent[]> = new Map()

export function generateTrackingId(): string {
  return randomBytes(16).toString("hex")
}

export function injectTrackingPixel(
  htmlContent: string,
  trackingUrl: string,
  messageId: string,
): string {
  const pixelUrl = `${trackingUrl}?id=${messageId}&type=pixel`
  const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`
  
  // Insert before closing body tag
  if (htmlContent.includes("</body>")) {
    return htmlContent.replace("</body>", `${pixelHtml}</body>`)
  }
  
  // If no body tag, append at the end
  return htmlContent + pixelHtml
}

export function injectLinkTracking(
  htmlContent: string,
  trackingDomain: string,
  messageId: string,
): string {
  if (!trackingDomain) return htmlContent
  
  // Replace all href links with tracking links
  return htmlContent.replace(
    /href=["']([^"']+)["']/gi,
    (match, url) => {
      // Skip anchor links, mailto, tel, and already tracked links
      if (url.startsWith("#") || url.startsWith("mailto:") || url.startsWith("tel:") || url.includes(trackingDomain)) {
        return match
      }
      
      const trackingUrl = `${trackingDomain}/track/link?url=${encodeURIComponent(url)}&id=${messageId}`
      return `href="${trackingUrl}"`
    }
  )
}

export function createTrackingEvent(
  type: "pixel" | "link" | "bounce",
  messageId: string,
  recipient: string,
  metadata?: Record<string, unknown>,
): TrackingEvent {
  return {
    id: generateTrackingId(),
    type,
    messageId,
    recipient,
    timestamp: new Date().toISOString(),
    metadata,
  }
}

export function recordTrackingEvent(event: TrackingEvent): void {
  const events = trackingEvents.get(event.messageId) || []
  events.push(event)
  trackingEvents.set(event.messageId, events)
}

export function getTrackingEvents(messageId: string): TrackingEvent[] {
  return trackingEvents.get(messageId) || []
}

export function getMessageStats(messageId: string): {
  opens: number
  clicks: number
  bounces: number
  lastActivity: string | null
} {
  const events = trackingEvents.get(messageId) || []
  
  const opens = events.filter(e => e.type === "pixel").length
  const clicks = events.filter(e => e.type === "link").length
  const bounces = events.filter(e => e.type === "bounce").length
  
  const lastActivity = events.length > 0
    ? events[events.length - 1].timestamp
    : null
  
  return {
    opens,
    clicks,
    bounces,
    lastActivity,
  }
}

export function getAllTrackingEvents(): TrackingEvent[] {
  const allEvents: TrackingEvent[] = []
  
  for (const events of trackingEvents.values()) {
    allEvents.push(...events)
  }
  
  return allEvents.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}

export function clearTrackingEvents(messageId?: string): void {
  if (messageId) {
    trackingEvents.delete(messageId)
  } else {
    trackingEvents.clear()
  }
}