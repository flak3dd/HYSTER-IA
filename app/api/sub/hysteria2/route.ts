import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SubscriptionRequestSchema = z.object({
  token: z.string(),
  implant: z.string().optional(),
})

// In-memory storage for demo purposes
const implants = new Map<string, {
  id: string
  token: string
  servers: string[]
  password: string
  sni: string
  obfs: string
  masquerade: string
  crypto_key: string
  interval: number
  jitter: number
  created_at: number
  last_seen: number
}>()

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')
    const isImplant = searchParams.get('implant') === 'true'

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 })
    }

    // Validate token (in production, this would be database lookup)
    if (token !== "dpanel-implant-bootstrap-token-change-this" && !implants.has(token)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Generate or retrieve implant configuration
    let implantConfig
    if (isImplant) {
      const implantId = `implant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      
      implantConfig = {
        implant_id: implantId,
        servers: [
          "ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com:443",
          "ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com:8080"
        ],
        password: "your-hysteria-password-change-this",
        sni: "cloudflare.com",
        obfs: "salamander",
        masquerade: "https://cloudflare.com",
        crypto_key: "your-32-byte-encryption-key-here",
        interval: 45,
        jitter: 25,
      }

      // Store implant config
      implants.set(implantId, {
        id: implantId,
        token: implantId,
        servers: implantConfig.servers,
        password: implantConfig.password,
        sni: implantConfig.sni,
        obfs: implantConfig.obfs,
        masquerade: implantConfig.masquerade,
        crypto_key: implantConfig.crypto_key,
        interval: implantConfig.interval,
        jitter: implantConfig.jitter,
        created_at: Date.now(),
        last_seen: Date.now(),
      })
    } else {
      // Client configuration
      implantConfig = {
        servers: ["ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com:443"],
        password: "your-hysteria-password-change-this",
        sni: "cloudflare.com",
        obfs: "salamander",
        masquerade: "https://cloudflare.com",
      }
    }

    return NextResponse.json(implantConfig)
  } catch (error) {
    console.error('Subscription error:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}