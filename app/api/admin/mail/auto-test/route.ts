import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  getAutoTestState,
  enableAutoTest,
  disableAutoTest,
  runAllAccountTests,
} from "@/lib/mail/auto-test"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    return NextResponse.json(getAutoTestState())
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = (await req.json()) as {
      action: "enable" | "disable" | "run-now"
      intervalMinutes?: number
    }

    switch (body.action) {
      case "enable": {
        const state = enableAutoTest(body.intervalMinutes)
        return NextResponse.json(state)
      }
      case "disable": {
        const state = disableAutoTest()
        return NextResponse.json(state)
      }
      case "run-now": {
        const results = await runAllAccountTests()
        return NextResponse.json({ ...getAutoTestState(), results })
      }
      default:
        return NextResponse.json({ error: "invalid action" }, { status: 400 })
    }
  } catch (err) {
    return toErrorResponse(err)
  }
}
