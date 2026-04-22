import { NextResponse, type NextRequest } from "next/server"
import { verifyAdminCookie } from "@/lib/auth/admin"
import { createAndStartTask } from "@/lib/agents/runner"
import { listTaskRows } from "@/lib/agents/db"
import { AgentTaskCreateInput } from "@/lib/agents/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<NextResponse> {
  try {
    await verifyAdminCookie()
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401
    return NextResponse.json({ error: "unauthorized" }, { status })
  }
  const tasks = await listTaskRows(100)
  return NextResponse.json({ tasks })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let principal
  try {
    principal = await verifyAdminCookie()
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401
    return NextResponse.json({ error: "unauthorized" }, { status })
  }
  const body = await req.json().catch(() => null)
  const parsed = AgentTaskCreateInput.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const task = createAndStartTask(parsed.data, principal.id)
  return NextResponse.json({ task }, { status: 201 })
}
