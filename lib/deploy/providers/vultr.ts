import type { VpsProviderClient, VpsCreateResult, ProviderPreset } from "../types"

const API = "https://api.vultr.com/v2"

function headers(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  }
}

export function vultrClient(apiKey: string): VpsProviderClient {
  return {
    name: "vultr",

    presets(): ProviderPreset {
      return {
        id: "vultr",
        label: "Vultr",
        regions: [
          { id: "ewr", label: "New Jersey" },
          { id: "ord", label: "Chicago" },
          { id: "dfw", label: "Dallas" },
          { id: "lax", label: "Los Angeles" },
          { id: "atl", label: "Atlanta" },
          { id: "sea", label: "Seattle" },
          { id: "ams", label: "Amsterdam" },
          { id: "lhr", label: "London" },
          { id: "fra", label: "Frankfurt" },
          { id: "nrt", label: "Tokyo" },
          { id: "sgp", label: "Singapore" },
          { id: "syd", label: "Sydney" },
        ],
        sizes: [
          { id: "vc2-1c-1gb", label: "1 vCPU", cpu: 1, ram: "1 GB", disk: "25 GB", price: "$5/mo" },
          { id: "vc2-1c-2gb", label: "1 vCPU", cpu: 1, ram: "2 GB", disk: "55 GB", price: "$10/mo" },
          { id: "vc2-2c-4gb", label: "2 vCPU", cpu: 2, ram: "4 GB", disk: "90 GB", price: "$20/mo" },
          { id: "vc2-4c-8gb", label: "4 vCPU", cpu: 4, ram: "8 GB", disk: "180 GB", price: "$40/mo" },
        ],
      }
    },

    async createServer(opts): Promise<VpsCreateResult> {
      const sshRes = await fetch(`${API}/ssh-keys`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({
          name: `hysteria-deploy-${Date.now()}`,
          ssh_key: opts.sshKeyContent,
        }),
      })
      if (!sshRes.ok) {
        const body = await sshRes.text()
        throw new Error(`Vultr SSH key upload failed (${sshRes.status}): ${body.slice(0, 300)}`)
      }
      const sshData = (await sshRes.json()) as { ssh_key: { id: string } }

      const res = await fetch(`${API}/instances`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({
          label: opts.name.slice(0, 63),
          region: opts.region,
          plan: opts.size,
          os_id: 2284, // Ubuntu 24.04
          sshkey_id: [sshData.ssh_key.id],
          backups: "disabled",
          enable_ipv6: true,
        }),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Vultr instance create failed (${res.status}): ${body.slice(0, 300)}`)
      }
      const data = (await res.json()) as { instance: { id: string; main_ip?: string } }
      return {
        vpsId: data.instance.id,
        ip: data.instance.main_ip && data.instance.main_ip !== "0.0.0.0" ? data.instance.main_ip : null,
      }
    },

    async waitForIp(vpsId, timeoutMs = 180_000): Promise<string> {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const res = await fetch(`${API}/instances/${vpsId}`, { headers: headers(apiKey) })
        if (res.ok) {
          const data = (await res.json()) as {
            instance: { status: string; power_status: string; main_ip?: string }
          }
          if (
            data.instance.status === "active" &&
            data.instance.power_status === "running" &&
            data.instance.main_ip &&
            data.instance.main_ip !== "0.0.0.0"
          ) {
            return data.instance.main_ip
          }
        }
        await new Promise((r) => setTimeout(r, 5000))
      }
      throw new Error("Timed out waiting for Vultr instance IP")
    },

    async destroyServer(vpsId): Promise<void> {
      const res = await fetch(`${API}/instances/${vpsId}`, {
        method: "DELETE",
        headers: headers(apiKey),
      })
      if (!res.ok && res.status !== 404) {
        const body = await res.text()
        throw new Error(`Vultr destroy failed (${res.status}): ${body.slice(0, 300)}`)
      }
    },
  }
}
