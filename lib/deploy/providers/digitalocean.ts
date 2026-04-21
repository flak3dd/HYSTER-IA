import type { VpsProviderClient, VpsCreateResult, ProviderPreset } from "../types"

const API = "https://api.digitalocean.com/v2"

function headers(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  }
}

export function digitalOceanClient(apiKey: string): VpsProviderClient {
  return {
    name: "digitalocean",

    presets(): ProviderPreset {
      return {
        id: "digitalocean",
        label: "DigitalOcean",
        regions: [
          { id: "nyc1", label: "New York 1" },
          { id: "nyc3", label: "New York 3" },
          { id: "sfo3", label: "San Francisco 3" },
          { id: "ams3", label: "Amsterdam 3" },
          { id: "sgp1", label: "Singapore 1" },
          { id: "lon1", label: "London 1" },
          { id: "fra1", label: "Frankfurt 1" },
          { id: "blr1", label: "Bangalore 1" },
          { id: "syd1", label: "Sydney 1" },
        ],
        sizes: [
          { id: "s-1vcpu-1gb", label: "Basic 1 vCPU", cpu: 1, ram: "1 GB", disk: "25 GB", price: "$6/mo" },
          { id: "s-1vcpu-2gb", label: "Basic 1 vCPU", cpu: 1, ram: "2 GB", disk: "50 GB", price: "$12/mo" },
          { id: "s-2vcpu-4gb", label: "Basic 2 vCPU", cpu: 2, ram: "4 GB", disk: "80 GB", price: "$24/mo" },
          { id: "s-4vcpu-8gb", label: "Basic 4 vCPU", cpu: 4, ram: "8 GB", disk: "160 GB", price: "$48/mo" },
        ],
      }
    },

    async createServer(opts): Promise<VpsCreateResult> {
      const sshRes = await fetch(`${API}/account/keys`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({
          name: `hysteria-deploy-${Date.now()}`,
          public_key: opts.sshKeyContent,
        }),
      })
      if (!sshRes.ok) {
        const body = await sshRes.text()
        throw new Error(`DO SSH key upload failed (${sshRes.status}): ${body.slice(0, 300)}`)
      }
      const sshData = (await sshRes.json()) as { ssh_key: { id: number } }

      const res = await fetch(`${API}/droplets`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({
          name: opts.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 63),
          region: opts.region,
          size: opts.size,
          image: "ubuntu-24-04-x64",
          ssh_keys: [sshData.ssh_key.id],
          backups: false,
          ipv6: true,
          monitoring: true,
        }),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`DO droplet create failed (${res.status}): ${body.slice(0, 300)}`)
      }
      const data = (await res.json()) as { droplet: { id: number } }
      return { vpsId: String(data.droplet.id), ip: null }
    },

    async waitForIp(vpsId, timeoutMs = 180_000): Promise<string> {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const res = await fetch(`${API}/droplets/${vpsId}`, { headers: headers(apiKey) })
        if (res.ok) {
          const data = (await res.json()) as {
            droplet: {
              status: string
              networks?: { v4?: { ip_address: string; type: string }[] }
            }
          }
          if (data.droplet.status === "active") {
            const pub = data.droplet.networks?.v4?.find((n) => n.type === "public")
            if (pub) return pub.ip_address
          }
        }
        await new Promise((r) => setTimeout(r, 5000))
      }
      throw new Error("Timed out waiting for DigitalOcean droplet IP")
    },

    async destroyServer(vpsId): Promise<void> {
      const res = await fetch(`${API}/droplets/${vpsId}`, {
        method: "DELETE",
        headers: headers(apiKey),
      })
      if (!res.ok && res.status !== 404) {
        const body = await res.text()
        throw new Error(`DO destroy failed (${res.status}): ${body.slice(0, 300)}`)
      }
    },
  }
}
