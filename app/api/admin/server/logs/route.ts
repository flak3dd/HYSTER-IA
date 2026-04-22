import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { getLogs } from "@/lib/hysteria/manager"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const tailParam = new URL(req.url).searchParams.get("tail")
    const tail = tailParam ? Math.max(1, Math.min(1000, Number.parseInt(tailParam, 10) || 200)) : 200
    return NextResponse.json({ logs: getLogs(tail) })
  } catch (err) {
    return toErrorResponse(err)
  }
}
