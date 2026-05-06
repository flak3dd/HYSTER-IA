import { prisma } from "@/lib/db"
import type { Credential as CredentialModel } from "@prisma/client"
import { Credential, CredentialCreate } from "@/lib/db/schema"

function toCredentialZod(row: CredentialModel & { sourceHost?: { hostname: string } | null }): Credential {
  return {
    id: row.id,
    type: row.type as Credential["type"],
    username: row.username,
    domain: row.domain ?? undefined,
    hash: row.hash ?? undefined,
    plaintext: row.password ?? undefined, // Map password field to plaintext
    ticketData: undefined, // Not available in Credential model
    sourceHostId: row.sourceHostId ?? undefined,
    sourceHostname: row.sourceHost?.hostname ?? undefined,
    cracked: false, // Not available in Credential model
    notes: undefined, // Not available in Credential model
    createdAt: row.createdAt.getTime(),
  }
}

export async function listCredentials(opts?: {
  skip?: number
  take?: number
  type?: Credential["type"]
  domain?: string
  search?: string
  sourceHostId?: string
}): Promise<Credential[]> {
  const where: any = {}
  
  if (opts?.type) {
    where.type = opts.type
  }
  
  if (opts?.domain) {
    where.domain = opts.domain
  }
  
  if (opts?.sourceHostId) {
    where.sourceHostId = opts.sourceHostId
  }
  
  if (opts?.search) {
    where.OR = [
      { username: { contains: opts.search, mode: "insensitive" } },
      { domain: { contains: opts.search, mode: "insensitive" } },
      { notes: { contains: opts.search, mode: "insensitive" } },
    ]
  }
  
  const rows = await prisma.credential.findMany({
    where,
    include: {
      sourceHost: {
        select: { hostname: true },
      },
    },
    orderBy: { createdAt: "desc" },
    skip: opts?.skip,
    take: opts?.take,
  })
  return rows.map(toCredentialZod)
}

export async function countCredentials(opts?: {
  type?: Credential["type"]
  domain?: string
  search?: string
  sourceHostId?: string
}): Promise<number> {
  const where: any = {}
  
  if (opts?.type) {
    where.type = opts.type
  }
  
  if (opts?.domain) {
    where.domain = opts.domain
  }
  
  if (opts?.sourceHostId) {
    where.sourceHostId = opts.sourceHostId
  }
  
  if (opts?.search) {
    where.OR = [
      { username: { contains: opts.search, mode: "insensitive" } },
      { domain: { contains: opts.search, mode: "insensitive" } },
      { notes: { contains: opts.search, mode: "insensitive" } },
    ]
  }
  
  return prisma.credential.count({ where })
}

export async function getCredentialById(id: string): Promise<Credential | null> {
  const row = await prisma.credential.findUnique({
    where: { id },
    include: {
      sourceHost: {
        select: { hostname: true },
      },
    },
  })
  return row ? toCredentialZod(row) : null
}

export async function createCredential(input: CredentialCreate): Promise<Credential> {
  const parsed = CredentialCreate.parse(input)
  const row = await prisma.credential.create({
    data: {
      type: parsed.type ?? "Plaintext",
      username: parsed.username ?? "unknown",
      domain: parsed.domain,
      hash: parsed.hash,
      password: parsed.plaintext, // Map plaintext to password field
      sourceHostId: parsed.sourceHostId,
      // Note: ticketData, notes, cracked not in Credential model
    },
    include: {
      sourceHost: {
        select: { hostname: true },
      },
    },
  })
  return toCredentialZod(row)
}

export async function deleteCredential(id: string): Promise<boolean> {
  try {
    await prisma.credential.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function getCredentialsBySourceHost(hostId: string): Promise<Credential[]> {
  const rows = await prisma.credential.findMany({
    where: { sourceHostId: hostId },
    include: {
      sourceHost: {
        select: { hostname: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })
  return rows.map(toCredentialZod)
}

export async function getCredentialStats(): Promise<{
  total: number
  byType: Record<string, number>
  cracked: number
  uniqueDomains: number
}> {
  const [total, credentials] = await Promise.all([
    prisma.credential.count(),
    prisma.credential.findMany(),
  ])
  
  const byType: Record<string, number> = {}
  let cracked = 0
  const domains = new Set<string>()
  
  for (const cred of credentials) {
    byType[cred.type] = (byType[cred.type] || 0) + 1
    // Note: cracked field not available in Credential model
    if (cred.domain) domains.add(cred.domain)
  }
  
  return {
    total,
    byType,
    cracked,
    uniqueDomains: domains.size,
  }
}