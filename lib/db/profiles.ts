import { randomUUID } from "node:crypto"
import { z } from "zod"
import { adminFirestore } from "@/lib/firebase/admin"

const COLLECTION = "profiles"

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

function col() {
  return adminFirestore().collection(COLLECTION)
}

function now(): number {
  return Date.now()
}

export async function listProfiles(): Promise<Profile[]> {
  const snap = await col().orderBy("createdAt", "desc").get()
  return snap.docs.map((d) => Profile.parse({ id: d.id, ...d.data() }))
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const doc = await col().doc(id).get()
  if (!doc.exists) return null
  return Profile.parse({ id: doc.id, ...doc.data() })
}

export async function createProfile(input: ProfileCreate): Promise<Profile> {
  const parsed = ProfileCreate.parse(input)
  const id = randomUUID()
  const record = Profile.parse({
    id,
    ...parsed,
    createdAt: now(),
    updatedAt: now(),
  })
  const { id: _omit, ...rest } = record
  void _omit
  await col().doc(id).set(rest)
  return record
}

export async function updateProfile(id: string, patch: ProfileUpdate): Promise<Profile | null> {
  const parsed = ProfileUpdate.parse(patch)
  const ref = col().doc(id)
  const existing = await ref.get()
  if (!existing.exists) return null
  await ref.update({ ...parsed, updatedAt: now() })
  const updated = await ref.get()
  return Profile.parse({ id: updated.id, ...updated.data() })
}

export async function deleteProfile(id: string): Promise<boolean> {
  const ref = col().doc(id)
  const existing = await ref.get()
  if (!existing.exists) return false
  await ref.delete()
  return true
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
