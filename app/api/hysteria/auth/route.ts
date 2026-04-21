import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { serverEnv } from "@/lib/env"
import { getUserByAuthToken, updateUser } from "@/lib/db/users"
import type { HysteriaAuthResponse } from "@/lib/hysteria/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const AuthRequestSchema = z.object({
  addr: z.string().min(1),
  auth: z.string().min(1),
  tx: z.number().int().nonnegative(),
})

function sharedSecretOk(req: NextRequest): boolean {
  const expected = serverEnv().HYSTERIA_AUTH_BACKEND_SECRET
  if (!expected) return true
  const header = req.headers.get("x-auth-secret")
  const query = new URL(req.url).searchParams.get("s")
  return header === expected || query === expected
}

function deny(reason: string): NextResponse {
  const body: HysteriaAuthResponse = { ok: false, id: "" }
  return NextResponse.json(body, { status: 200, headers: { "x-deny-reason": reason } })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!sharedSecretOk(req)) return deny("bad_secret")

  const json = await req.json().catch(() => null)
  const parsed = AuthRequestSchema.safeParse(json)
  if (!parsed.success) return deny("bad_request")

  const user = await getUserByAuthToken(parsed.data.auth)
  if (!user) return deny("unknown_token")
  if (user.status !== "active") return deny(`status_${user.status}`)
  if (user.expiresAt != null && user.expiresAt <= Date.now()) {
    await updateUser(user.id, { status: "expired" })
    return deny("expired")
  }
  if (user.quotaBytes != null && user.usedBytes >= user.quotaBytes) {
    return deny("quota_exceeded")
  }

  const body: HysteriaAuthResponse = { ok: true, id: user.id }
  return NextResponse.json(body, { status: 200 })
}
