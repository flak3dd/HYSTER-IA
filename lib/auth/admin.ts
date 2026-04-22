import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { readSession } from "@/lib/auth/session"
import { getOperatorFromAccessToken, extractTokenFromRequest } from "@/lib/auth/jwt"

export type AdminPrincipal = {
  id: string
  username: string
  role: string
}

export async function verifyAdminCookie(): Promise<AdminPrincipal> {
  const session = await readSession()
  if (!session) throw unauthorized("no session")
  if (session.role !== "ADMIN") throw forbidden("not an admin")
  return { id: session.id, username: session.username, role: session.role }
}

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!header) return null
  const [scheme, token] = header.split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !token) return null
  return token
}

export async function verifyAdmin(req: NextRequest): Promise<AdminPrincipal> {
  const token = bearerToken(req) || extractTokenFromRequest(req)
  if (token) {
    const operator = await getOperatorFromAccessToken(token)
    if (operator.role !== "ADMIN") throw forbidden("not an admin")
    return { id: operator.id, username: operator.username, role: operator.role }
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
