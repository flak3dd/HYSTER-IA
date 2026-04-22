import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { restart } from "@/lib/hysteria/manager"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const status = await restart()
    return NextResponse.json({ status })
  } catch (err) {
    return toErrorResponse(err)
  }
}
