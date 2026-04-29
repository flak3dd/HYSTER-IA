import type { VpsProvider, VpsProviderClient, ProviderPreset } from "../types"
import { loadProviderKeys, type ProviderKeys } from "../provider-keys"
import { hetznerClient } from "./hetzner"
import { digitalOceanClient } from "./digitalocean"
import { vultrClient } from "./vultr"
import { lightsailClient } from "./lightsail"
import { azureClient } from "./azure"

/** Cached stored keys — refreshed each call to resolveProvider */
let _cachedKeys: ProviderKeys | null = null
let _cachedAt = 0
const CACHE_TTL = 10_000 // 10 seconds

async function getStoredKeys(): Promise<ProviderKeys> {
  if (_cachedKeys && Date.now() - _cachedAt < CACHE_TTL) return _cachedKeys
  _cachedKeys = await loadProviderKeys()
  _cachedAt = Date.now()
  return _cachedKeys
}

/** Pick the first truthy value: stored key > env var */
function pick(stored: ProviderKeys, storedKey: keyof ProviderKeys, envKey: string): string | undefined {
  return stored[storedKey] || process.env[envKey] || undefined
}

export async function resolveProviderAsync(provider: VpsProvider): Promise<VpsProviderClient> {
  const stored = await getStoredKeys()
  return resolveProviderWithKeys(provider, stored)
}

export function resolveProvider(provider: VpsProvider): VpsProviderClient {
  // Synchronous version — uses cached stored keys if available, otherwise env only
  return resolveProviderWithKeys(provider, _cachedKeys ?? {})
}

function resolveProviderWithKeys(provider: VpsProvider, stored: ProviderKeys): VpsProviderClient {
  switch (provider) {
    case "hetzner": {
      const key = pick(stored, "hetzner", "HETZNER_API_KEY")
      if (!key) throw new Error("HETZNER_API_KEY is not set. Add it in Settings > Provider Keys or .env")
      return hetznerClient(key)
    }
    case "digitalocean": {
      const key = pick(stored, "digitalocean", "DIGITALOCEAN_API_KEY")
      if (!key) throw new Error("DIGITALOCEAN_API_KEY is not set. Add it in Settings > Provider Keys or .env")
      return digitalOceanClient(key)
    }
    case "vultr": {
      const key = pick(stored, "vultr", "VULTR_API_KEY")
      if (!key) throw new Error("VULTR_API_KEY is not set. Add it in Settings > Provider Keys or .env")
      return vultrClient(key)
    }
    case "lightsail": {
      const ak = pick(stored, "aws_access_key_id", "AWS_ACCESS_KEY_ID")
      const sk = pick(stored, "aws_secret_access_key", "AWS_SECRET_ACCESS_KEY")
      const region = pick(stored, "aws_region", "AWS_DEFAULT_REGION") ?? "us-east-1"
      if (!ak || !sk) throw new Error("AWS credentials are not set. Add them in Settings > Provider Keys or .env")
      return lightsailClient(ak, sk, region)
    }
    case "azure": {
      const subscriptionId = pick(stored, "azure_subscription_id", "AZURE_SUBSCRIPTION_ID")
      const tenantId = pick(stored, "azure_tenant_id", "AZURE_TENANT_ID")
      const clientId = pick(stored, "azure_client_id", "AZURE_CLIENT_ID")
      const clientSecret = pick(stored, "azure_client_secret", "AZURE_CLIENT_SECRET")
      if (!subscriptionId || !tenantId || !clientId || !clientSecret) {
        throw new Error("Azure credentials are not set. Add them in Settings > Provider Keys or .env")
      }
      return azureClient({ subscriptionId, tenantId, clientId, clientSecret })
    }
  }
}

export async function allPresetsAsync(): Promise<ProviderPreset[]> {
  const stored = await getStoredKeys()
  return allPresetsWithKeys(stored)
}

export function allPresets(): ProviderPreset[] {
  return allPresetsWithKeys(_cachedKeys ?? {})
}

function allPresetsWithKeys(stored: ProviderKeys): ProviderPreset[] {
  const providers: { provider: VpsProvider; envKey: string; storedKey: keyof ProviderKeys }[] = [
    { provider: "hetzner", envKey: "HETZNER_API_KEY", storedKey: "hetzner" },
    { provider: "digitalocean", envKey: "DIGITALOCEAN_API_KEY", storedKey: "digitalocean" },
    { provider: "vultr", envKey: "VULTR_API_KEY", storedKey: "vultr" },
    { provider: "lightsail", envKey: "AWS_ACCESS_KEY_ID", storedKey: "aws_access_key_id" },
    { provider: "azure", envKey: "AZURE_SUBSCRIPTION_ID", storedKey: "azure_subscription_id" },
  ]
  const results: ProviderPreset[] = []
  for (const p of providers) {
    const hasKey = !!(stored[p.storedKey] || process.env[p.envKey])
    try {
      const client = resolveProviderWithKeys(p.provider, stored)
      const preset = client.presets()
      results.push({ ...preset, id: `${preset.id}${hasKey ? "" : " (no key)"}` })
    } catch {
      // provider not configured, include preset with marker
      const stub = getStubPreset(p.provider)
      if (stub) results.push({ ...stub, id: `${stub.id} (no key)` })
    }
  }
  return results
}

function getStubPreset(provider: VpsProvider): ProviderPreset | null {
  switch (provider) {
    case "hetzner":
      return hetznerClient("stub").presets()
    case "digitalocean":
      return digitalOceanClient("stub").presets()
    case "vultr":
      return vultrClient("stub").presets()
    case "lightsail":
      return lightsailClient("stub", "stub", "us-east-1").presets()
    case "azure":
      return azureClient({ subscriptionId: "stub", tenantId: "stub", clientId: "stub", clientSecret: "stub" }).presets()
  }
}
