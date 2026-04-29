import { z } from "zod"
import { prisma } from "@/lib/db"
import type { Profile as PrismaProfile } from "@prisma/client"

export const ProfileType = z.enum([
  "basic_tls_proxy",
  "socks5_relay",
  "high_throughput",
  "tun_overlay",
  "custom",
])
export type ProfileType = z.infer<typeof ProfileType>

export const PROFILE_TYPE_LABELS: Record<ProfileType, string> = {
  basic_tls_proxy: "Basic TLS Proxy",
  socks5_relay: "SOCKS5 Relay",
  high_throughput: "High-Throughput",
  tun_overlay: "TUN Overlay",
  custom: "Custom",
}

export const ProfileConfigOverrides = z.object({
  port: z.coerce.number().int().min(1).max(65535).optional(),
  obfsType: z.enum(["none", "salamander"]).optional(),
  obfsPassword: z.string().min(8).optional(),
  bandwidthUp: z.string().optional(),
  bandwidthDown: z.string().optional(),
  masqueradeUrl: z.string().url().optional(),
  tlsMode: z.enum(["acme", "self-signed", "manual"]).optional(),
  acmeDomains: z.array(z.string()).optional(),
  acmeEmail: z.string().email().optional(),
  lazyStart: z.boolean().optional(),
  socksListen: z.string().optional(),
  tunEnabled: z.boolean().optional(),
  tunMtu: z.coerce.number().int().min(1280).max(65535).optional(),
})
export type ProfileConfigOverrides = z.infer<typeof ProfileConfigOverrides>

export const Profile = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  type: ProfileType,
  description: z.string().max(500).default(""),
  nodeIds: z.array(z.string()).default([]),
  config: ProfileConfigOverrides.default({}),
  tags: z.array(z.string().max(40)).default([]),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type Profile = z.infer<typeof Profile>

export const ProfileCreate = Profile.pick({
  name: true,
  type: true,
  description: true,
  nodeIds: true,
  config: true,
  tags: true,
}).partial({ description: true, nodeIds: true, config: true, tags: true })
export type ProfileCreate = z.infer<typeof ProfileCreate>

export const ProfileUpdate = ProfileCreate.partial()
export type ProfileUpdate = z.infer<typeof ProfileUpdate>

function toProfileZod(row: PrismaProfile): Profile {
  return Profile.parse({
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    nodeIds: JSON.parse(row.nodeIds),
    config: row.config,
    tags: JSON.parse(row.tags),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export async function listProfiles(): Promise<Profile[]> {
  const rows = await prisma.profile.findMany({ orderBy: { createdAt: "desc" } })
  return rows.map(toProfileZod)
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const row = await prisma.profile.findUnique({ where: { id } })
  return row ? toProfileZod(row) : null
}

export async function createProfile(input: ProfileCreate): Promise<Profile> {
  const parsed = ProfileCreate.parse(input)
  const row = await prisma.profile.create({
    data: {
      name: parsed.name,
      type: parsed.type,
      description: parsed.description ?? "",
      nodeIds: JSON.stringify(parsed.nodeIds ?? []),
      config: (parsed.config ?? {}) as object,
      tags: JSON.stringify(parsed.tags ?? []),
    },
  })
  return toProfileZod(row)
}

export async function updateProfile(id: string, patch: ProfileUpdate): Promise<Profile | null> {
  const existing = await prisma.profile.findUnique({ where: { id } })
  if (!existing) return null

  const parsed = ProfileUpdate.parse(patch)
  const data: Record<string, unknown> = {}
  if (parsed.name !== undefined) data.name = parsed.name
  if (parsed.type !== undefined) data.type = parsed.type
  if (parsed.description !== undefined) data.description = parsed.description
  if (parsed.nodeIds !== undefined) data.nodeIds = JSON.stringify(parsed.nodeIds)
  if (parsed.config !== undefined) data.config = parsed.config as object
  if (parsed.tags !== undefined) data.tags = JSON.stringify(parsed.tags)

  const row = await prisma.profile.update({ where: { id }, data })
  return toProfileZod(row)
}

export async function deleteProfile(id: string): Promise<boolean> {
  try {
    await prisma.profile.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

/** Preset configs for each profile type */
export function getProfilePreset(type: ProfileType): ProfileConfigOverrides {
  switch (type) {
    case "basic_tls_proxy":
      return {
        port: 443,
        obfsType: "none",
        tlsMode: "acme",
        masqueradeUrl: "https://www.google.com",
      }
    case "socks5_relay":
      return {
        port: 443,
        obfsType: "salamander",
        tlsMode: "acme",
        socksListen: ":1080",
      }
    case "high_throughput":
      return {
        port: 443,
        obfsType: "none",
        bandwidthUp: "1 gbps",
        bandwidthDown: "1 gbps",
        tlsMode: "acme",
        masqueradeUrl: "https://www.google.com",
      }
    case "tun_overlay":
      return {
        port: 443,
        obfsType: "salamander",
        tlsMode: "acme",
        tunEnabled: true,
        tunMtu: 1400,
      }
    case "custom":
      return { port: 443 }
  }
}

/* ------------------------------------------------------------------ */
/*  Profile config resolver                                            */
/*                                                                     */
/*  Resolves a profile's stored config overrides into the structures   */
/*  consumed by client-config generation and node provisioning.        */
/* ------------------------------------------------------------------ */

export type ResolvedProfileConfig = {
  /** Listen address string (e.g. ":443") */
  listen: string
  /** Obfuscation config — undefined means no obfuscation */
  obfs?: { type: "salamander"; password: string }
  /** Bandwidth hints — undefined means no limit specified */
  bandwidth?: { up?: string; down?: string }
  /** Masquerade proxy URL — undefined means no masquerade */
  masquerade?: { type: "proxy"; proxy: { url: string; rewriteHost: boolean } }
  /** TLS mode from the profile (acme | self-signed | manual) */
  tlsMode: "acme" | "self-signed" | "manual"
  /** ACME domains list (when tlsMode is acme) */
  acmeDomains?: string[]
  /** ACME email (when tlsMode is acme) */
  acmeEmail?: string
  /** Client-side: SOCKS5 listen address */
  socksListen?: string
  /** Client-side: TUN enabled */
  tunEnabled?: boolean
  /** Client-side: TUN MTU */
  tunMtu?: number
  /** Client-side: lazy connect */
  lazyStart?: boolean
}

/**
 * Resolve a profile into a concrete config object.
 *
 * Merges the profile's stored config with its type preset (stored config wins).
 * Generates a random obfs password if salamander is enabled but no password is set.
 */
export function resolveProfileConfig(profile: Profile): ResolvedProfileConfig {
  const preset = getProfilePreset(profile.type as ProfileType)
  const cfg = { ...preset, ...(profile.config as ProfileConfigOverrides) }

  const result: ResolvedProfileConfig = {
    listen: `:${cfg.port ?? 443}`,
    tlsMode: cfg.tlsMode ?? "acme",
  }

  // Obfuscation
  if (cfg.obfsType === "salamander") {
    result.obfs = {
      type: "salamander",
      password: cfg.obfsPassword ?? generateObfsPassword(),
    }
  }

  // Bandwidth
  if (cfg.bandwidthUp || cfg.bandwidthDown) {
    result.bandwidth = {}
    if (cfg.bandwidthUp) result.bandwidth.up = cfg.bandwidthUp
    if (cfg.bandwidthDown) result.bandwidth.down = cfg.bandwidthDown
  }

  // Masquerade
  if (cfg.masqueradeUrl) {
    result.masquerade = {
      type: "proxy",
      proxy: { url: cfg.masqueradeUrl, rewriteHost: true },
    }
  }

  // ACME
  if (cfg.acmeDomains) result.acmeDomains = cfg.acmeDomains
  if (cfg.acmeEmail) result.acmeEmail = cfg.acmeEmail

  // Client-side hints
  if (cfg.socksListen) result.socksListen = cfg.socksListen
  if (cfg.tunEnabled) result.tunEnabled = cfg.tunEnabled
  if (cfg.tunMtu) result.tunMtu = cfg.tunMtu
  if (cfg.lazyStart) result.lazyStart = cfg.lazyStart

  return result
}

function generateObfsPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let pw = ""
  for (let i = 0; i < 24; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)]
  }
  return pw
}
