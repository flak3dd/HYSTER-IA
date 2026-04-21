import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { fetchOnline } from "@/lib/hysteria/traffic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const online = await fetchOnline()
    return NextResponse.json({ online })
  } catch (err) {
    return toErrorResponse(err)
  }
}
