import { NextResponse, type NextRequest } from "next/server"
import { verifyAdminCookie } from "@/lib/auth/admin"
import { cancelTask } from "@/lib/agents/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
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
  const ok = cancelTask(id)
  return NextResponse.json({ ok })
}
