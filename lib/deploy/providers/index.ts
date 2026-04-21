import type { VpsProvider, VpsProviderClient, ProviderPreset } from "../types"
import { hetznerClient } from "./hetzner"
import { digitalOceanClient } from "./digitalocean"
import { vultrClient } from "./vultr"
import { lightsailClient } from "./lightsail"

export function resolveProvider(provider: VpsProvider): VpsProviderClient {
  switch (provider) {
    case "hetzner": {
      const key = process.env.HETZNER_API_KEY
      if (!key) throw new Error("HETZNER_API_KEY is not set")
      return hetznerClient(key)
    }
    case "digitalocean": {
      const key = process.env.DIGITALOCEAN_API_KEY
      if (!key) throw new Error("DIGITALOCEAN_API_KEY is not set")
      return digitalOceanClient(key)
    }
    case "vultr": {
      const key = process.env.VULTR_API_KEY
      if (!key) throw new Error("VULTR_API_KEY is not set")
      return vultrClient(key)
    }
    case "lightsail": {
      const ak = process.env.AWS_ACCESS_KEY_ID
      const sk = process.env.AWS_SECRET_ACCESS_KEY
      const region = process.env.AWS_DEFAULT_REGION ?? "us-east-1"
      if (!ak || !sk) throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are not set")
      return lightsailClient(ak, sk, region)
    }
  }
}

export function allPresets(): ProviderPreset[] {
  const providers: { provider: VpsProvider; envKey: string }[] = [
    { provider: "hetzner", envKey: "HETZNER_API_KEY" },
    { provider: "digitalocean", envKey: "DIGITALOCEAN_API_KEY" },
    { provider: "vultr", envKey: "VULTR_API_KEY" },
    { provider: "lightsail", envKey: "AWS_ACCESS_KEY_ID" },
  ]
  const results: ProviderPreset[] = []
  for (const p of providers) {
    try {
      const client = resolveProvider(p.provider)
      const preset = client.presets()
      results.push({ ...preset, id: `${preset.id}${process.env[p.envKey] ? "" : " (no key)"}` })
    } catch {
      // provider not configured, include preset with marker
      const stub = getStubPreset(p.provider)
      if (stub) results.push(stub)
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
  }
}
