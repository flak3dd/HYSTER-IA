import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { getServerConfig } from "@/lib/db/server-config"
import { auditServerConfig } from "@/lib/config-audit/analyzer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const cfg = await getServerConfig()
    if (!cfg) {
      return NextResponse.json(
        { error: "no_config", message: "No server configuration found. Configure the server first." },
        { status: 404 },
      )
    }
    const result = auditServerConfig(cfg)
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
