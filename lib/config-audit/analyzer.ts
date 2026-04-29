import type { ServerConfig } from "@/lib/db/schema"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Severity = "critical" | "high" | "medium" | "low" | "info"

export interface AuditFinding {
  id: string
  category: string
  title: string
  severity: Severity
  description: string
  recommendation: string
  passed: boolean
  /** 0-100 contribution toward the overall score */
  weight: number
}

export interface AuditResult {
  /** Overall config strength score 0-100 */
  score: number
  grade: "A+" | "A" | "B" | "C" | "D" | "F"
  findings: AuditFinding[]
  summary: {
    total: number
    passed: number
    failed: number
    critical: number
    high: number
    medium: number
    low: number
    info: number
  }
  auditedAt: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function entropyScore(value: string): number {
  const chars = new Set(value.split(""))
  const len = value.length
  if (len === 0) return 0
  let entropy = 0
  for (const ch of chars) {
    const freq = value.split(ch).length - 1
    const p = freq / len
    entropy -= p * Math.log2(p)
  }
  return entropy
}

function passwordStrength(pw: string): "weak" | "fair" | "strong" {
  if (pw.length < 12) return "weak"
  const hasUpper = /[A-Z]/.test(pw)
  const hasLower = /[a-z]/.test(pw)
  const hasDigit = /\d/.test(pw)
  const hasSpecial = /[^A-Za-z0-9]/.test(pw)
  const classes = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length
  if (pw.length >= 20 && classes >= 3) return "strong"
  if (pw.length >= 16 && classes >= 2) return "strong"
  if (classes >= 3) return "fair"
  return "weak"
}

function gradeFromScore(score: number): AuditResult["grade"] {
  if (score >= 95) return "A+"
  if (score >= 85) return "A"
  if (score >= 70) return "B"
  if (score >= 55) return "C"
  if (score >= 40) return "D"
  return "F"
}

/* ------------------------------------------------------------------ */
/*  Individual checks                                                  */
/* ------------------------------------------------------------------ */

function checkTlsMode(cfg: ServerConfig): AuditFinding {
  const isAcme = cfg.tls.mode === "acme"
  return {
    id: "tls-mode",
    category: "TLS",
    title: "TLS certificate management",
    severity: isAcme ? "info" : "medium",
    description: isAcme
      ? "ACME (Let's Encrypt) auto-renewal is enabled — certificates rotate automatically."
      : "Manual TLS certificate paths are configured. Ensure certificates are valid and rotated regularly.",
    recommendation: isAcme
      ? "No action needed."
      : "Consider switching to ACME for automatic certificate management and renewal.",
    passed: true, // both modes are valid, ACME is preferred
    weight: 10,
  }
}

function checkTlsDomains(cfg: ServerConfig): AuditFinding {
  if (cfg.tls.mode !== "acme") {
    return {
      id: "tls-domains",
      category: "TLS",
      title: "ACME domain configuration",
      severity: "info",
      description: "ACME is not in use — domain check skipped.",
      recommendation: "",
      passed: true,
      weight: 0,
    }
  }
  const domains = cfg.tls.domains
  const hasWildcard = domains.some((d) => d.startsWith("*."))
  return {
    id: "tls-domains",
    category: "TLS",
    title: "ACME domain count & wildcards",
    severity: hasWildcard ? "low" : "info",
    description: `${domains.length} domain(s) configured${hasWildcard ? " (includes wildcard)" : ""}.`,
    recommendation: hasWildcard
      ? "Wildcard certificates expose all subdomains. Use explicit domain names when possible."
      : "Domain configuration looks good.",
    passed: !hasWildcard,
    weight: 5,
  }
}

function checkObfuscation(cfg: ServerConfig): AuditFinding {
  const enabled = !!cfg.obfs
  if (!enabled) {
    return {
      id: "obfs-enabled",
      category: "Obfuscation",
      title: "Protocol obfuscation",
      severity: "high",
      description: "Salamander obfuscation is disabled. Traffic is identifiable as Hysteria2/QUIC.",
      recommendation: "Enable salamander obfuscation to resist DPI-based blocking.",
      passed: false,
      weight: 15,
    }
  }
  return {
    id: "obfs-enabled",
    category: "Obfuscation",
    title: "Protocol obfuscation",
    severity: "info",
    description: "Salamander obfuscation is enabled.",
    recommendation: "No action needed.",
    passed: true,
    weight: 15,
  }
}

function checkObfsPassword(cfg: ServerConfig): AuditFinding {
  if (!cfg.obfs) {
    return {
      id: "obfs-password",
      category: "Obfuscation",
      title: "Obfuscation password strength",
      severity: "info",
      description: "Obfuscation not enabled — password check skipped.",
      recommendation: "",
      passed: true,
      weight: 0,
    }
  }
  const strength = passwordStrength(cfg.obfs.password)
  const entropy = entropyScore(cfg.obfs.password)
  const passed = strength !== "weak"
  return {
    id: "obfs-password",
    category: "Obfuscation",
    title: "Obfuscation password strength",
    severity: passed ? "info" : "high",
    description: `Password strength: ${strength} (entropy: ${entropy.toFixed(1)} bits/char, length: ${cfg.obfs.password.length}).`,
    recommendation: passed
      ? "Password meets minimum requirements."
      : "Use a longer, more complex obfuscation password (16+ chars, mixed case, digits, symbols).",
    passed,
    weight: 10,
  }
}

function checkAuthBackendHttps(cfg: ServerConfig): AuditFinding {
  const isHttps = cfg.authBackendUrl.startsWith("https://")
  const isLocalhost =
    cfg.authBackendUrl.includes("://localhost") ||
    cfg.authBackendUrl.includes("://127.0.0.1") ||
    cfg.authBackendUrl.includes("://[::1]")
  const passed = isHttps || isLocalhost
  return {
    id: "auth-https",
    category: "Authentication",
    title: "Auth backend uses HTTPS",
    severity: passed ? "info" : "critical",
    description: isLocalhost
      ? "Auth backend is on localhost — TLS is not strictly required."
      : isHttps
        ? "Auth backend communicates over HTTPS."
        : "Auth backend URL uses plain HTTP. Credentials are transmitted in cleartext.",
    recommendation: passed
      ? "No action needed."
      : "Switch the auth backend URL to HTTPS to protect authentication tokens in transit.",
    passed,
    weight: 15,
  }
}

function checkAuthInsecure(cfg: ServerConfig): AuditFinding {
  const passed = !cfg.authBackendInsecure
  return {
    id: "auth-insecure",
    category: "Authentication",
    title: "Auth backend TLS verification",
    severity: passed ? "info" : "high",
    description: cfg.authBackendInsecure
      ? "TLS certificate verification is DISABLED for the auth backend — vulnerable to MITM."
      : "TLS certificate verification is enabled for the auth backend.",
    recommendation: cfg.authBackendInsecure
      ? "Enable TLS verification (set authBackendInsecure to false) unless absolutely necessary."
      : "No action needed.",
    passed,
    weight: 10,
  }
}

function checkBandwidthLimits(cfg: ServerConfig): AuditFinding {
  const hasUp = !!cfg.bandwidth?.up
  const hasDown = !!cfg.bandwidth?.down
  const hasBoth = hasUp && hasDown
  return {
    id: "bandwidth-limits",
    category: "Bandwidth",
    title: "Bandwidth limits configured",
    severity: hasBoth ? "info" : hasUp || hasDown ? "low" : "medium",
    description: hasBoth
      ? `Upload: ${cfg.bandwidth!.up}, Download: ${cfg.bandwidth!.down}.`
      : hasUp || hasDown
        ? "Only one direction has a bandwidth limit."
        : "No bandwidth limits are set. Clients can consume unlimited bandwidth.",
    recommendation: hasBoth
      ? "No action needed."
      : "Set both upload and download bandwidth limits to prevent abuse and ensure fair usage.",
    passed: hasBoth,
    weight: 8,
  }
}

function checkMasquerade(cfg: ServerConfig): AuditFinding {
  const enabled = !!cfg.masquerade
  if (!enabled) {
    return {
      id: "masquerade",
      category: "Masquerade",
      title: "Masquerade / camouflage",
      severity: "medium",
      description: "Masquerade is disabled. Failed TLS handshakes reveal a non-standard server.",
      recommendation:
        "Enable masquerade (proxy, file, or string) so probes see a normal website instead of a connection reset.",
      passed: false,
      weight: 12,
    }
  }
  const type = cfg.masquerade!.type ?? "proxy"
  const desc =
    type === "proxy"
      ? "Proxy masquerade active — traffic is reverse-proxied to a real website."
      : type === "file"
        ? "File masquerade active — static files are served to probes."
        : "String masquerade active — a fixed response is returned to probes."
  return {
    id: "masquerade",
    category: "Masquerade",
    title: "Masquerade / camouflage",
    severity: "info",
    description: desc,
    recommendation:
      type === "proxy"
        ? "Proxy masquerade offers the best censorship resistance."
        : "Consider using proxy masquerade for the most realistic camouflage.",
    passed: true,
    weight: 12,
  }
}

function checkMasqueradeProxy(cfg: ServerConfig): AuditFinding {
  if (!cfg.masquerade || cfg.masquerade.type !== "proxy" || !cfg.masquerade.proxy) {
    return {
      id: "masquerade-proxy",
      category: "Masquerade",
      title: "Proxy masquerade target",
      severity: "info",
      description: "Not using proxy masquerade — check skipped.",
      recommendation: "",
      passed: true,
      weight: 0,
    }
  }
  const url = cfg.masquerade.proxy.url
  const isHttps = url.startsWith("https://")
  const rewriteHost = cfg.masquerade.proxy.rewriteHost
  const passed = isHttps && rewriteHost
  return {
    id: "masquerade-proxy",
    category: "Masquerade",
    title: "Proxy masquerade target configuration",
    severity: passed ? "info" : "low",
    description: `Target: ${url} | HTTPS: ${isHttps ? "yes" : "no"} | Host rewrite: ${rewriteHost ? "yes" : "no"}.`,
    recommendation: passed
      ? "Proxy masquerade is properly configured."
      : "Use an HTTPS target and enable host rewriting for realistic camouflage.",
    passed,
    weight: 5,
  }
}

function checkTrafficStatsSecret(cfg: ServerConfig): AuditFinding {
  const secret = cfg.trafficStats.secret
  const strength = passwordStrength(secret)
  const passed = strength !== "weak"
  return {
    id: "traffic-secret",
    category: "Traffic Stats",
    title: "Traffic stats API secret strength",
    severity: passed ? "info" : "high",
    description: `Secret strength: ${strength} (length: ${secret.length}).`,
    recommendation: passed
      ? "Secret meets minimum requirements."
      : "Use a strong, random secret (24+ chars) for the traffic stats API to prevent unauthorized access.",
    passed,
    weight: 10,
  }
}

function checkTrafficStatsListen(cfg: ServerConfig): AuditFinding {
  const listen = cfg.trafficStats.listen
  const isLocalOnly =
    listen.startsWith("127.0.0.1:") || listen.startsWith("[::1]:") || listen.startsWith("localhost:")
  const passed = isLocalOnly
  return {
    id: "traffic-listen",
    category: "Traffic Stats",
    title: "Traffic stats API listen address",
    severity: passed ? "info" : "medium",
    description: isLocalOnly
      ? `Traffic stats API listens on ${listen} (localhost only).`
      : `Traffic stats API listens on ${listen} — may be accessible from the network.`,
    recommendation: passed
      ? "No action needed."
      : "Bind the traffic stats API to 127.0.0.1 or [::1] to prevent external access.",
    passed,
    weight: 5,
  }
}

function checkListenPort(cfg: ServerConfig): AuditFinding {
  const match = cfg.listen.match(/:(\d+)$/)
  const port = match ? parseInt(match[1], 10) : 443
  const isStandard = port === 443
  return {
    id: "listen-port",
    category: "Network",
    title: "Server listen port",
    severity: "info",
    description: isStandard
      ? "Server listens on port 443 — standard HTTPS port, blends with normal traffic."
      : `Server listens on port ${port} — non-standard port may attract attention but avoids port conflicts.`,
    recommendation: isStandard
      ? "Standard port is good for blending in with normal HTTPS traffic."
      : "Port 443 is recommended for best traffic blending. Non-standard ports are easier to fingerprint.",
    passed: isStandard,
    weight: 5,
  }
}

/* ------------------------------------------------------------------ */
/*  Main audit function                                                */
/* ------------------------------------------------------------------ */

export function auditServerConfig(cfg: ServerConfig): AuditResult {
  const findings: AuditFinding[] = [
    checkTlsMode(cfg),
    checkTlsDomains(cfg),
    checkObfuscation(cfg),
    checkObfsPassword(cfg),
    checkAuthBackendHttps(cfg),
    checkAuthInsecure(cfg),
    checkBandwidthLimits(cfg),
    checkMasquerade(cfg),
    checkMasqueradeProxy(cfg),
    checkTrafficStatsSecret(cfg),
    checkTrafficStatsListen(cfg),
    checkListenPort(cfg),
  ]

  // Compute score: sum of (weight * passed) / sum of weights with weight > 0
  const weighted = findings.filter((f) => f.weight > 0)
  const totalWeight = weighted.reduce((sum, f) => sum + f.weight, 0)
  const earnedWeight = weighted.filter((f) => f.passed).reduce((sum, f) => sum + f.weight, 0)
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0

  const summary = {
    total: findings.length,
    passed: findings.filter((f) => f.passed).length,
    failed: findings.filter((f) => !f.passed).length,
    critical: findings.filter((f) => !f.passed && f.severity === "critical").length,
    high: findings.filter((f) => !f.passed && f.severity === "high").length,
    medium: findings.filter((f) => !f.passed && f.severity === "medium").length,
    low: findings.filter((f) => !f.passed && f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length,
  }

  return {
    score,
    grade: gradeFromScore(score),
    findings,
    summary,
    auditedAt: Date.now(),
  }
}
