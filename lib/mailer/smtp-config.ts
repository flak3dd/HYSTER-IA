import { prisma } from "@/lib/db"
import { z } from "zod"
import logger from "@/lib/logger"
import { testSmtpConnection } from "@/lib/mail/sender"
import type { SmtpConfig as SmtpConfigType } from "@/lib/mail/types"

const log = logger.child({ module: "smtp-config" })

/* ------------------------------------------------------------------ */
/*  Schemas                                                           */
/* ------------------------------------------------------------------ */

export const SmtpConfigInput = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  username: z.string().max(255).optional(),
  password: z.string().max(255).optional(),
  fromEmail: z.string().email(),
  fromName: z.string().max(255).optional(),
  isDefault: z.boolean().default(false),
  enabled: z.boolean().default(true),
})
export type SmtpConfigInput = z.infer<typeof SmtpConfigInput>

export const SmtpConfigUpdate = SmtpConfigInput.partial()
export type SmtpConfigUpdate = z.infer<typeof SmtpConfigUpdate>

/* ------------------------------------------------------------------ */
/*  CRUD Operations                                                   */
/* ------------------------------------------------------------------ */

export async function listSmtpConfigs(): Promise<
  Array<{
    id: string
    name: string
    host: string
    port: number
    secure: boolean
    username: string | null
    fromEmail: string
    fromName: string | null
    isDefault: boolean
    enabled: boolean
    createdAt: Date
    updatedAt: Date
  }>
> {
  const configs = await prisma.smtpConfig.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      host: true,
      port: true,
      secure: true,
      username: true,
      fromEmail: true,
      fromName: true,
      isDefault: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return configs
}

export async function getSmtpConfigById(id: string) {
  return prisma.smtpConfig.findUnique({
    where: { id },
  })
}

export async function getDefaultSmtpConfig() {
  return prisma.smtpConfig.findFirst({
    where: { isDefault: true, enabled: true },
  })
}

export async function createSmtpConfig(input: SmtpConfigInput) {
  const validated = SmtpConfigInput.parse(input)

  if (validated.isDefault) {
    // Unset any existing default
    await prisma.smtpConfig.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    })
  }

  const config = await prisma.smtpConfig.create({
    data: validated,
  })

  log.info({ configId: config.id, name: config.name }, "SMTP config created")
  return config
}

export async function updateSmtpConfig(id: string, input: SmtpConfigUpdate) {
  const validated = SmtpConfigUpdate.parse(input)

  const existing = await prisma.smtpConfig.findUnique({ where: { id } })
  if (!existing) {
    throw new Error("SMTP config not found")
  }

  if (validated.isDefault) {
    await prisma.smtpConfig.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    })
  }

  const config = await prisma.smtpConfig.update({
    where: { id },
    data: validated,
  })

  log.info({ configId: config.id }, "SMTP config updated")
  return config
}

export async function deleteSmtpConfig(id: string) {
  const existing = await prisma.smtpConfig.findUnique({ where: { id } })
  if (!existing) {
    throw new Error("SMTP config not found")
  }

  await prisma.smtpConfig.delete({ where: { id } })
  log.info({ configId: id }, "SMTP config deleted")
}

/* ------------------------------------------------------------------ */
/*  Test Connection                                                   */
/* ------------------------------------------------------------------ */

export async function testSmtpConfigById(
  id: string
): Promise<{ ok: boolean; greeting?: string; error?: string }> {
  const config = await prisma.smtpConfig.findUnique({ where: { id } })
  if (!config) {
    return { ok: false, error: "SMTP config not found" }
  }

  try {
    const result = await testSmtpConnection({
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.username || "",
      password: config.password || "",
      from: config.fromEmail,
    })
    return { ok: true, greeting: result.greeting }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Connection failed"
    log.warn({ configId: id, error }, "SMTP test connection failed")
    return { ok: false, error }
  }
}

/* ------------------------------------------------------------------ */
/*  Resolve config for sending (by ID or fallback to default/env)     */
/* ------------------------------------------------------------------ */

export async function resolveSmtpConfig(
  configId?: string
): Promise<SmtpConfigType | null> {
  if (configId) {
    const config = await prisma.smtpConfig.findUnique({
      where: { id: configId },
    })
    if (config) {
      return {
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.username || "",
        password: config.password || "",
        from: config.fromEmail,
      }
    }
  }

  const defaultConfig = await getDefaultSmtpConfig()
  if (defaultConfig) {
    return {
      host: defaultConfig.host,
      port: defaultConfig.port,
      secure: defaultConfig.secure,
      user: defaultConfig.username || "",
      password: defaultConfig.password || "",
      from: defaultConfig.fromEmail,
    }
  }

  // Fallback to env vars
  const host = process.env.SMTP_HOST
  if (!host) return null

  return {
    host,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "",
  }
}
