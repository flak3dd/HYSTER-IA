import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { ServerConfig } from "@/lib/db/schema"
import { getServerConfig, patchServerConfig, setServerConfig } from "@/lib/db/server-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const cfg = await getServerConfig()
    if (!cfg) return NextResponse.json({ config: null })
    return NextResponse.json({ config: cfg })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json().catch(() => null)
    const parsed = ServerConfig.safeParse({ ...body, updatedAt: Date.now() })
    if (!parsed.success) {
      return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 })
    }
    const cfg = await setServerConfig(parsed.data)
    return NextResponse.json({ config: cfg })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = (await req.json().catch(() => null)) as Partial<ServerConfig> | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "bad_request" }, { status: 400 })
    }
    const cfg = await patchServerConfig(body)
    if (!cfg) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json({ config: cfg })
  } catch (err) {
    return toErrorResponse(err)
  }
}
