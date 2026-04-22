import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { serverEnv } from "@/lib/env"
import { createSessionFromIdToken, revokeCurrentSession } from "@/lib/auth/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BodySchema = z.object({ idToken: z.string().min(10) })

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }
  try {
    const { cookieValue, maxAgeSeconds, principal } = await createSessionFromIdToken(
      parsed.data.idToken,
    )
    const env = serverEnv()
    const res = NextResponse.json({ principal })
    res.cookies.set({
      name: env.SESSION_COOKIE_NAME,
      value: cookieValue,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    })
    return res
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401
    const message = err instanceof Error ? err.message : "unauthorized"
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(): Promise<NextResponse> {
  await revokeCurrentSession()
  const env = serverEnv()
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: env.SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return res
}
