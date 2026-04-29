import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"

/**
 * Simple file-backed store for VPS provider API keys.
 * Keys are stored in config/provider-keys.json (gitignored).
 * This allows setting keys from the UI without editing .env.
 */

const CONFIG_DIR = join(process.cwd(), "config")
const KEYS_FILE = join(CONFIG_DIR, "provider-keys.json")

export type ProviderKeys = {
  hetzner?: string
  digitalocean?: string
  vultr?: string
  aws_access_key_id?: string
  aws_secret_access_key?: string
  aws_region?: string
  azure_subscription_id?: string
  azure_tenant_id?: string
  azure_client_id?: string
  azure_client_secret?: string
}

const PROVIDER_KEY_NAMES: (keyof ProviderKeys)[] = [
  "hetzner",
  "digitalocean",
  "vultr",
  "aws_access_key_id",
  "aws_secret_access_key",
  "aws_region",
  "azure_subscription_id",
  "azure_tenant_id",
  "azure_client_id",
  "azure_client_secret",
]

export async function loadProviderKeys(): Promise<ProviderKeys> {
  try {
    const raw = await readFile(KEYS_FILE, "utf8")
    const parsed = JSON.parse(raw)
    // Only return known keys
    const result: ProviderKeys = {}
    for (const key of PROVIDER_KEY_NAMES) {
      if (typeof parsed[key] === "string" && parsed[key]) {
        result[key] = parsed[key]
      }
    }
    return result
  } catch {
    return {}
  }
}

export async function saveProviderKeys(keys: ProviderKeys): Promise<ProviderKeys> {
  // Merge with existing keys so partial updates work
  const existing = await loadProviderKeys()
  const merged: ProviderKeys = { ...existing }

  for (const key of PROVIDER_KEY_NAMES) {
    if (key in keys) {
      const val = keys[key]
      if (val === "" || val === undefined) {
        delete merged[key]
      } else {
        merged[key] = val
      }
    }
  }

  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(KEYS_FILE, JSON.stringify(merged, null, 2) + "\n", "utf8")
  return merged
}

/** Return keys with secrets masked for safe display */
export function maskProviderKeys(keys: ProviderKeys): ProviderKeys {
  const masked: ProviderKeys = {}
  for (const key of PROVIDER_KEY_NAMES) {
    const val = keys[key]
    if (!val) continue
    if (key === "aws_region") {
      masked[key] = val
    } else if (val.length <= 8) {
      masked[key] = "***"
    } else {
      masked[key] = val.slice(0, 4) + "***" + val.slice(-4)
    }
  }
  return masked
}

/**
 * Resolve a provider key: checks stored config first, then env var.
 * Call this from resolveProvider() instead of reading env directly.
 */
export async function resolveProviderKey(
  stored: ProviderKeys,
  storedKey: keyof ProviderKeys,
  envKey: string,
): Promise<string | undefined> {
  return stored[storedKey] || process.env[envKey] || undefined
}
