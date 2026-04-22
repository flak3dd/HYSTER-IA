import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { chatComplete } from "@/lib/agents/llm"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SYSTEM_PROMPT = `You are a Hysteria2 server configuration expert. Given a natural language description of desired server settings, generate a valid Hysteria2 server configuration in YAML format.

Key Hysteria2 server config fields:
- listen: address:port (default ":443")
- tls: { cert: path, key: path } OR acme: { domains: [...], email: ... }
- obfs: { type: "salamander", salamander: { password: "..." } }
- bandwidth: { up: "1 gbps", down: "1 gbps" }
- masquerade: { type: "proxy", proxy: { url: "https://example.com", rewriteHost: true } }
- trafficStats: { listen: ":25000", secret: "..." }
- auth: { type: "http", http: { url: "http://panel-url/api/hysteria/auth", insecure: false } }

Rules:
- Always generate strong random passwords for obfs and trafficStats secret (16+ chars)
- Default to port 443 unless specified otherwise
- Include comments explaining each section
- If the user mentions masquerade, suggest appropriate masquerade config
- If bandwidth is mentioned, include bandwidth limits
- Output ONLY valid YAML, no markdown fences, no explanation outside YAML comments`

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json()
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 })
    }

    const result = await chatComplete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    })

    const yaml = result.content ?? ""
    return NextResponse.json({ yaml, model: result.finishReason })
  } catch (err) {
    return toErrorResponse(err)
  }
}
