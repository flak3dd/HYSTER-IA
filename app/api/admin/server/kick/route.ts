import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { kickUsers } from "@/lib/hysteria/traffic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KickSchema = z.array(z.string().min(1)).min(1)

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json().catch(() => null)
    const parsed = KickSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 })
    }
    await kickUsers(parsed.data)
    return NextResponse.json({ ok: true, kicked: parsed.data.length })
  } catch (err) {
    return toErrorResponse(err)
  }
}
