import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import { getServerConfig, setServerConfig } from "@/lib/db/server-config"
import { ServerConfig } from "@/lib/db/schema"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/* ------------------------------------------------------------------ */
/*  Helpers to safely read env groups                                  */
/* ------------------------------------------------------------------ */

function envOrNull(key: string): string | null {
  return process.env[key] ?? null
}

function mask(value: string | null): string | null {
  if (!value) return null
  if (value.length <= 8) return "***"
  return value.slice(0, 4) + "***" + value.slice(-4)
}

function readEnvSection() {
  return {
    hysteria: {
      binaryPath: envOrNull("HYSTERIA_BINARY_PATH"),
      configPath: envOrNull("HYSTERIA_CONFIG_PATH"),
      dataDir: envOrNull("HYSTERIA_DATA_DIR"),
      workDir: envOrNull("HYSTERIA_WORK_DIR"),
      trafficApiBaseUrl: envOrNull("HYSTERIA_TRAFFIC_API_BASE_URL"),
      trafficApiSecret: mask(envOrNull("HYSTERIA_TRAFFIC_API_SECRET")),
      egressProxyUrl: envOrNull("HYSTERIA_EGRESS_PROXY_URL"),
    },
    llm: {
      providerBaseUrl: envOrNull("LLM_PROVIDER_BASE_URL"),
      apiKey: mask(envOrNull("LLM_PROVIDER_API_KEY")),
      model: envOrNull("LLM_MODEL"),
      temperature: envOrNull("LLM_TEMPERATURE"),
    },
    agent: {
      maxSteps: envOrNull("AGENT_MAX_STEPS"),
      maxConcurrencyPerDomain: envOrNull("AGENT_MAX_CONCURRENCY_PER_DOMAIN"),
      taskTimeoutMs: envOrNull("AGENT_TASK_TIMEOUT_MS"),
    },
    session: {
      cookieName: envOrNull("SESSION_COOKIE_NAME"),
      cookieMaxAgeSeconds: envOrNull("SESSION_COOKIE_MAX_AGE_SECONDS"),
    },
    database: {
      url: mask(envOrNull("DATABASE_URL")),
    },
    providers: {
      hetzner: mask(envOrNull("HETZNER_API_KEY")),
      digitalocean: mask(envOrNull("DIGITALOCEAN_API_KEY")),
      vultr: mask(envOrNull("VULTR_API_KEY")),
      awsAccessKeyId: mask(envOrNull("AWS_ACCESS_KEY_ID")),
      awsRegion: envOrNull("AWS_DEFAULT_REGION"),
    },
    proxy: {
      rotatingProxyUrls: envOrNull("ROTATING_PROXY_URLS"),
    },
  }
}

async function readMailerConfig(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(join(process.cwd(), "mailer", "config.json"), "utf8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  GET — return all config sections                                   */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)

    const [serverConfig, mailerConfig] = await Promise.all([
      getServerConfig(),
      readMailerConfig(),
    ])

    return NextResponse.json({
      sections: {
        server: serverConfig,
        environment: readEnvSection(),
        mailer: mailerConfig,
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH — update a specific section                                  */
/* ------------------------------------------------------------------ */

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || !body.section) {
      return NextResponse.json({ error: "bad_request", message: "body.section is required" }, { status: 400 })
    }

    const { section, data } = body as { section: string; data: unknown }

    switch (section) {
      case "server": {
        if (!data || typeof data !== "object") {
          return NextResponse.json({ error: "bad_request" }, { status: 400 })
        }
        // Full replace or patch
        const existing = await getServerConfig()
        if (existing) {
          const merged = { ...existing, ...(data as object), updatedAt: Date.now() }
          const parsed = ServerConfig.safeParse(merged)
          if (!parsed.success) {
            return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 })
          }
          const cfg = await setServerConfig(parsed.data)
          return NextResponse.json({ section: "server", data: cfg })
        }
        // Create new
        const parsed = ServerConfig.safeParse({ ...(data as object), updatedAt: Date.now() })
        if (!parsed.success) {
          return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 })
        }
        const cfg = await setServerConfig(parsed.data)
        return NextResponse.json({ section: "server", data: cfg })
      }

      case "mailer": {
        if (!data || typeof data !== "object") {
          return NextResponse.json({ error: "bad_request" }, { status: 400 })
        }
        const mailerPath = join(process.cwd(), "mailer", "config.json")
        const existing = await readMailerConfig()
        const merged = { ...existing, ...(data as object) }
        await writeFile(mailerPath, JSON.stringify(merged, null, 2) + "\n", "utf8")
        return NextResponse.json({ section: "mailer", data: merged })
      }

      default:
        return NextResponse.json(
          { error: "bad_request", message: `Unknown section: ${section}. Editable sections: server, mailer` },
          { status: 400 },
        )
    }
  } catch (err) {
    return toErrorResponse(err)
  }
}
