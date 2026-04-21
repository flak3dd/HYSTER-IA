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
