import { readFile } from "node:fs/promises"
import { z } from "zod"
import { MailAccount, type SafeMailAccount } from "@/lib/mail/types"

const ACCOUNTS_FILE_ENV = "MAIL_ACCOUNTS_FILE"
const ACCOUNTS_INLINE_ENV = "MAIL_ACCOUNTS_JSON"

const AccountsArray = z.array(MailAccount).max(50)

let cached: MailAccount[] | null = null

async function loadFromFile(path: string): Promise<MailAccount[]> {
  const raw = await readFile(path, "utf8")
  const json: unknown = JSON.parse(raw)
  return AccountsArray.parse(json)
}

function loadFromInline(raw: string): MailAccount[] {
  const json: unknown = JSON.parse(raw)
  return AccountsArray.parse(json)
}

export async function loadMailAccounts(): Promise<MailAccount[]> {
  if (cached) return cached

  const filePath = process.env[ACCOUNTS_FILE_ENV]
  const inline = process.env[ACCOUNTS_INLINE_ENV]

  if (filePath) {
    cached = await loadFromFile(filePath)
  } else if (inline) {
    cached = loadFromInline(inline)
  } else {
    cached = []
  }
  return cached
}

export async function getMailAccount(id: string): Promise<MailAccount | null> {
  const accounts = await loadMailAccounts()
  return accounts.find((a) => a.id === id) ?? null
}

export function toSafeAccount(account: MailAccount): SafeMailAccount {
  const { password: _pw, ...safe } = account
  void _pw
  return safe
}

export function clearMailAccountCache(): void {
  cached = null
}
