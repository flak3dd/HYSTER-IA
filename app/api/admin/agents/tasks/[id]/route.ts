import { NextResponse, type NextRequest } from "next/server"
import { verifyAdminCookie } from "@/lib/auth/admin"
import { getTaskRow, listStepRows } from "@/lib/agents/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await verifyAdminCookie()
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401
    return NextResponse.json({ error: "unauthorized" }, { status })
  }
  const { id } = await ctx.params
  const task = await getTaskRow(id)
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const steps = await listStepRows(id)
  return NextResponse.json({ task, steps })
}
