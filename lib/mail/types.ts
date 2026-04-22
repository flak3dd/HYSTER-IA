import { z } from "zod"

export const MailProtocol = z.enum(["imap", "pop3"])
export type MailProtocol = z.infer<typeof MailProtocol>

export const MailAccount = z.object({
  id: z.string().min(1),
  protocol: MailProtocol,
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(true),
  user: z.string().min(1),
  password: z.string().min(1),
  mailbox: z.string().min(1).default("INBOX"),
  label: z.string().min(1).optional(),
})
export type MailAccount = z.infer<typeof MailAccount>

export type SafeMailAccount = Omit<MailAccount, "password">

export type MailAttachmentMeta = {
  messageUid: number | string
  filename: string
  size: number
  contentType: string
  contentDisposition: string | null
  checksum: string | null
}

export type MailMessageSummary = {
  uid: number | string
  subject: string | null
  from: string | null
  to: string | null
  date: string | null
  attachments: Array<Pick<MailAttachmentMeta, "filename" | "size" | "contentType">>
}

export type MailAttachmentBody = {
  filename: string
  contentType: string
  content: Buffer
  size: number
  checksum: string
}

/* ------------------------------------------------------------------ */
/*  SMTP / Auto-test types                                            */
/* ------------------------------------------------------------------ */

export const SmtpConfig = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().min(1),
  password: z.string().min(1),
  from: z.string().min(1).optional(),
})
export type SmtpConfig = z.infer<typeof SmtpConfig>

export const SendTestPayload = z.object({
  smtp: SmtpConfig,
  to: z.string().email(),
  subject: z.string().min(1).default("D-Panel Mail Test"),
  body: z.string().min(1).default("This is an automated test message from D-Panel."),
})
export type SendTestPayload = z.infer<typeof SendTestPayload>

export type MailTestResult = {
  accountId: string
  label: string | null
  protocol: string
  status: "pass" | "fail"
  latencyMs: number
  messageCount?: number
  error?: string
  testedAt: string
}

export type AutoTestState = {
  enabled: boolean
  intervalMinutes: number
  lastRun: string | null
  nextRun: string | null
  results: MailTestResult[]
}
