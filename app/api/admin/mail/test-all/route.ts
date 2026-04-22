import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { runAllAccountTests } from "@/lib/mail/auto-test"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const results = await runAllAccountTests()
    return NextResponse.json({ results })
  } catch (err) {
    return toErrorResponse(err)
  }
}
