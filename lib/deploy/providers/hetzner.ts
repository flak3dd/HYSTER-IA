import type { VpsProviderClient, VpsCreateResult, ProviderPreset } from "../types"

const API = "https://api.hetzner.cloud/v1"

function headers(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  }
}

export function hetznerClient(apiKey: string): VpsProviderClient {
  return {
    name: "hetzner",

    presets(): ProviderPreset {
      return {
        id: "hetzner",
        label: "Hetzner Cloud",
        regions: [
          { id: "nbg1", label: "Nuremberg, DE" },
          { id: "fsn1", label: "Falkenstein, DE" },
          { id: "hel1", label: "Helsinki, FI" },
          { id: "ash", label: "Ashburn, US" },
          { id: "hil", label: "Hillsboro, US" },
          { id: "sin", label: "Singapore" },
        ],
        sizes: [
          { id: "cx22", label: "CX22", cpu: 2, ram: "4 GB", disk: "40 GB", price: "~$4/mo" },
          { id: "cx32", label: "CX32", cpu: 4, ram: "8 GB", disk: "80 GB", price: "~$7/mo" },
          { id: "cx42", label: "CX42", cpu: 8, ram: "16 GB", disk: "160 GB", price: "~$14/mo" },
          { id: "cx52", label: "CX52", cpu: 16, ram: "32 GB", disk: "320 GB", price: "~$29/mo" },
        ],
      }
    },

    async createServer(opts): Promise<VpsCreateResult> {
      const sshKeyRes = await fetch(`${API}/ssh_keys`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({
          name: `hysteria-deploy-${Date.now()}`,
          public_key: opts.sshKeyContent,
        }),
      })
      if (!sshKeyRes.ok) {
        const body = await sshKeyRes.text()
        throw new Error(`Hetzner SSH key upload failed (${sshKeyRes.status}): ${body.slice(0, 300)}`)
      }
      const sshKeyData = (await sshKeyRes.json()) as { ssh_key: { id: number } }
      const sshKeyId = sshKeyData.ssh_key.id

      const res = await fetch(`${API}/servers`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({
          name: opts.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 63),
          server_type: opts.size,
          location: opts.region,
          image: "ubuntu-24.04",
          ssh_keys: [sshKeyId],
          start_after_create: true,
          public_net: { enable_ipv4: true, enable_ipv6: true },
        }),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Hetzner server create failed (${res.status}): ${body.slice(0, 300)}`)
      }
      const data = (await res.json()) as {
        server: { id: number; public_net?: { ipv4?: { ip?: string } } }
      }
      return {
        vpsId: String(data.server.id),
        ip: data.server.public_net?.ipv4?.ip ?? null,
      }
    },

    async waitForIp(vpsId, timeoutMs = 120_000): Promise<string> {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const res = await fetch(`${API}/servers/${vpsId}`, { headers: headers(apiKey) })
        if (res.ok) {
          const data = (await res.json()) as {
            server: { public_net?: { ipv4?: { ip?: string } }; status?: string }
          }
          const ip = data.server.public_net?.ipv4?.ip
          if (ip && data.server.status === "running") return ip
        }
        await new Promise((r) => setTimeout(r, 5000))
      }
      throw new Error("Timed out waiting for Hetzner server IP")
    },

    async destroyServer(vpsId): Promise<void> {
      const res = await fetch(`${API}/servers/${vpsId}`, {
        method: "DELETE",
        headers: headers(apiKey),
      })
      if (!res.ok && res.status !== 404) {
        const body = await res.text()
        throw new Error(`Hetzner destroy failed (${res.status}): ${body.slice(0, 300)}`)
      }
    },
  }
}
