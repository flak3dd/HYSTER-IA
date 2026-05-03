/**
 * Client-side fetch wrapper that transparently refreshes the access token
 * on a 401 response and retries the original request once.
 *
 * Usage: import { apiFetch } from "@/lib/api/fetch"
 *        const res = await apiFetch("/api/admin/profiles")
 */

let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise

  refreshPromise = fetch("/api/auth/refresh", { method: "POST" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, init)

  if (res.status !== 401) return res

  // Try to refresh once
  const refreshed = await tryRefresh()
  if (!refreshed) {
    // Refresh itself failed — redirect to login
    if (typeof window !== "undefined") {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
    }
    return res
  }

  // Retry the original request with the new cookie
  return fetch(input, init)
}
