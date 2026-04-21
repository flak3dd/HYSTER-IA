import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { serverEnv } from "@/lib/env"
import { incrementUsage } from "@/lib/db/users"
import { recordUsage } from "@/lib/db/usage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TrafficPushSchema = z.record(
  z.string().min(1),
  z.object({ tx: z.number().int().nonnegative(), rx: z.number().int().nonnegative() }),
)

function sharedSecretOk(req: NextRequest): boolean {
  const expected = serverEnv().HYSTERIA_AUTH_BACKEND_SECRET
  if (!expected) return true
  const header = req.headers.get("x-auth-secret")
  return header === expected
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!sharedSecretOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const json = await req.json().catch(() => null)
  const parsed = TrafficPushSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 })
  }

  const now = Date.now()
  const nodeId = serverEnv().NODE_ID
  const records = Object.entries(parsed.data).map(([userId, stats]) => ({
    userId,
    nodeId,
    tx: stats.tx,
    rx: stats.rx,
    capturedAt: now,
  }))

  await recordUsage(records)
  await Promise.all(records.map((r) => incrementUsage(r.userId, r.tx, r.rx)))

  return NextResponse.json({ ok: true, accepted: records.length })
}
