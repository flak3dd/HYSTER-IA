import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { adminAuth } from "@/lib/firebase/admin"
import { readSession } from "@/lib/auth/session"

export type AdminPrincipal = {
  uid: string
  email: string | null
}

export async function verifyAdminCookie(): Promise<AdminPrincipal> {
  const session = await readSession()
  if (!session) throw unauthorized("no session")
  if (!session.isAdmin) throw forbidden("not an admin")
  return { uid: session.uid, email: session.email }
}

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!header) return null
  const [scheme, token] = header.split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !token) return null
  return token
}

export async function verifyAdmin(req: NextRequest): Promise<AdminPrincipal> {
  const token = bearerToken(req)
  if (token) {
    const decoded = await adminAuth().verifyIdToken(token, true)
    const isAdmin = decoded.admin === true || decoded.role === "admin"
    if (!isAdmin) throw forbidden("not an admin")
    return { uid: decoded.uid, email: decoded.email ?? null }
  }
  // fall back to admin session cookie so browser-based polling works
  return verifyAdminCookie()
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function unauthorized(msg = "unauthorized"): HttpError {
  return new HttpError(401, msg)
}

export function forbidden(msg = "forbidden"): HttpError {
  return new HttpError(403, msg)
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  const message = err instanceof Error ? err.message : "internal error"
  return NextResponse.json({ error: message }, { status: 500 })
}
