import { cookies } from "next/headers"
import { adminAuth } from "@/lib/firebase/admin"
import { serverEnv } from "@/lib/env"

export type SessionPrincipal = {
  uid: string
  email: string | null
  isAdmin: boolean
}

export async function createSessionFromIdToken(idToken: string): Promise<{
  cookieValue: string
  maxAgeSeconds: number
  principal: SessionPrincipal
}> {
  const env = serverEnv()
  const decoded = await adminAuth().verifyIdToken(idToken, true)
  const isAdmin = decoded.admin === true || decoded.role === "admin"
  if (!isAdmin) {
    const err = new Error("not_admin")
    ;(err as Error & { status?: number }).status = 403
    throw err
  }
  const expiresIn = env.SESSION_COOKIE_MAX_AGE_SECONDS * 1000
  const cookieValue = await adminAuth().createSessionCookie(idToken, { expiresIn })
  return {
    cookieValue,
    maxAgeSeconds: env.SESSION_COOKIE_MAX_AGE_SECONDS,
    principal: {
      uid: decoded.uid,
      email: decoded.email ?? null,
      isAdmin: true,
    },
  }
}

export async function readSession(): Promise<SessionPrincipal | null> {
  const env = serverEnv()
  const store = await cookies()
  const raw = store.get(env.SESSION_COOKIE_NAME)?.value
  if (!raw) return null
  try {
    const decoded = await adminAuth().verifySessionCookie(raw, true)
    const isAdmin = decoded.admin === true || decoded.role === "admin"
    return { uid: decoded.uid, email: decoded.email ?? null, isAdmin }
  } catch {
    return null
  }
}

export async function revokeCurrentSession(): Promise<void> {
  const current = await readSession()
  if (current) {
    await adminAuth().revokeRefreshTokens(current.uid).catch(() => undefined)
  }
}
