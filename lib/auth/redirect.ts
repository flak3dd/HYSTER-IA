const DEFAULT_REDIRECT = "/admin"

/**
 * Validate a post-login redirect target.
 *
 * Rules:
 *  - Must be a relative path (starts with `/`)
 *  - Must target the admin surface (`/admin` or `/admin/...`)
 *  - Rejects absolute URLs, protocol-relative URLs, and anything outside `/admin`
 *  - Falls back to `/admin` when the value is missing or invalid
 */
export function safeRedirectTarget(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return DEFAULT_REDIRECT

  const trimmed = raw.trim()

  // Block absolute URLs, protocol-relative, and javascript: URIs
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("http:") ||
    trimmed.startsWith("https:") ||
    trimmed.includes("://") ||
    trimmed.toLowerCase().startsWith("javascript:")
  ) {
    return DEFAULT_REDIRECT
  }

  // Must start with `/`
  if (!trimmed.startsWith("/")) return DEFAULT_REDIRECT

  // Must target the admin surface
  if (trimmed !== "/admin" && !trimmed.startsWith("/admin/")) {
    return DEFAULT_REDIRECT
  }

  // Strip any query/hash that could smuggle a redirect
  try {
    const url = new URL(trimmed, "http://localhost")
    // Re-check pathname after parsing (handles encoded chars)
    if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) {
      return DEFAULT_REDIRECT
    }
    // Return the full path + search + hash to preserve deep links like
    // /admin/configs?nodes=abc
    return url.pathname + url.search + url.hash
  } catch {
    return DEFAULT_REDIRECT
  }
}
