import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  loadProviderKeys,
  saveProviderKeys,
  maskProviderKeys,
  type ProviderKeys,
} from "@/lib/deploy/provider-keys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET — return stored provider keys (masked) */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const keys = await loadProviderKeys()
    return NextResponse.json({ keys: maskProviderKeys(keys) })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/** PUT — save provider keys (partial updates supported) */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = (await req.json().catch(() => null)) as ProviderKeys | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "bad_request" }, { status: 400 })
    }
    const saved = await saveProviderKeys(body)
    return NextResponse.json({ keys: maskProviderKeys(saved) })
  } catch (err) {
    return toErrorResponse(err)
  }
}
