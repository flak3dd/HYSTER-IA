import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { fetchTraffic } from "@/lib/hysteria/traffic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const clear = new URL(req.url).searchParams.get("clear") === "1"
    const traffic = await fetchTraffic(clear)
    return NextResponse.json({ traffic })
  } catch (err) {
    return toErrorResponse(err)
  }
}
