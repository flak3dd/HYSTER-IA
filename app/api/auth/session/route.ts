import { NextResponse } from "next/server"
import { readSession, revokeCurrentSession } from "@/lib/auth/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<NextResponse> {
  try {
    const principal = await readSession()
    if (!principal) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ principal })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unauthorized"
    return NextResponse.json({ error: message }, { status: 401 })
  }
}

export async function DELETE(): Promise<NextResponse> {
  await revokeCurrentSession()
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: "access_token",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  res.cookies.set({
    name: "refresh_token",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return res
}
