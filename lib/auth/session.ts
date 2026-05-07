import { cookies } from "next/headers"
import { getOperatorFromAccessToken } from "@/lib/auth/jwt"

export type SessionPrincipal = {
  id: string
  username: string
  role: string
  isActive: boolean
}

export async function readSession(): Promise<SessionPrincipal | null> {
  const store = await cookies()
  const accessToken = store.get('access_token')?.value

  if (!accessToken) return null

  try {
    const operator = await getOperatorFromAccessToken(accessToken)
    return {
      id: operator.id,
      username: operator.username,
      role: operator.role,
      isActive: operator.isActive,
    }
  } catch {
    // Invalid token - return null without clearing cookies
    // (cookie clearing must be done in a Server Action or Route Handler)
    return null
  }
}

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies()
  store.delete('access_token')
  store.delete('refresh_token')
}
