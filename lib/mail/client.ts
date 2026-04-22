import { createHash } from "node:crypto"
import { ImapFlow, type FetchMessageObject } from "imapflow"
import { simpleParser, type ParsedMail } from "mailparser"
import Pop3Command from "node-pop3"
import type {
  MailAccount,
  MailAttachmentBody,
  MailAttachmentMeta,
  MailMessageSummary,
} from "@/lib/mail/types"

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex")
}

function firstAddr(h: ParsedMail["from"] | ParsedMail["to"]): string | null {
  if (!h) return null
  if (Array.isArray(h)) {
    const first = h[0]
    return first?.text ?? null
  }
  return h.text ?? null
}

// ---------- IMAP ----------

async function withImap<T>(account: MailAccount, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: { user: account.user, pass: account.password },
    logger: false,
  })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.logout().catch(() => client.close())
  }
}

function extractAttachmentsMeta(parsed: ParsedMail, uid: number): MailAttachmentMeta[] {
  return parsed.attachments.map((att) => ({
    messageUid: uid,
    filename: att.filename ?? "attachment.bin",
    size: att.size,
    contentType: att.contentType,
    contentDisposition: att.contentDisposition ?? null,
    checksum: att.checksum ?? null,
  }))
}

async function parseSource(msg: FetchMessageObject): Promise<ParsedMail> {
  if (!msg.source) throw new Error("message source missing")
  return simpleParser(msg.source)
}

async function imapListMessages(
  account: MailAccount,
  limit: number,
): Promise<MailMessageSummary[]> {
  return withImap(account, async (client) => {
    const lock = await client.getMailboxLock(account.mailbox)
    try {
      const total = client.mailbox && typeof client.mailbox === "object" ? client.mailbox.exists : 0
      if (total === 0) return []
      const start = Math.max(1, total - limit + 1)
      const results: MailMessageSummary[] = []
      for await (const msg of client.fetch(`${start}:${total}`, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        source: true,
      })) {
        const parsed = await parseSource(msg)
        const attachments = extractAttachmentsMeta(parsed, msg.uid).map((a) => ({
          filename: a.filename,
          size: a.size,
          contentType: a.contentType,
        }))
        results.push({
          uid: msg.uid,
          subject: msg.envelope?.subject ?? null,
          from: firstAddr(parsed.from),
          to: firstAddr(parsed.to),
          date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
          attachments,
        })
      }
      return results.reverse()
    } finally {
      lock.release()
    }
  })
}

async function imapDownloadAttachments(
  account: MailAccount,
  uid: number,
): Promise<MailAttachmentBody[]> {
  return withImap(account, async (client) => {
    const lock = await client.getMailboxLock(account.mailbox)
    try {
      const msg = await client.fetchOne(String(uid), { uid: true, source: true })
      if (!msg || !msg.source) return []
      const parsed = await simpleParser(msg.source)
      return parsed.attachments.map((att) => {
        const content = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content)
        return {
          filename: att.filename ?? "attachment.bin",
          contentType: att.contentType,
          content,
          size: att.size,
          checksum: att.checksum ?? sha256(content),
        }
      })
    } finally {
      lock.release()
    }
  })
}

async function imapTestConnection(account: MailAccount): Promise<{ ok: true; mailboxExists: number }> {
  return withImap(account, async (client) => {
    const lock = await client.getMailboxLock(account.mailbox)
    try {
      const mb = client.mailbox
      const exists = mb && typeof mb === "object" ? mb.exists : 0
      return { ok: true as const, mailboxExists: exists }
    } finally {
      lock.release()
    }
  })
}

// ---------- POP3 ----------

type Pop3Client = {
  connect: () => Promise<void>
  command: (cmd: string, ...args: string[]) => Promise<[string, string]>
  multiline: (cmd: string, ...args: string[]) => Promise<[string, string]>
  RETR: (msgNum: number) => Promise<string>
  QUIT: () => Promise<void>
}

function createPop3(account: MailAccount): Pop3Client {
  const Ctor = Pop3Command as unknown as new (opts: {
    host: string
    port: number
    tls: boolean
    user: string
    password: string
  }) => Pop3Client
  return new Ctor({
    host: account.host,
    port: account.port,
    tls: account.secure,
    user: account.user,
    password: account.password,
  })
}

async function pop3Count(account: MailAccount): Promise<number> {
  const client = createPop3(account)
  await client.connect()
  try {
    const [status] = await client.command("STAT")
    const count = Number.parseInt(status.trim().split(/\s+/)[0] ?? "0", 10)
    return Number.isFinite(count) ? count : 0
  } finally {
    await client.QUIT().catch(() => undefined)
  }
}

async function pop3ListMessages(account: MailAccount, limit: number): Promise<MailMessageSummary[]> {
  const client = createPop3(account)
  await client.connect()
  try {
    const [stat] = await client.command("STAT")
    const total = Number.parseInt(stat.trim().split(/\s+/)[0] ?? "0", 10)
    if (!Number.isFinite(total) || total <= 0) return []
    const start = Math.max(1, total - limit + 1)
    const results: MailMessageSummary[] = []
    for (let i = total; i >= start; i--) {
      const raw = await client.RETR(i)
      const parsed = await simpleParser(Buffer.from(raw, "utf8"))
      results.push({
        uid: i,
        subject: parsed.subject ?? null,
        from: firstAddr(parsed.from),
        to: firstAddr(parsed.to),
        date: parsed.date ? parsed.date.toISOString() : null,
        attachments: parsed.attachments.map((a) => ({
          filename: a.filename ?? "attachment.bin",
          size: a.size,
          contentType: a.contentType,
        })),
      })
    }
    return results
  } finally {
    await client.QUIT().catch(() => undefined)
  }
}

async function pop3DownloadAttachments(
  account: MailAccount,
  msgNum: number,
): Promise<MailAttachmentBody[]> {
  const client = createPop3(account)
  await client.connect()
  try {
    const raw = await client.RETR(msgNum)
    const parsed = await simpleParser(Buffer.from(raw, "utf8"))
    return parsed.attachments.map((att) => {
      const content = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content)
      return {
        filename: att.filename ?? "attachment.bin",
        contentType: att.contentType,
        content,
        size: att.size,
        checksum: att.checksum ?? sha256(content),
      }
    })
  } finally {
    await client.QUIT().catch(() => undefined)
  }
}

// ---------- Public API ----------

export async function testConnection(account: MailAccount): Promise<{ ok: true; count: number }> {
  if (account.protocol === "imap") {
    const r = await imapTestConnection(account)
    return { ok: true, count: r.mailboxExists }
  }
  const count = await pop3Count(account)
  return { ok: true, count }
}

export async function listMessages(account: MailAccount, limit = 25): Promise<MailMessageSummary[]> {
  const bounded = Math.max(1, Math.min(200, limit))
  return account.protocol === "imap"
    ? imapListMessages(account, bounded)
    : pop3ListMessages(account, bounded)
}

export async function downloadAttachments(
  account: MailAccount,
  messageUid: number,
): Promise<MailAttachmentBody[]> {
  return account.protocol === "imap"
    ? imapDownloadAttachments(account, messageUid)
    : pop3DownloadAttachments(account, messageUid)
}
