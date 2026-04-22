import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { allPresets } from "@/lib/deploy/providers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const presets = allPresets()
    return NextResponse.json({ presets })
  } catch (err) {
    return toErrorResponse(err)
  }
}
