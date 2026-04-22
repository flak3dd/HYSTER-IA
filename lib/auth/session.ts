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
    // Clear invalid cookies
    store.delete('access_token')
    store.delete('refresh_token')
    return null
  }
}

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies()
  store.delete('access_token')
  store.delete('refresh_token')
}
